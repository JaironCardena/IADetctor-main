import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';

export async function extractTextFromFile(filepath: string, originalFilename: string) {
  const ext = path.extname(originalFilename).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return fs.readFile(filepath, 'utf-8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filepath });
    return result.value;
  }

  throw new Error('Formato no soportado. Usa .txt, .md o .docx');
}
