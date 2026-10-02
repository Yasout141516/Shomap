import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { HttpError } from "../errors.js";

/**
 * Re-encodes an uploaded photo: honours EXIF orientation, then drops all metadata
 * (sharp strips EXIF/GPS unless asked to keep it), caps the size at 1600 px (FR-2.7).
 */
export async function savePhoto(uploadsDir: string, buf: Buffer): Promise<string> {
  let out: Buffer;
  try {
    out = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    throw new HttpError(415, "file_type");
  }
  await fs.mkdir(uploadsDir, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  await fs.writeFile(path.join(uploadsDir, name), out);
  return `/uploads/${name}`;
}

export async function deletePhotos(uploadsDir: string, urls: string[]) {
  await Promise.all(urls.map((u) => fs.rm(path.join(uploadsDir, path.basename(u)), { force: true })));
}
