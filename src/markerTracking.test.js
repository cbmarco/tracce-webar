import { expect, it } from 'vitest';
import { fitMarkerAlignment } from './markerTracking.js';
import { photoHomography, projectPhotoPoint } from './lib/photoAlignment.js';

const transform = [0.8, 0.03, 0.08, -0.02, 0.85, 0.06, 0.04, -0.03, 1];
function scene() {
  return [[0.1, 0.15], [0.8, 0.2], [0.45, 0.75]].map(([x, y], id) => {
    const sourceCorners = [[x, y], [x + 0.05, y], [x + 0.05, y + 0.05], [x, y + 0.05]];
    return { id, sourceCorners, corners: sourceCorners.map((p) => projectPhotoPoint(transform, p)) };
  });
}

it('fits all marker corners and reduces extrapolation error from noisy small markers', () => {
  const matches = scene();
  matches.forEach((m) => m.corners.forEach((p, i) => { p[0] += (i % 2 ? 1 : -1) * 0.0004; p[1] += (i < 2 ? 1 : -1) * 0.0003; }));
  const result = fitMarkerAlignment(matches, 1920, 1080);
  expect(result.matches).toHaveLength(3);
  const point = [0.9, 0.9];
  const expected = projectPhotoPoint(transform, point);
  const error = (h) => Math.hypot(...projectPhotoPoint(h, point).map((n, i) => n - expected[i]));
  expect(error(result.homography)).toBeLessThan(error(photoHomography(matches[0].sourceCorners, matches[0].corners)));
  expect(error(result.homography)).toBeLessThan(0.002);
});

it('rejects an inconsistent third marker and requires two coherent markers', () => {
  const matches = scene();
  matches[2].corners = matches[2].corners.map(([x, y]) => [x + 0.15, y - 0.1]);
  const result = fitMarkerAlignment(matches, 1920, 1080);
  expect(result.matches.map((m) => m.id)).toEqual([0, 1]);
  result.homography.forEach((n, i) => expect(n).toBeCloseTo(transform[i], 5));
  expect(fitMarkerAlignment(matches.slice(0, 1), 1920, 1080)).toBeNull();
  matches[1].corners[0] = [0.1, 0.9];
  expect(fitMarkerAlignment(matches.slice(0, 2), 1920, 1080)).toBeNull();
});
