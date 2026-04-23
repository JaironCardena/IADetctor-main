import multer from 'multer';
import path from 'path';

const ROOT = process.cwd();

const originalStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(ROOT, 'uploads', 'originals')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const resultStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(ROOT, 'uploads', 'results')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const uploadOriginal = multer({ storage: originalStorage, limits: { fileSize: 50 * 1024 * 1024 } });
export const uploadResults = multer({ storage: resultStorage, limits: { fileSize: 50 * 1024 * 1024 } });
