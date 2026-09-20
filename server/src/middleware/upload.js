import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

import ApiError from '../utils/ApiError.js';

/**
 * Resume upload handling.
 *
 * Three things are deliberate here:
 *
 *   1. The stored filename is generated, never taken from the upload. A filename
 *      is attacker-controlled input; using it directly invites path traversal
 *      ("../../.env") and lets one user's upload overwrite another's.
 *
 *   2. The size cap is small. Resumes are one or two pages; anything larger is
 *      either a mistake or an attempt to fill the disk.
 *
 *   3. Files land outside the source tree and are git-ignored. These are real
 *      people's resumes — they must never end up in a commit or a submission zip.
 */

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// Created at startup rather than on first upload, so a permissions problem shows
// up when the server boots instead of when a user is waiting on a request.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export { UPLOAD_DIR };

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin'}`);
  },
});

export const uploadResume = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      // Rejected before anything is written to disk.
      return cb(
        ApiError.badRequest(
          `"${ext || 'that file type'}" is not supported. Upload a PDF or a plain text file — in Word, use File > Save As and choose PDF.`
        )
      );
    }

    cb(null, true);
  },
}).single('resume');

/** Remove an uploaded file, ignoring the case where it is already gone. */
export async function deleteUpload(storedName) {
  if (!storedName) return;
  try {
    await fs.promises.unlink(path.join(UPLOAD_DIR, storedName));
  } catch (err) {
    // ENOENT means someone already deleted it — not worth failing a request over.
    if (err.code !== 'ENOENT') throw err;
  }
}
