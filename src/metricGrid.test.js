import { expect, it } from 'vitest';
import { buildMetricGrid, metricPhotoTransform } from './metricGrid.js';
import { photoHomography, projectPhotoPoint, validateMarkerAlignment } from './lib/photoAlignment.js';

const wallToPhoto = [0.006, 0.0003, 0.08, -0.0002, 0.007, 0.1, 0.0007, -0.0004, 1];
function scene() {
  const refs = [[20, 30], [100, 80]].map(([x, y], id) => ({ id, sourceCorners: [[x - 8, y - 8], [x + 8, y - 8], [x + 8, y + 8], [x - 8, y + 8]].map((p) => projectPhotoPoint(wallToPhoto, p)) }));
  return { dictionary: 'ARUCO_MIP_36h12', placement: 'wall-fixed', ...refs[0], references: refs, grid: { enabled: true, method: 'side', originId: 0, valueCm: 16, stepCm: 10 } };
}

it('recovers centimeters and a centered origin from the measured black marker side under perspective', () => {
  const marker = scene();
  const { photoToMetric, metricToPhoto } = metricPhotoTransform(marker);
  const photo = projectPhotoPoint(wallToPhoto, [80, 90]);
  const cm = projectPhotoPoint(photoToMetric, photo);
  expect(cm[0]).toBeCloseTo(60, 7); expect(cm[1]).toBeCloseTo(60, 7);
  const center = projectPhotoPoint(metricToPhoto, [0, 0]);
  const expectedCenter = projectPhotoPoint(wallToPhoto, [20, 30]);
  center.forEach((n, i) => expect(n).toBeCloseTo(expectedCenter[i], 8));
  const model = buildMetricGrid(marker);
  const line = model.lines.find((entry) => entry.axis === 'x' && entry.value === 10);
  [line.from, line.to].forEach((p) => expect(projectPhotoPoint(photoToMetric, p)[0]).toBeCloseTo(10, 7));
});

it('uses actual center-to-center distance rather than the image average of the corners', () => {
  const marker = scene();
  marker.grid = { ...marker.grid, method: 'distance', otherId: 1, valueCm: Math.hypot(80, 50) };
  const transform = metricPhotoTransform(marker);
  expect(transform.sideCm).toBeCloseTo(16, 7);
  const point = projectPhotoPoint(transform.photoToMetric, projectPhotoPoint(wallToPhoto, [100, 80]));
  expect(Math.hypot(...point)).toBeCloseTo(marker.grid.valueCm, 7);
  marker.grid.originId = 1; marker.grid.otherId = 0;
  const shifted = projectPhotoPoint(metricPhotoTransform(marker).photoToMetric, projectPhotoPoint(wallToPhoto, [20, 30]));
  expect(shifted[0]).toBeCloseTo(-80, 7); expect(shifted[1]).toBeCloseTo(-50, 7);
});

it('rejects missing scale, invalid IDs and excessive grid density without inventing dimensions', () => {
  const marker = scene();
  for (const grid of [{ ...marker.grid, valueCm: 0 }, { ...marker.grid, originId: 99 }, { ...marker.grid, method: 'distance', otherId: 0 }, { ...marker.grid, stepCm: NaN }]) {
    expect(validateMarkerAlignment({ ...marker, grid })).toBe(false);
    expect(() => metricPhotoTransform(marker, grid)).toThrow();
  }
  expect(() => buildMetricGrid({ ...marker, grid: { ...marker.grid, stepCm: 1 } })).toThrow('troppo fitta');
  expect(validateMarkerAlignment(marker)).toBe(true);
});

it('follows the chosen marker orientation rather than the photo image axes', () => {
  const marker = scene();
  marker.references[0].sourceCorners.push(marker.references[0].sourceCorners.shift());
  const center = projectPhotoPoint(wallToPhoto, [20, 30]);
  const metric = projectPhotoPoint(metricPhotoTransform(marker).photoToMetric, center);
  expect(metric[0]).toBeCloseTo(0, 8); expect(metric[1]).toBeCloseTo(0, 8);
  const unit = photoHomography(marker.sourceCorners, [[-8, -8], [8, -8], [8, 8], [-8, 8]]);
  const point = projectPhotoPoint(unit, projectPhotoPoint(wallToPhoto, [36, 30]));
  expect(point[0]).toBeCloseTo(0, 8); expect(Math.abs(point[1])).toBeCloseTo(16, 8);
});
