const MAX_DIMENSION = 1600;
const TARGET_BYTES = 1_500_000;
const MIN_QUALITY = 0.45;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere l'immagine selezionata"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Impossibile comprimere l'immagine"))),
      "image/jpeg",
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Impossibile convertire l'immagine"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resizes and compresses a browser-selected cover before it is embedded in
 * the PATCH JSON body. Keeping the binary below 1.5 MB also keeps the base64
 * request comfortably below common serverless request limits.
 */
export async function prepareCoverForUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Il file selezionato non è un'immagine");
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Compressione immagine non supportata dal browser");

  // JPEG has no alpha channel: use a white background for transparent PNGs.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.1);
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > TARGET_BYTES) {
    throw new Error("L'immagine resta troppo grande anche dopo la compressione; scegline una più piccola");
  }

  return blobToDataUrl(blob);
}
