import { Router, Request, Response } from 'express';
import { IncomingForm } from 'formidable';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { env } from '../config/env';
import { extractTextFromFile } from '../services/fileParser';
import { getHumanizerModelName, getHumanizerProviderName, humanizeWithOllama, listOllamaModels } from '../services/ollama';
import { buildHumanizePrompt } from '../utils/prompts';
import { analyzeText } from '../utils/textMetrics';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { storageService } from '../services/storage';
import { uploadOriginal } from '../middleware/upload.middleware';
import { notifyNewPaymentWhatsapp } from '../services/whatsapp';

const router = Router();

const HUMANIZED_DIR = path.join(process.cwd(), 'uploads', 'humanized');
if (!fsSync.existsSync(HUMANIZED_DIR)) fsSync.mkdirSync(HUMANIZED_DIR, { recursive: true });

const humanizeSchema = z.object({
  text: z.string().min(20, 'El texto debe tener al menos 20 caracteres.'),
  tone: z.enum(['natural', 'formal', 'casual', 'academic', 'persuasive']).default('natural'),
  strength: z.enum(['light', 'medium', 'strong']).default('medium'),
  preserveMeaning: z.boolean().default(true),
  variety: z.number().min(0).max(1).default(0.7)
});

const FIXED_HUMANIZER_SETTINGS = {
  tone: 'natural' as const,
  strength: 'medium' as const,
  preserveMeaning: true,
  variety: 0.55,
};

// ── Helper: generate a .docx buffer from plain text ──
async function generateDocx(text: string): Promise<Buffer> {
  const paragraphs = text.split(/\n+/).filter(p => p.trim()).map(p =>
    new Paragraph({
      children: [new TextRun({ text: p.trim(), size: 24, font: 'Calibri' })],
      spacing: { after: 200 },
    })
  );

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// Store generated documents in GridFS so downloads survive Render restarts.
async function storeHumanizedDocx(buffer: Buffer, filename: string): Promise<string> {
  const tempPath = path.join(HUMANIZED_DIR, filename);
  await fs.writeFile(tempPath, buffer);

  const storagePath = await storageService.uploadLocalFile(
    'results',
    filename,
    tempPath,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  const signedUrl = await storageService.getSignedUrl('results', storagePath, 7 * 24 * 60 * 60);

  if (!signedUrl) {
    throw new Error('No se pudo crear el enlace de descarga del documento humanizado.');
  }

  return signedUrl;
}

async function checkHumanizerAccess(userId: string, role: string, wordCount: number): Promise<{
  allowed: boolean;
  error?: string;
  code?: number;
}> {
  if (role === 'admin') return { allowed: true };

  const sub = await db.getSubscriptionStatus(userId);
  const hasPlanAccess = sub.active && (sub.planType === 'pro' || sub.planType === 'pro_plus');

  if (!hasPlanAccess) {
    return {
      allowed: false,
      error: 'Tu plan actual no incluye acceso al humanizador. Mejora tu suscripción para usar esta función.',
      code: 403,
    };
  }

  if (sub.humanizerWordsRemaining !== null && wordCount > sub.humanizerWordsRemaining) {
    return {
      allowed: false,
      error: 'Has alcanzado el límite mensual de palabras de tu plan.',
      code: 403,
    };
  }

  return { allowed: true };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function calculateExpressHumanizerPricing(wordCount: number): { billedWords: number; amount: number } {
  const billedWords = Math.max(1000, Math.ceil(wordCount / 1000) * 1000);
  return {
    billedWords,
    amount: Number(((billedWords / 1000) * 0.5).toFixed(2)),
  };
}

// ── List available Ollama models ──
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await listOllamaModels();
    res.json(models);
  } catch (error) {
    console.error('Error listando modelos del humanizador:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// ── Humanize plain text ──
router.post('/humanize', auth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = humanizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { text } = parsed.data;
    const { tone, strength, preserveMeaning, variety } = FIXED_HUMANIZER_SETTINGS;
    const inputWordCount = countWords(text);

    // Check subscription and limits
    const access = await checkHumanizerAccess(req.user!.userId, req.user!.role, inputWordCount);
    if (!access.allowed) {
      return res.status(access.code || 403).json({ error: access.error });
    }

    if (text.length > env.MAX_INPUT_CHARS) {
      return res.status(400).json({
        error: `El texto excede el limite de ${env.MAX_INPUT_CHARS} caracteres.`
      });
    }

    const prompt = buildHumanizePrompt({ text, tone, strength, preserveMeaning, variety });
    const output = await humanizeWithOllama(prompt);
    const outputWordCount = countWords(output);

    await db.recordHumanizerUsage(req.user!.userId, inputWordCount, outputWordCount, 'text');

    // Generate downloadable docx
    const docxBuffer = await generateDocx(output);
    const docxFilename = `humanizado_${Date.now()}.docx`;
    const downloadUrl = await storeHumanizedDocx(docxBuffer, docxFilename);

    return res.json({
      provider: getHumanizerProviderName(),
      model: getHumanizerModelName(),
      settings: { tone, strength, preserveMeaning, variety },
      inputAnalysis: analyzeText(text),
      outputAnalysis: analyzeText(output),
      output,
      downloadUrl
    });
  } catch (error) {
    console.error('Error humanizando texto:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' });
  }
});

// ── Humanize uploaded file ──
router.post('/humanize-file', auth, async (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'user') {
    const sub = await db.getSubscriptionStatus(req.user.userId);
    const hasPlanAccess = sub.active && (sub.planType === 'pro' || sub.planType === 'pro_plus');

    if (!hasPlanAccess) {
      return res.status(403).json({ error: 'Tu plan actual no incluye acceso al humanizador. Mejora tu suscripción para usar esta función.' });
    }
  }

  const form = new IncomingForm({ keepExtensions: true, multiples: false });

  form.parse(req, async (err, fields, files) => {
    let tempFilePath: string | undefined;

    try {
      if (err) {
        return res.status(400).json({ error: 'No se pudo procesar el formulario.' });
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return res.status(400).json({ error: 'Debes subir un archivo.' });
      }

      tempFilePath = file.filepath;
      const originalFilename = file.originalFilename || 'archivo.txt';
      const text = await extractTextFromFile(tempFilePath, originalFilename);
      const inputWordCount = countWords(text);

      // Full access check with word count
      const access = await checkHumanizerAccess(req.user!.userId, req.user!.role, inputWordCount);
      if (!access.allowed) {
        return res.status(access.code || 403).json({ error: access.error });
      }

      const parsed = humanizeSchema.safeParse({
        text,
        tone: FIXED_HUMANIZER_SETTINGS.tone,
        strength: FIXED_HUMANIZER_SETTINGS.strength,
        preserveMeaning: FIXED_HUMANIZER_SETTINGS.preserveMeaning,
        variety: FIXED_HUMANIZER_SETTINGS.variety,
      });

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      if (text.length > env.MAX_INPUT_CHARS) {
        return res.status(400).json({
          error: `El texto extraido excede el limite de ${env.MAX_INPUT_CHARS} caracteres.`
        });
      }

      const prompt = buildHumanizePrompt(parsed.data);
      const output = await humanizeWithOllama(prompt);
      const outputWordCount = countWords(output);

      await db.recordHumanizerUsage(req.user!.userId, inputWordCount, outputWordCount, 'file');

      // Generate downloadable docx
      const baseName = path.basename(originalFilename, path.extname(originalFilename));
      const docxFilename = `${baseName}_humanizado_${Date.now()}.docx`;
      const docxBuffer = await generateDocx(output);
      const downloadUrl = await storeHumanizedDocx(docxBuffer, docxFilename);

      return res.json({
        filename: originalFilename,
        provider: getHumanizerProviderName(),
        model: getHumanizerModelName(),
        settings: {
          tone: parsed.data.tone,
          strength: parsed.data.strength,
          preserveMeaning: parsed.data.preserveMeaning,
          variety: parsed.data.variety
        },
        inputAnalysis: analyzeText(text),
        outputAnalysis: analyzeText(output),
        output,
        downloadUrl
      });
    } catch (error) {
      console.error('Error humanizando archivo:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' });
    } finally {
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => undefined);
      }
    }
  });
});

// ── Express Async Humanizer ──
const expressUpload = uploadOriginal.fields([
  { name: 'voucher', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

router.post('/humanize/express', auth, expressUpload, async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const voucherFile = files?.voucher?.[0];
    const documentFile = files?.file?.[0];
    
    if (!voucherFile) {
      return res.status(400).json({ error: 'Debes subir un comprobante de pago.' });
    }

    const textPayload = req.body.text;
    if (!documentFile && !textPayload) {
      return res.status(400).json({ error: 'Debes subir un archivo o ingresar texto.' });
    }

    let extractedText = '';
    let originalFilename = 'texto_pegado.txt';
    let documentSize = 0;

    if (documentFile) {
      originalFilename = documentFile.originalname;
      documentSize = documentFile.size;
      extractedText = await extractTextFromFile(documentFile.path, originalFilename);
    } else {
      extractedText = textPayload as string;
      documentSize = Buffer.from(extractedText).length;
    }

    const inputWordCount = countWords(extractedText);
    if (inputWordCount < 1000) {
      return res.status(400).json({ error: 'El humanizador express requiere un minimo de 1000 palabras.' });
    }
    const pricing = calculateExpressHumanizerPricing(inputWordCount);
    
    // Parse settings
    const { tone, strength, preserveMeaning, variety } = FIXED_HUMANIZER_SETTINGS;

    // Save Voucher
    const safeVoucherName = voucherFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const voucherDestPath = `express-${Date.now()}-${safeVoucherName}`;
    const voucherStoragePath = await storageService.uploadLocalFile('vouchers', voucherDestPath, voucherFile.path, voucherFile.mimetype);

    // Save Original Document
    let docStoragePath: string;
    if (documentFile) {
      const safeDocName = documentFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const docDestPath = `${Date.now()}-${safeDocName}`;
      docStoragePath = await storageService.uploadLocalFile('originals', docDestPath, documentFile.path, documentFile.mimetype);
    } else {
      const docDestPath = `${Date.now()}-texto.txt`;
      // We must write text to a temp file and upload
      const tempTxtPath = path.join(process.cwd(), 'uploads', 'originals', docDestPath);
      await fs.writeFile(tempTxtPath, extractedText);
      docStoragePath = await storageService.uploadLocalFile('originals', docDestPath, tempTxtPath, 'text/plain');
    }

    // Create Payment
    const user = await db.getUserById(req.user!.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const payment = await db.createPayment(
      user.id,
      user.name,
      user.email,
      'express_humanizer',
      voucherStoragePath,
      pricing.amount,
      { words: pricing.billedWords, originalWords: inputWordCount }
    );

    // Create Ticket
    const ticket = await db.createTicket(
      user.id,
      user.name,
      originalFilename,
      documentSize,
      docStoragePath,
      'humanizer'
    );
    await db.updateTicketStatus(ticket.id, 'pending_payment');

    notifyNewPaymentWhatsapp(payment, user);

    // Send immediate response
    res.json({
      message: 'Pago y texto recibidos. La humanizacion ha comenzado en segundo plano y el resultado se liberara cuando el admin confirme el pago.',
      ticket,
      payment,
      pricing,
    });

    // Background Task
    Promise.resolve().then(async () => {
      try {
        const prompt = buildHumanizePrompt({ text: extractedText, tone: tone as any, strength: strength as any, preserveMeaning, variety });
        const output = await humanizeWithOllama(prompt);
        const outputWordCount = countWords(output);

        await db.recordHumanizerUsage(user.id, inputWordCount, outputWordCount, documentFile ? 'file' : 'text');
        
        const docxBuffer = await generateDocx(output);
        const baseName = path.basename(originalFilename, path.extname(originalFilename));
        const docxFilename = `${baseName}_humanizado_${Date.now()}.docx`;
        
        const tempDocxPath = path.join(HUMANIZED_DIR, docxFilename);
        await fs.writeFile(tempDocxPath, docxBuffer);
        
        const resultStoragePath = await storageService.uploadLocalFile('results', docxFilename, tempDocxPath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        
        await db.updateTicketHumanizedResult(ticket.id, resultStoragePath);
        
        // Notify admin via socket that result is ready? Or we just leave it for when they approve payment.
      } catch (err) {
        console.error(`Error en humanización de fondo para ticket ${ticket.id}:`, err);
      }
    });

  } catch (error) {
    console.error('Error en express humanizer:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' });
  }
});

// ── Download generated docx ──
router.get('/humanize/download/:filename', (req: Request, res: Response) => {
  const filePath = path.join(HUMANIZED_DIR, req.params.filename);
  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  res.download(filePath);
});

export default router;
