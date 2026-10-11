import fs from "node:fs/promises";
import path from "node:path";
import { uploadDirectory } from "../middlewares/image-upload.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Start of the image links Pixabay hands out, which stop working after 24 hours. */
export const EXPIRING_PIXABAY_URL_PREFIX = "https://pixabay.com/get/";

export function isExpiringPixabayUrl(url: string): boolean {
  return url.startsWith(EXPIRING_PIXABAY_URL_PREFIX);
}

/** Downloads an image into the uploads directory and returns its public URL, or null when it cannot be fetched. */
export async function storeRemoteImage(baseUrl: string, remoteUrl: string): Promise<string | null> {
  try {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(20_000) });
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const extension = EXTENSIONS[contentType];
    if (!response.ok || !extension) return null;

    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;

    const filename = `image-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    await fs.writeFile(path.join(uploadDirectory, filename), data);
    return `${baseUrl}/uploads/${filename}`;
  } catch {
    return null;
  }
}

/** Deletes the file behind an /uploads URL; any other URL is left alone. */
export async function removeStoredFile(url: string): Promise<void> {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return;
  }
  if (!pathname.startsWith("/uploads/")) return;
  await fs.rm(path.join(uploadDirectory, path.basename(pathname)), { force: true });
}
