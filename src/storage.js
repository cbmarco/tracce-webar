import { validatePhotoCalibration } from './lib/photoAlignment.js';

export const STORAGE_KEY = 'tracce-webar.sessions.v1';
const imagePattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/;

export function validLocalSession(session) {
  return typeof session?.id === 'string' && typeof session.imageName === 'string'
    && typeof session.photo === 'string' && imagePattern.test(session.photo)
    && Array.isArray(session.boxes) && (session.boxes.length === 0
      || validatePhotoCalibration({ version: 1, imageName: session.imageName, boxes: session.boxes }))
    && Array.isArray(session.pending) && session.pending.length <= 3
    && session.pending.every((point) => Array.isArray(point) && point.length === 2
      && point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1));
}

export function readLocalLibrary(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    if (!raw) return { sessions: [], currentId: '', error: '' };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.sessions) || !value.sessions.every(validLocalSession)) throw new Error('Dati locali non validi.');
    return { sessions: value.sessions, currentId: value.currentId || '', error: '' };
  } catch {
    return { sessions: [], currentId: '', error: 'Non riesco a leggere l’archivio locale. Puoi continuare ed esportare la sessione in un file.' };
  }
}

export function writeLocalLibrary(sessions, currentId, storage) {
  if (!sessions.every(validLocalSession)) throw new Error('Sessione locale non valida.');
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify({ version: 1, currentId, sessions })); }
  catch { throw new Error('Salvataggio locale non riuscito: spazio esaurito o memoria del browser non disponibile. Esporta la sessione e libera spazio eliminando una parete.'); }
}

export async function compactPhoto(photo) {
  // Preserve normalized corner coordinates while keeping photos small enough
  // for localStorage. This never uploads pixels or removes an existing session.
  if (photo.length < 600_000) return photo;
  const image = new Image(); image.src = photo; await image.decode();
  const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
