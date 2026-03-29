import multer from 'multer';
import { createError } from './errorHandler';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'application/octet-stream',
  'application/x-tar',
  'application/zip',
  'application/gzip',
]);

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(createError(415, `Unsupported file type: ${file.mimetype}`) as unknown as null);
    }
    cb(null, true);
  },
});
