import { Router, Request, Response } from 'express';
import { IncomingForm } from 'formidable';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { env } from '../config/env';
import { extractTextFromFile } from '../services/fileParser';
import { humanizeWithOllama, listOllamaModels } from '../services/ollama';
import { buildHumanizePrompt } from '../utils/prompts';
import { analyzeText } from '../utils/textMetrics';

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

// ── List available Ollama models ──
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await listOllamaModels();
    res.json(models);
  } catch (error) {
    console.error('Error listando modelos Ollama:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

// ── Humanize plain text ──
router.post('/humanize', async (req: Request, res: Response) => {
  try {
    const parsed = humanizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { text, tone, strength, preserveMeaning, variety } = parsed.data;

    if (text.length > env.MAX_INPUT_CHARS) {
      return res.status(400).json({
        error: `El texto excede el límite de ${env.MAX_INPUT_CHARS} caracteres.`
      });
    }

    const prompt = buildHumanizePrompt({ text, tone, strength, preserveMeaning, variety });
    const output = await humanizeWithOllama(prompt);

    // Generate downloadable docx
    const docxBuffer = await generateDocx(output);
    const docxFilename = `humanizado_${Date.now()}.docx`;
    const docxPath = path.join(HUMANIZED_DIR, docxFilename);
    await fs.writeFile(docxPath, docxBuffer);

    return res.json({
      model: env.OLLAMA_MODEL,
      settings: { tone, strength, preserveMeaning, variety },
      inputAnalysis: analyzeText(text),
      outputAnalysis: analyzeText(output),
      output,
      downloadUrl: `/api/humanize/download/${docxFilename}`
    });
  } catch (error) {
    console.error('Error humanizando texto:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' });
  }
});

// ── Humanize uploaded file ──
router.post('/humanize-file', async (req: Request, res: Response) => {
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

      const tone = String(Array.isArray(fields.tone) ? fields.tone[0] : fields.tone || 'natural') as any;
      const strength = String(Array.isArray(fields.strength) ? fields.strength[0] : fields.strength || 'medium') as any;
      const preserveMeaningRaw = Array.isArray(fields.preserveMeaning) ? fields.preserveMeaning[0] : fields.preserveMeaning;
      const varietyRaw = Array.isArray(fields.variety) ? fields.variety[0] : fields.variety;

      const parsed = humanizeSchema.safeParse({
        text,
        tone,
        strength,
        preserveMeaning: String(preserveMeaningRaw ?? 'true') === 'true',
        variety: Number(varietyRaw ?? 0.7)
      });

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      if (text.length > env.MAX_INPUT_CHARS) {
        return res.status(400).json({
          error: `El texto extraído excede el límite de ${env.MAX_INPUT_CHARS} caracteres.`
        });
      }

      const prompt = buildHumanizePrompt(parsed.data);
      const output = await humanizeWithOllama(prompt);

      // Generate downloadable docx
      const baseName = path.basename(originalFilename, path.extname(originalFilename));
      const docxFilename = `${baseName}_humanizado_${Date.now()}.docx`;
      const docxPath = path.join(HUMANIZED_DIR, docxFilename);
      const docxBuffer = await generateDocx(output);
      await fs.writeFile(docxPath, docxBuffer);

      return res.json({
        filename: originalFilename,
        model: env.OLLAMA_MODEL,
        settings: {
          tone: parsed.data.tone,
          strength: parsed.data.strength,
          preserveMeaning: parsed.data.preserveMeaning,
          variety: parsed.data.variety
        },
        inputAnalysis: analyzeText(text),
        outputAnalysis: analyzeText(output),
        output,
        downloadUrl: `/api/humanize/download/${docxFilename}`
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

// ── Download generated docx ──
router.get('/humanize/download/:filename', (req: Request, res: Response) => {
  const filePath = path.join(HUMANIZED_DIR, req.params.filename);
  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  res.download(filePath);
});

export default router;
