import path from "node:path";
import multer from "multer";

/** Kept in memory: the controller hands the bytes to the file store (disk or S3). */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
});

export function uploadedImageFilename(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
}
