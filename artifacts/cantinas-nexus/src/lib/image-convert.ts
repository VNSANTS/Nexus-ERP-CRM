/**
 * Nexus-ERP-CRM — conversão de imagens no navegador
 * Usado para converter fotos de produto para WebP antes do upload,
 * mantendo o Storage leve (mesma lógica aplicada às imagens estáticas do totem).
 */

const MAX_DIMENSION = 800; // px — suficiente para cards de produto, evita uploads gigantes
const QUALITY = 0.85;

/**
 * Recebe um File (de um <input type="file">), redimensiona (se necessário)
 * e converte para WebP. Retorna um novo File pronto para upload.
 */
export async function convertImageToWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem neste navegador.');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao converter imagem para WebP.'))),
      'image/webp',
      QUALITY,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
}
