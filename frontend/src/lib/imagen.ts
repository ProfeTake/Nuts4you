// Comprime una imagen en el navegador y la devuelve como data URI JPEG.
// Se usa para adjuntar la foto del boucher de un gasto sin subir archivos pesados
// (se guarda en base64 en la BD). Reduce el lado mayor y recomprime a JPEG.

export async function comprimirImagen(
  file: File,
  maxLado = 1280,
  calidad = 0.7,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Imagen inválida"));
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > height && width > maxLado) {
    height = Math.round((height * maxLado) / width);
    width = maxLado;
  } else if (height >= width && height > maxLado) {
    width = Math.round((width * maxLado) / height);
    height = maxLado;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // fallback: sin recomprimir
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", calidad);
}
