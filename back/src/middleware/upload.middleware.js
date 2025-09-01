import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    cb(new Error('Invalid file type. Only image files are allowed.'));
  }
};

// Create multer instance; limit file size (e.g. 6 MB)
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
});

export default upload;
