const mammoth = require('mammoth');

async function main() {
  const orig = await mammoth.extractRawText({ path: 'DocumentosPruebas/Ensayo.docx' });
  const hum = await mammoth.extractRawText({ path: 'DocumentosPruebas/Ensayo_humanizado_1776924930495.docx' });
  
  const fs = require('fs');
  fs.writeFileSync('DocumentosPruebas/original.txt', orig.value, 'utf-8');
  fs.writeFileSync('DocumentosPruebas/humanizado.txt', hum.value, 'utf-8');
  
  console.log('Archivos guardados.');
  console.log('Original:', orig.value.length, 'chars,', orig.value.split(/\s+/).length, 'words');
  console.log('Humanizado:', hum.value.length, 'chars,', hum.value.split(/\s+/).length, 'words');
}

main().catch(console.error);
