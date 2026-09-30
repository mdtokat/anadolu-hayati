"""Testler için Range destekli minimal yerel HTTP sunucusu (isteğe bağlı olarak ilk N isteği bozar)."""

from __future__ import annotations

import http.server
import re
import threading
from pathlib import Path


class RangeHandler(http.server.BaseHTTPRequestHandler):
    files: dict[str, bytes] = {}
    fail_first = 0  # ilk N isteği bağlantıyı kopararak boz
    seen = 0
    log: list[str] = []

    def log_message(self, *args) -> None:  # sessiz
        pass

    def _maybe_fail(self) -> bool:
        cls = type(self)
        cls.seen += 1
        if cls.seen <= cls.fail_first:
            self.connection.close()
            return True
        return False

    def do_HEAD(self) -> None:
        data = self.files.get(self.path)
        if data is None:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

    def do_GET(self) -> None:
        if self._maybe_fail():
            return
        data = self.files.get(self.path)
        if data is None:
            self.send_error(404)
            return
        header = self.headers.get("Range")
        if header and (m := re.match(r"bytes=(\d+)-(\d+)", header)):
            start, end = int(m.group(1)), min(int(m.group(2)), len(data) - 1)
            body = data[start : end + 1]
            self.log.append(header)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
        else:
            body = data
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve(files: dict[str, bytes], fail_first: int = 0):
    """(sunucu, temel_url) döndürür; `httpd.shutdown()` ile kapatılır."""

    class Handler(RangeHandler):
        pass

    Handler.files = files
    Handler.fail_first = fail_first
    Handler.seen = 0
    Handler.log = []
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}", Handler


__all__ = ["serve", "Path"]
