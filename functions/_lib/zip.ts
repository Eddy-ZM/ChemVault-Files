import { sanitizeVisibleName } from "../../src/lib/chemvault-files/validation";

export interface ZipEntryInput {
  name: string;
  bytes: Uint8Array;
  modifiedAt?: string | null;
}

interface CentralDirectoryEntry {
  nameBytes: Uint8Array;
  crc32: number;
  size: number;
  dosTime: number;
  dosDate: number;
  offset: number;
}

const encoder = new TextEncoder();
const crcTable = buildCrc32Table();

export function buildZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const directory: CentralDirectoryEntry[] = [];
  const usedNames = new Set<string>();
  let offset = 0;

  for (const entry of entries) {
    const name = uniqueZipName(entry.name, usedNames);
    const nameBytes = encoder.encode(name);
    const bytes = entry.bytes;
    const crc32 = computeCrc32(bytes);
    const { dosTime, dosDate } = toDosTimestamp(entry.modifiedAt);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc32, true);
    view.setUint32(18, bytes.byteLength, true);
    view.setUint32(22, bytes.byteLength, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    chunks.push(header, bytes);
    directory.push({ nameBytes, crc32, size: bytes.byteLength, dosTime, dosDate, offset });
    offset += header.byteLength + bytes.byteLength;
  }

  const centralOffset = offset;
  for (const entry of directory) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, entry.dosTime, true);
    view.setUint16(14, entry.dosDate, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.offset, true);
    header.set(entry.nameBytes, 46);
    chunks.push(header);
    offset += header.byteLength;
  }

  const centralSize = offset - centralOffset;
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, directory.length, true);
  view.setUint16(10, directory.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  chunks.push(end);

  return concat(chunks);
}

function uniqueZipName(rawName: string, usedNames: Set<string>): string {
  const baseName = sanitizeVisibleName(rawName).replace(/[\\/]+/g, "_") || "file";
  let name = baseName;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    const dot = baseName.lastIndexOf(".");
    name = dot > 0 ? `${baseName.slice(0, dot)} (${suffix})${baseName.slice(dot)}` : `${baseName} (${suffix})`;
    suffix += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function toDosTimestamp(value: string | null | undefined): { dosTime: number; dosDate: number } {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const year = Math.max(1980, Math.min(2107, safeDate.getUTCFullYear()));
  const month = safeDate.getUTCMonth() + 1;
  const day = safeDate.getUTCDate();
  const hours = safeDate.getUTCHours();
  const minutes = safeDate.getUTCMinutes();
  const seconds = Math.floor(safeDate.getUTCSeconds() / 2);
  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}
