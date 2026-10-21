import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ApiError from '../utils/apiError.js';
import { ErrorCode } from '../constants/errorCodes.js';

const UPLOADS_BASE = path.join(process.cwd(), 'uploads');
const AVATARS_DIR = path.join(UPLOADS_BASE, 'avatars');

if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Storage config: keep original extension, produce unique filename
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
    const filename = `${Date.now()}-${safeBase}${ext}`;
    cb(null, filename);
  },
});

// File filter: accept images only
const fileFilter = (_req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Invalid file type. Only image files are allowed.', [], ErrorCode.INVALID_FILE_TYPE));
  }
};

const MAX_FILE_BYTES = 6 * 1024 * 1024;

// Create multer instance; limit file size to 6 MB
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES },
});

/**
 * Multer reports its own refusals as a `MulterError`, which the error handler
 * would turn into a 500 although the caller sent the wrong thing. Each one is
 * translated here, next to the limits that cause it, into a 400 with a code a
 * client can switch on.
 */
const translateUploadError = error => {
  if (!(error instanceof multer.MulterError)) {
    return error;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    const megabytes = MAX_FILE_BYTES / (1024 * 1024);
    return new ApiError(400, `That file is too large. The limit is ${megabytes} MB.`, [], ErrorCode.FILE_TOO_LARGE);
  }

  return new ApiError(400, 'The upload was not understood.', [], ErrorCode.VALIDATION_ERROR);
};

/** Accepts one image in the `avatar` field and answers a rejected upload with a 400. */
export const uploadAvatarImage = (req, res, next) => {
  upload.single('avatar')(req, res, error => next(error ? translateUploadError(error) : undefined));
};

export default upload;
