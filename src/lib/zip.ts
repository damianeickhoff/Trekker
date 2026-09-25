import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Just enough ZIP to read a Trakt data export: the central directory walked
 * and each member inflated with Node's own zlib. Stored and deflated members
 * only, which is all a service-made export uses; Zip64 is refused rather than
 * misread, since an export that large is not a watch history. The current
 * app's reader, rather than a dependency for one upload.
 */

export type ZipEntry = { name: string; data: Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class ZipError extends Error {}

function findEocd(buffer: Buffer) {
  const earliest = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= earliest; i--) if (buffer.readUInt32LE(i) === EOCD) return i;
  return -1;
}

export function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = buffer.length >= 22 ? findEocd(buffer) : -1;
  if (eocd === -1) throw new ZipError("That file is not a zip archive");
  const count = buffer.readUInt16LE(eocd + 10);
  const directory = buffer.readUInt32LE(eocd + 16);
  if (directory === 0xffffffff) throw new ZipError("Zip64 archives are not supported");

  const entries: ZipEntry[] = [];
  let cursor = directory;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL) throw new ZipError("This zip archive looks damaged");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (buffer.readUInt32LE(localOffset) !== LOCAL) throw new ZipError("This zip archive looks damaged");
    // The local header's own lengths are the authoritative ones; some writers pad the central copy.
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(start, start + compressedSize);
    if (method === 0) entries.push({ name, data: Buffer.from(raw) });
    else if (method === 8) entries.push({ name, data: inflateRawSync(raw) });
  }
  return entries;
}
