import { invertPhotoHomography, markerReferences, photoHomography, projectPhotoPoint, validateGridSettings } from './lib/photoAlignment.js';

const unitSquare = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const photoBounds = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function metricPhotoTransform(marker, grid = marker.grid) {
  if (!validateGridSettings(marker, grid)) throw new Error('Indica una misura positiva e riferimenti diversi per la distanza.');
  const refs = markerReferences(marker);
  const origin = refs.find((ref) => ref.id === grid.originId);
  const unitToPhoto = photoHomography(unitSquare, origin.sourceCorners);
  const photoToUnit = invertPhotoHomography(unitToPhoto);
  let sideCm = grid.valueCm;
  if (grid.method === 'distance') {
    const other = refs.find((ref) => ref.id === grid.otherId);
    // A perspective quadrilateral's center is its diagonal intersection,
    // not the arithmetic mean of its image corners.
    const center = projectPhotoPoint(photoHomography(unitSquare, other.sourceCorners), [0, 0]);
    const units = Math.hypot(...projectPhotoPoint(photoToUnit, center));
    if (!Number.isFinite(units) || units < 0.01) throw new Error('I centri dei marker sono troppo vicini per impostare la scala.');
    sideCm = grid.valueCm / units;
  }
  const photoToMetric = photoToUnit.map((n, i) => i < 6 ? n * sideCm : n);
  const denominators = photoBounds.map(([x, y]) => photoToMetric[6] * x + photoToMetric[7] * y + 1);
  if (denominators.some((n) => !Number.isFinite(n) || n <= 0.00001)) throw new Error('Prospettiva troppo inclinata per una griglia su tutta la foto. Usa una foto più frontale.');
  return { photoToMetric, metricToPhoto: invertPhotoHomography(photoToMetric), sideCm };
}

export function buildMetricGrid(marker) {
  const { photoToMetric, metricToPhoto, sideCm } = metricPhotoTransform(marker);
  const bounds = photoBounds.map((point) => projectPhotoPoint(photoToMetric, point));
  const xs = bounds.map((p) => p[0]); const ys = bounds.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) throw new Error('Estensione della griglia non valida.');
  const step = marker.grid.stepCm;
  const startX = Math.ceil(minX / step); const endX = Math.floor(maxX / step);
  const startY = Math.ceil(minY / step); const endY = Math.floor(maxY / step);
  if (endX - startX + endY - startY + 2 > 160) throw new Error('Griglia troppo fitta: aumenta il passo in centimetri.');
  const lines = [];
  for (let i = startX; i <= endX; i++) {
    const value = i * step;
    lines.push({ axis: 'x', value, from: projectPhotoPoint(metricToPhoto, [value, minY]), to: projectPhotoPoint(metricToPhoto, [value, maxY]), label: projectPhotoPoint(metricToPhoto, [value, 0]) });
  }
  for (let i = startY; i <= endY; i++) {
    const value = i * step;
    lines.push({ axis: 'y', value, from: projectPhotoPoint(metricToPhoto, [minX, value]), to: projectPhotoPoint(metricToPhoto, [maxX, value]), label: projectPhotoPoint(metricToPhoto, [0, value]) });
  }
  return { lines, origin: projectPhotoPoint(metricToPhoto, [0, 0]), sideCm };
}
