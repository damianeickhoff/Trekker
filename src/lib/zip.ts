import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Just enough ZIP to read a data export.
 *
 * Node ships deflate but no archive reader, and pulling in a zip library for
 * one upload form is a poor trade. This walks the central directory and
 * inflates each entry — stored and deflated members only, which is everything
 * a service-generated export uses. Zip64 archives are rejected rather than
 * mis-read; an export that large is not a watch history.
 */

export type ZipEntry = { name: string; data: Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class ZipError extends Error {}

export function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = findEocd(buffer);
  if (eocd === -1) throw new ZipError("That file is not a zip archive");

  const count = buffer.readUInt16LE(eocd + 10);
  const directory = buffer.readUInt32LE(eocd + 16);
  if (directory === 0xffffffff) throw new ZipError("Zip64 archives are not supported");

  const entries: ZipEntry[] = [];
  let cursor = directory;

  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL) {
      throw new ZipError("This zip archive looks damaged");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    cursor += 46 + nameLength + extraLength + commentLength;

    // Directory members carry no payload.
    if (name.endsWith("/")) continue;

    if (buffer.readUInt32LE(localOffset) !== LOCAL) {
      throw new ZipError("This zip archive looks damaged");
    }

    // The local header repeats the name and extra fields, and its own lengths
    // are the authoritative ones — some writers pad the central copy.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    if (method === 0) {
      entries.push({ name, data: Buffer.from(raw) });
    } else if (method === 8) {
      entries.push({ name, data: inflateRawSync(raw) });
    }
    // Anything else (bzip2, lzma, …) is skipped rather than guessed at.
  }

  return entries;
}

/** The end-of-central-directory record, searched back through the comment. */
function findEocd(buffer: Buffer) {
  const earliest = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= earliest; i--) {
    if (buffer.readUInt32LE(i) === EOCD) return i;
  }
  return -1;
}
