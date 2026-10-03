/**
 * Veri hattında önceden hesaplanmış yapıların (Faz 12, karo akışı) ikili kapsayıcısı: JSON iskelet + hizalı ikili
 * gövde. İskeletteki her tipli dizi `{ "$t": "f32", "o": bayt konumu, "n": eleman }` işaretçisiyle gövdeye bağlanır;
 * okuyucu gövde üzerinde kopyasız görünüm (`new Float32Array(buffer, …)`) kurar. Dosya düzeni:
 *   [u32 iskelet bayt sayısı][u32 0][iskelet (UTF-8 JSON, 8'e hizalı)][gövde]
 * Saf mantık (Node ve tarayıcıda çalışır).
 */

const TYPED = {
  f32: Float32Array,
  f64: Float64Array,
  u8: Uint8Array,
  u16: Uint16Array,
  i16: Int16Array,
  u32: Uint32Array,
  i32: Int32Array,
} as const;
type TypedName = keyof typeof TYPED;

const HEADER_BYTES = 8;

function typedName(value: unknown): TypedName | null {
  if (value instanceof Float32Array) return 'f32';
  if (value instanceof Float64Array) return 'f64';
  if (value instanceof Uint8Array) return 'u8';
  if (value instanceof Uint16Array) return 'u16';
  if (value instanceof Int16Array) return 'i16';
  if (value instanceof Uint32Array) return 'u32';
  if (value instanceof Int32Array) return 'i32';
  return null;
}

function align8(n: number): number {
  return (n + 7) & ~7;
}

/** Değeri (tipli dizileri gövdeye çıkararak) tek bir `Uint8Array`'e paketler. */
export function packBlob(value: unknown): Uint8Array {
  const parts: Array<{ array: ArrayBufferView; offset: number }> = [];
  let body = 0;
  const skeleton = JSON.stringify(value, (_key, v: unknown) => {
    const name = typedName(v);
    if (name === null) return v;
    const array = v as ArrayBufferView & { length: number };
    const offset = align8(body);
    parts.push({ array, offset });
    body = offset + array.byteLength;
    return { $t: name, o: offset, n: array.length };
  });
  const json = new TextEncoder().encode(skeleton);
  const jsonBytes = align8(json.length);
  const out = new Uint8Array(HEADER_BYTES + jsonBytes + align8(body));
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, HEADER_BYTES);
  const base = HEADER_BYTES + jsonBytes;
  for (const { array, offset } of parts) {
    out.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), base + offset);
  }
  return out;
}

/** `packBlob` çıktısını açar; tipli diziler `buffer` üzerinde kopyasız görünümdür (buffer 8'e hizalı başlamalı). */
export function unpackBlob<T = unknown>(buffer: ArrayBuffer): T {
  const jsonLength = new DataView(buffer).getUint32(0, true);
  const text = new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES, jsonLength));
  const base = HEADER_BYTES + align8(jsonLength);
  return JSON.parse(text, (_key, v: unknown) => {
    if (typeof v === 'object' && v !== null && '$t' in v) {
      const ref = v as { $t: TypedName; o: number; n: number };
      const Ctor = TYPED[ref.$t];
      if (Ctor !== undefined && typeof ref.o === 'number' && typeof ref.n === 'number') {
        return new Ctor(buffer, base + ref.o, ref.n);
      }
    }
    return v;
  }) as T;
}
