"""HTTP Range istekleriyle okunan salt-okunur dosya (pyarrow'a dosya nesnesi olarak verilebilir).

Büyük Parquet dosyalarının (yüzlerce MB) yalnızca gereken kısımlarını (altbilgi ve ilgili satır
grupları) indirmek için kullanılır. Yalnızca standart kütüphane.
"""

from __future__ import annotations

import http.client
import io
import time
import urllib.error
import urllib.request
from collections.abc import Callable

USER_AGENT = "anadolu-hayati-data-pipeline/1.0"


class HttpRangeFile(io.RawIOBase):
    """`url`'yi blok blok (Range) okur. Okunan bloklar bellekte tutulur; geçici ağ hataları yeniden denenir."""

    def __init__(
        self,
        url: str,
        block_size: int = 1 << 20,
        retries: int = 5,
        timeout: float = 60,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        super().__init__()
        self.url = url
        self.block_size = block_size
        self.retries = retries
        self.timeout = timeout
        self._sleep = sleep
        self._pos = 0
        self._blocks: dict[int, bytes] = {}
        #: İstatistik: yapılan Range isteği sayısı ve indirilen bayt.
        self.requests = 0
        self.bytes_downloaded = 0
        self.size = self._head_size()

    # -- ağ ----------------------------------------------------------------

    def _with_retries(self, action: Callable[[], object]) -> object:
        last: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                return action()
            except (
                urllib.error.URLError,
                TimeoutError,
                OSError,
                ConnectionError,
                http.client.HTTPException,  # IncompleteRead: vekil sunucu bağlantıyı yarıda kesti
            ) as error:
                last = error
                if attempt < self.retries:
                    self._sleep(1.5 * attempt)
        raise OSError(f"{self.url}: {self.retries} denemede okunamadı: {last}")

    def _head_size(self) -> int:
        def head() -> int:
            request = urllib.request.Request(self.url, method="HEAD", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return int(response.headers["Content-Length"])

        return int(self._with_retries(head))  # type: ignore[arg-type]

    def _fetch(self, start: int, end: int) -> bytes:
        """[start, end] (dahil) bayt aralığını indirir."""

        def get() -> bytes:
            request = urllib.request.Request(
                self.url, headers={"User-Agent": USER_AGENT, "Range": f"bytes={start}-{end}"}
            )
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                data = response.read()
            if len(data) != end - start + 1:
                raise OSError(f"eksik veri: {len(data)} bayt, beklenen {end - start + 1}")
            return data

        data = self._with_retries(get)
        self.requests += 1
        self.bytes_downloaded += len(data)  # type: ignore[arg-type]
        return data  # type: ignore[return-value]

    # -- io.RawIOBase --------------------------------------------------------

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self._pos = offset
        elif whence == io.SEEK_CUR:
            self._pos += offset
        else:
            self._pos = self.size + offset
        return self._pos

    def read(self, n: int = -1) -> bytes:
        if n is None or n < 0:
            n = self.size - self._pos
        n = min(n, self.size - self._pos)
        if n <= 0:
            return b""

        first = self._pos // self.block_size
        last = (self._pos + n - 1) // self.block_size
        # Eksik blokları bitişik gruplar hâlinde tek istekle indir.
        missing = [b for b in range(first, last + 1) if b not in self._blocks]
        group_start = 0
        while group_start < len(missing):
            group_end = group_start
            while group_end + 1 < len(missing) and missing[group_end + 1] == missing[group_end] + 1:
                group_end += 1
            start = missing[group_start] * self.block_size
            end = min((missing[group_end] + 1) * self.block_size, self.size) - 1
            data = self._fetch(start, end)
            for block in range(missing[group_start], missing[group_end] + 1):
                offset = block * self.block_size - start
                self._blocks[block] = data[offset : offset + self.block_size]
            group_start = group_end + 1

        chunks: list[bytes] = []
        remaining = n
        position = self._pos
        while remaining > 0:
            block = position // self.block_size
            offset = position - block * self.block_size
            piece = self._blocks[block][offset : offset + remaining]
            chunks.append(piece)
            position += len(piece)
            remaining -= len(piece)
        self._pos = position
        return b"".join(chunks)

    def readinto(self, buffer) -> int:  # type: ignore[no-untyped-def]
        data = self.read(len(buffer))
        buffer[: len(data)] = data
        return len(data)
