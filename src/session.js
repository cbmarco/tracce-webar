import { validatePhotoCalibration } from './lib/photoAlignment.js';

export const cornerNames = ['alto a sinistra', 'alto a destra', 'basso a destra', 'basso a sinistra'];

export function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Non riesco a leggere il file.'));
    reader.readAsDataURL(file);
  });
}

export async function readSession(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error('Il file supera 40 MB.');
  const value = JSON.parse(await file.text());
  if (!validatePhotoCalibration(value)) throw new Error('Il file non contiene riferimenti validi.');
  if (value.imageDataUrl && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value.imageDataUrl)) throw new Error('La foto salvata ha un formato non supportato.');
  return value;
}

export function downloadSession(calibration, photo) {
  const blob = new Blob([`${JSON.stringify({ ...calibration, imageDataUrl: photo }, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${calibration.imageName.replace(/\.[^.]+$/, '')}-tracce.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
