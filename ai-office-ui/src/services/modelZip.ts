import { unzipSync } from 'fflate';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function unzipModelFiles(bytes: Uint8Array): Map<string, Uint8Array> {
  const archive = unzipSync(bytes);
  const names = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Honor Info-ZIP's Unicode Path extra field. Legacy MMD archives often use
  // GBK/Shift-JIS names plus this field rather than the ZIP UTF-8 name flag.
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    if (end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue;
    let cursor = view.getUint32(end + 16, true);
    const count = view.getUint16(end + 10, true);
    for (let file = 0; file < count && cursor + 46 <= bytes.length; file++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const flags = view.getUint16(cursor + 8, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const nameStart = cursor + 46; const extraStart = nameStart + nameLength; const extraEnd = extraStart + extraLength;
      if (extraEnd + commentLength > bytes.length) break;
      const rawName = bytes.subarray(nameStart, extraStart);
      const original = flags & 0x800 ? new TextDecoder().decode(rawName) : Array.from(rawName, (byte) => String.fromCharCode(byte)).join('');
      for (let field = extraStart; field + 4 <= extraEnd;) {
        const kind = view.getUint16(field, true); const length = view.getUint16(field + 2, true); const start = field + 4;
        if (start + length > extraEnd) break;
        if (kind === 0x7075 && length >= 5 && bytes[start] === 1 && view.getUint32(start + 1, true) === crc32(rawName)) {
          try { names.set(original, new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start + 5, start + length))); } catch { /* Keep the original name if the metadata is invalid. */ }
        }
        field = start + length;
      }
      cursor = extraEnd + commentLength;
    }
    break;
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(archive)) {
    const resolved = (names.get(name) || name).replace(/\\/g, '/').replace(/^\.\//, '');
    if (files.has(resolved)) throw new Error(`The model ZIP contains duplicate file paths: ${resolved}`);
    files.set(resolved, data);
  }
  return files;
}
