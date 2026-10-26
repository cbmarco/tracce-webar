import { expect, it } from 'vitest';
import { trackPhotoPoints } from './photoTracker.js';

it('tracks a translated textured corner and rejects textureless images', () => {
  const width = 80; const height = 80;
  const previous = new Uint8Array(width * height);
  const next = new Uint8Array(width * height);
  let seed = 17;
  for (let y = 20; y < 60; y++) for (let x = 20; x < 60; x++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    previous[y * width + x] = seed % 256;
    next[(y + 2) * width + x + 3] = seed % 256;
  }
  expect(trackPhotoPoints(previous, next, [[0.5, 0.5]], width, height)).toEqual([[43 / 80, 42 / 80]]);
  expect(() => trackPhotoPoints(new Uint8Array(width * height), next, [[0.5, 0.5]], width, height)).toThrow();
});
