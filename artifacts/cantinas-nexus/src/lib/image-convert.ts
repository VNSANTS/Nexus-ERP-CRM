/**
 * Nexus-ERP-CRM — conversão de imagens no navegador
 * Usado para converter fotos de produto para WebP antes do upload,
 * mantendo o Storage leve (mesma lógica aplicada às imagens estáticas do totem).
 */

const MAX_DIMENSION = 800; // px — suficiente para cards de produto, evita uploads gigantes
const QUALITY = 0.85;

// SEGURANÇA: limite de tamanho e tipo aceito antes de processar — sem
// isso, um arquivo gigante (ou que não é imagem de verdade) trava a aba
// do navegador tentando decodificar, e createImageBitmap só falha depois
// de já ter tentado o trabalho pesado.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Recebe um File (de um <input type="file">), valida tamanho/tipo,
 * redimensiona (se necessário) e converte para WebP. Retorna um novo File
 * pronto para upload.
 */
export async function convertImageToWebp(file: File): Promise<File> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Imagem muito grande. O tamanho máximo é 10 MB.');
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error('Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF.');
  }

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
