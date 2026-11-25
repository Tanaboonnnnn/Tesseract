import { inflateRawSync, crc32 } from "node:zlib";
import { BrainError } from "./errors.ts";
import { ClassroomBundleSchema } from "./classroom.ts";

export const COURSE_BYTES_LIMIT = 256 * 1024;
const name = Buffer.from("course.json");
const invalid = (): never => { throw new BrainError("VALIDATION", "Use a version 1 course.json or a ZIP containing only course.json at its root."); };

/** One regular member, no filename traversal or filesystem extraction, bounded output. */
export function readCoursePackage(bytes: Buffer, format: "zip" | "json") {
  if (!bytes.length || bytes.length > COURSE_BYTES_LIMIT) return invalid();
  try {
    let data = bytes;
    if (format === "zip") {
      const e = bytes.length - 22;
      if (e < 0 || bytes.readUInt32LE(e) !== 0x06054b50 ||
          bytes.readUInt16LE(e+4) || bytes.readUInt16LE(e+6) || bytes.readUInt16LE(e+20) ||
          bytes.readUInt16LE(e+8) !== 1 || bytes.readUInt16LE(e+10) !== 1) return invalid();
      const off = bytes.readUInt32LE(e+16);
      if (off < 30 + name.length || off + bytes.readUInt32LE(e+12) !== e || off + 46 > e ||
          bytes.readUInt32LE(off) !== 0x02014b50 || bytes.readUInt32LE(off+42) !== 0) return invalid();
      const flags = bytes.readUInt16LE(off+8), method = bytes.readUInt16LE(off+10);
      const crc = bytes.readUInt32LE(off+16), size = bytes.readUInt32LE(off+20), out = bytes.readUInt32LE(off+24);
      const nm = bytes.readUInt16LE(off+28), ex = bytes.readUInt16LE(off+30), cm = bytes.readUInt16LE(off+32);
      const fileType = (bytes.readUInt32LE(off+38) >>> 16) & 0o170000;
      if ((flags & ~0x800) || (method !== 0 && method !== 8) || out > COURSE_BYTES_LIMIT ||
          nm !== name.length || off+46+nm+ex+cm !== e || !bytes.subarray(off+46,off+46+nm).equals(name) ||
          bytes.readUInt16LE(off+34) || (fileType && fileType !== 0o100000) ||
          bytes.readUInt32LE(0) !== 0x04034b50 || bytes.readUInt16LE(6) !== flags ||
          bytes.readUInt16LE(8) !== method || bytes.readUInt32LE(14) !== crc || bytes.readUInt32LE(18) !== size ||
          bytes.readUInt32LE(22) !== out || bytes.readUInt16LE(26) !== nm ||
          !bytes.subarray(30,30+nm).equals(name)) return invalid();
      const start = 30 + nm + bytes.readUInt16LE(28);
      if (start+size !== off) return invalid();
      const compressed = bytes.subarray(start, off);
      data = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: COURSE_BYTES_LIMIT });
      if (data.length !== out || crc32(data) !== crc) return invalid();
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
    const result = ClassroomBundleSchema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new BrainError("VALIDATION", "Invalid course manifest: " + (issue?.path.join(".") || "course.json") + ": " + (issue?.message ?? "Unknown error"));
    }
    return result.data;
  } catch (error) {
    if (error instanceof BrainError) throw error;
    return invalid();
  }
}
