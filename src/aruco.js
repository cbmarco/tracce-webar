import aruco from 'js-aruco2';
import { ARUCO_DICTIONARY, markerReferences } from './lib/photoAlignment.js';
import { fitMarkerAlignment } from './markerTracking.js';

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

export function markerFromPhotoPixels(imageData, detector = createMarkerDetector()) {
  const detected = detector.detect(imageData);
  if (!detected.length) throw new Error('Nessun marker leggibile nella foto. Avvicinati, lascia visibile il bordo bianco e scatta di nuovo, oppure usa i riferimenti delle scatole.');
  if (new Set(detected.map((marker) => marker.id)).size !== detected.length) throw new Error('Ci sono più marker con lo stesso ID. Ogni marker della foto deve avere un ID diverso.');
  if (detected.length > 12) throw new Error('Usa al massimo 12 marker per foto.');
  const references = detected.sort((a, b) => a.id - b.id).map(({ id }) => {
    const result = findMarker(imageData, id, { detect: () => detected });
    if (!result.marker) throw new Error(`Il marker ${id} nella foto è troppo piccolo o vicino al bordo. Scatta di nuovo con tutti i marker interi e più grandi.`);
    return { id, sourceCorners: result.marker.corners };
  });
  return { dictionary: ARUCO_DICTIONARY, ...references[0], placement: 'wall-fixed', ...(references.length > 1 ? { references } : {}) };
}

export function findTrackedMarkers(imageData, alignment, detector) {
  const refs = markerReferences(alignment);
  const detected = detector.detect(imageData);
  const matches = [];
  let failure = detected.length ? 'wrong-id' : 'missing';
  for (const reference of refs) {
    const result = findMarker(imageData, reference.id, { detect: () => detected });
    if (result.state === 'ambiguous') return { state: 'ambiguous', marker: null, count: 0 };
    if (result.marker) matches.push({ ...reference, corners: result.marker.corners });
    else if (['too-small', 'clipped'].includes(result.state)) failure = result.state;
  }
  if (matches.length < 2) return { state: matches.length ? 'insufficient' : failure, marker: null, count: matches.length };
  const fitted = fitMarkerAlignment(matches, imageData.width, imageData.height);
  if (!fitted) return { state: 'inconsistent', marker: null, count: matches.length };
  return { state: 'found', marker: fitted.matches[0], matches: fitted.matches, homography: fitted.homography, count: fitted.matches.length };
}

export async function markerFromPhoto(source) {
  const image = new Image(); image.src = source; await image.decode();
  const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return markerFromPhotoPixels(context.getImageData(0, 0, canvas.width, canvas.height));
}

export function downloadMarker(id) {
  const url = URL.createObjectURL(new Blob([markerSvg(id)], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url; link.download = `aruco-mip36h12-${id}.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function markerA4Svg(id) {
  const marker = markerSvg(id).replace('<svg ', '<svg x="5" y="35" width="200" height="200" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
<rect width="210" height="297" fill="white"/>
<g font-family="sans-serif" fill="black">
<text x="10" y="14" font-size="6">TRACCE · Dima A4 · ID ${id}</text>
<text x="10" y="23" font-size="3.8">Stampa al 100% / dimensioni effettive. Non adattare.</text>
${marker}
<text x="10" y="246" font-size="4.5">Lato del quadrato nero: 160 mm (16 cm)</text>
<text x="10" y="254" font-size="3.5">Misura il nero, senza il bordo bianco. Fissa sul piano della parete.</text>
<text x="55" y="266" font-size="4">Controllo scala: 100 mm</text>
<path d="M55 270H155 M55 267V273 M155 267V273" fill="none" stroke="black" stroke-width="0.4"/>
<text x="10" y="286" font-size="3.5">Verifica la stampa con un righello prima di impostare la griglia.</text>
</g></svg>`;
}

export function downloadMarkerA4(id) {
  const url = URL.createObjectURL(new Blob([markerA4Svg(id)], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url; link.download = `aruco-mip36h12-${id}-A4.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadMarkerPng(id) {
  const source = markerSvg(id);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  // 38 dots per dictionary cell; only the SVG's one-cell quiet zone remains.
  canvas.width = canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 384, 384);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 2, 2, 380, 380);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Impossibile creare il PNG. Riprova a scaricarlo.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `aruco-mip36h12-${id}-384px.png`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
