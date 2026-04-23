import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ORIGINAL_UPLOAD_MAX_BYTES, RESULTS_UPLOAD_MAX_BYTES } from '../../shared/constants/ticketRules';

const originalsDir = path.join(process.cwd(), 'uploads', 'originals');
const resultsDir = path.join(process.cwd(), 'uploads', 'results');
const vouchersDir = path.join(process.cwd(), 'uploads', 'vouchers');

for (const dir of [originalsDir, resultsDir, vouchersDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const uploadOriginal = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, originalsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: ORIGINAL_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF, DOC o DOCX'));
  },
});

export const uploadResults = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, resultsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: RESULTS_UPLOAD_MAX_BYTES },
});

export const uploadVoucher = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, vouchersDir),
    filename: (_req, file, cb) => cb(null, `voucher-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF'));
  },
});
