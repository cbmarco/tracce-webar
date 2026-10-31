// Points are normalized image coordinates, ordered clockwise per box.
export function validatePhotoCalibration(value) {
  return value?.version === 1 && typeof value.imageName === 'string'
    && (value.marker == null || validateMarkerAlignment(value.marker))
    && Array.isArray(value.boxes) && (value.boxes.length > 0 || validateMarkerAlignment(value.marker)) && value.boxes.length <= 20
    && value.boxes.every((box) => Array.isArray(box.points) && box.points.length === 4
      && box.points.every((p) => Array.isArray(p) && p.length === 2
        && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
      && polygonArea(box.points) > 0.000001 && isConvex(box.points));
}

function isConvex(points) {
  const cross = points.map((p, i) => {
    const q = points[(i + 1) % 4]; const r = points[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  return cross.every((n) => n > 1e-10) || cross.every((n) => n < -1e-10);
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - p[1] * q[0];
  }, 0)) / 2;
}

// Least squares homography. Normalized coordinates keep the system well scaled.
export function photoHomography(source, target) {
  if (source.length < 4 || source.length !== target.length) throw new Error('Servono almeno quattro corrispondenze.');
  const rows = []; const values = [];
  source.forEach(([x, y], i) => {
    const [u, v] = target[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(u, v);
  });
  const a = Array.from({ length: 8 }, (_, i) => [
    ...Array.from({ length: 8 }, (_, j) => rows.reduce((s, row) => s + row[i] * row[j], 0)),
    rows.reduce((s, row, k) => s + row[i] * values[k], 0),
  ]);
  for (let i = 0; i < 8; i++) {
    let pivot = i;
    for (let j = i + 1; j < 8; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    if (Math.abs(a[pivot][i]) < 1e-12) throw new Error('Riferimenti degeneri: scegli angoli più distanti e non allineati.');
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const scale = a[i][i];
    for (let k = i; k <= 8; k++) a[i][k] /= scale;
    for (let j = 0; j < 8; j++) if (j !== i) {
      const factor = a[j][i];
      for (let k = i; k <= 8; k++) a[j][k] -= factor * a[i][k];
    }
  }
  return [...a.map((row) => row[8]), 1];
}

export function projectPhotoPoint(h, [x, y]) {
  const w = h[6] * x + h[7] * y + 1;
  if (Math.abs(w) < 1e-9) throw new Error('Proiezione non valida.');
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function photoCssMatrix(h, sourceWidth, sourceHeight, width, height) {
  return `matrix3d(${[
    h[0] * width / sourceWidth, h[3] * height / sourceWidth, 0, h[6] / sourceWidth,
    h[1] * width / sourceHeight, h[4] * height / sourceHeight, 0, h[7] / sourceHeight,
    0, 0, 1, 0, h[2] * width, h[5] * height, 0, 1,
  ].join(',')})`;
}

export function invertPhotoHomography(h) {
  const [a, b, c, d, e, f, g, k, i] = h;
  const inverse = [e * i - f * k, c * k - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * k - e * g, b * g - a * k, a * e - b * d];
  const determinant = a * inverse[0] + b * inverse[3] + c * inverse[6];
  if (Math.abs(determinant) < 1e-12 || Math.abs(inverse[8]) < 1e-12) throw new Error('Proiezione non invertibile.');
  return inverse.map((n) => n / inverse[8]);
}

// Surface hits supply the position, orientation and extent in WebXR meters.
// Manual dimensions are not needed for photo alignment.
export function wallPhotoPlane(box, hits) {
  if (hits.length !== 4 || !hits.every((p) => p.length === 3 && p.every(Number.isFinite))) throw new Error('Servono quattro punti sulla parete.');
  const sub = (a, b) => a.map((n, i) => n - b[i]);
  const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
  const length = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = length(a); if (n < 0.01) throw new Error('Angoli troppo vicini. Ripeti l’aggancio.'); return a.map((v) => v / n); };
  const x = unit(sub(hits[1], hits[0]));
  const down = sub(hits[3], hits[0]);
  const y = unit(down.map((n, i) => n - dot(down, x) * x[i]));
  const normal = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (hits.some((p) => Math.abs(dot(sub(p, hits[0]), normal)) > 0.025)) throw new Error('I punti non sono sulla stessa parete. Ripeti l’aggancio.');
  const origin = hits[0];
  const target = hits.map((point) => {
    const delta = sub(point, origin);
    return [dot(delta, x), dot(delta, y)];
  });
  if (!isConvex(target) || polygonArea(target) < 0.000001) throw new Error('Gli angoli sulla parete non sono validi. Ripeti l’aggancio nello stesso ordine della foto.');
  const homography = photoHomography(box.points, target);
  const photoCorners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const denominators = photoCorners.map(([u, v]) => homography[6] * u + homography[7] * v + 1);
  if (denominators.some((w) => w <= 0.00001)) throw new Error('Prospettiva troppo inclinata. Scegli una foto più frontale o correggi gli angoli.');
  const bounds = photoCorners.map((p) => projectPhotoPoint(homography, p));
  if (bounds.flat().some((n) => !Number.isFinite(n) || Math.abs(n) > 30)) throw new Error('Proiezione troppo estesa. Correggi gli angoli sulla foto.');
  return { origin, x, y, normal, homography, bounds };
}


export const ARUCO_DICTIONARY = 'ARUCO_MIP_36h12';

function validMarkerReference(marker) {
  return marker?.dictionary === ARUCO_DICTIONARY && Number.isInteger(marker.id) && marker.id >= 0 && marker.id < 250
    && ['plate-bottom-left', 'wall-fixed'].includes(marker.placement) && Array.isArray(marker.sourceCorners) && marker.sourceCorners.length === 4
    && marker.sourceCorners.every((point) => Array.isArray(point) && point.length === 2
      && point.every((n) => Number.isFinite(n) && Math.abs(n) <= 16))
    && polygonArea(marker.sourceCorners) > 0.000001 && isConvex(marker.sourceCorners);
}

export function markerReferences(marker) {
  return marker?.references ?? (marker ? [{ id: marker.id, sourceCorners: marker.sourceCorners }] : []);
}

export function validateMarkerAlignment(marker) {
  if (!validMarkerReference(marker)) return false;
  if (marker.grid != null && !validateGridSettings(marker, marker.grid)) return false;
  if (marker.references === undefined) return true;
  const refs = marker.references;
  return Array.isArray(refs) && refs.length >= 1 && refs.length <= 12
    && refs.every((ref) => validMarkerReference({ dictionary: marker.dictionary, placement: marker.placement, ...ref }))
    && new Set(refs.map((ref) => ref.id)).size === refs.length
    && refs[0].id === marker.id && JSON.stringify(refs[0].sourceCorners) === JSON.stringify(marker.sourceCorners);
}

export function validateGridSettings(marker, grid) {
  const ids = markerReferences(marker).map((ref) => ref.id);
  return grid != null && typeof grid.enabled === 'boolean'
    && ['side', 'distance'].includes(grid.method) && ids.includes(grid.originId)
    && Number.isFinite(grid.valueCm) && grid.valueCm >= 0.01 && grid.valueCm <= 100000
    && Number.isFinite(grid.stepCm) && grid.stepCm >= 1 && grid.stepCm <= 1000
    && (grid.method !== 'distance' || (ids.includes(grid.otherId) && grid.otherId !== grid.originId));
}

export function markerSourceFromFrame(id, photoPoints, framePoints, markerPoints) {
  const quad = (points) => validatePhotoCalibration({ version: 1, imageName: 'reference', boxes: [{ points }] });
  if (!quad(photoPoints) || !quad(framePoints) || !quad(markerPoints)) throw new Error('Seleziona quattro angoli validi nello stesso ordine della foto.');
  const frameToPhoto = photoHomography(framePoints, photoPoints);
  const marker = { dictionary: ARUCO_DICTIONARY, id, placement: 'plate-bottom-left', sourceCorners: markerPoints.map((point) => projectPhotoPoint(frameToPhoto, point)) };
  if (!validateMarkerAlignment(marker)) throw new Error('Collegamento non valido. Correggi gli angoli e riprova.');
  return marker;
}
