import aruco from 'js-aruco2';
import { ARUCO_DICTIONARY } from './lib/photoAlignment.js';

const { AR } = aruco;
let dictionary;

export function markerSvg(id) {
  if (!Number.isInteger(id) || id < 0 || id >= 250) throw new Error('Scegli un ID da 0 a 249.');
  dictionary ??= new AR.Dictionary(ARUCO_DICTIONARY);
  return dictionary.generateSVG(id).replace('<svg ', '<svg shape-rendering="crispEdges" ');
}

export function createMarkerDetector() {
  return new AR.Detector({ dictionaryName: ARUCO_DICTIONARY, maxHammingDistance: 3 });
}

export function findMarker(imageData, id, detector) {
  const markers = detector.detect(imageData);
  const matches = markers.filter((marker) => marker.id === id);
  if (matches.length > 1) return { state: 'ambiguous', marker: null };
  if (!matches.length) return { state: markers.length ? 'wrong-id' : 'missing', marker: null };
  const pixels = matches[0].corners;
  if (pixels.some((point, i) => Math.hypot(point.x - pixels[(i + 1) % 4].x, point.y - pixels[(i + 1) % 4].y) < 24)) return { state: 'too-small', marker: null };
  const corners = pixels.map(({ x, y }) => [x / imageData.width, y / imageData.height]);
  // Clipped or tiny corners make extrapolating a whole wall unreliable.
  if (corners.some((point) => point.some((n) => n < 0.005 || n > 0.995))) return { state: 'clipped', marker: null };
  return { state: 'found', marker: { id, corners } };
}

export function downloadMarker(id) {
  const url = URL.createObjectURL(new Blob([markerSvg(id)], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url; link.download = `aruco-mip36h12-${id}.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadMarkerPng(id) {
  const source = markerSvg(id);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  // 384 dots is the common thermal print width. Keep an extra white margin.
  canvas.width = canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 384, 384);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 32, 32, 320, 320);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Impossibile creare il PNG. Riprova a scaricarlo.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `aruco-mip36h12-${id}-384px.png`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
