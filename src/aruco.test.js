import { describe, expect, it } from 'vitest';
import { createMarkerDetector, findMarker, findTrackedMarkers, markerFromPhotoPixels, markerSvg } from './aruco.js';

// Rasterize the generated SVG in memory: no reference photos or binary fixtures.
function syntheticMarker(id, rotation = 0, duplicate = false, secondId = id) {
  const width = 500; const height = 400;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  function draw(offsetX, offsetY, drawId = id) {
    for (const match of markerSvg(drawId).matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(white|black)"\/>/g)) {
      const [, x, y, w, h, color] = match;
      for (let row = Number(y) * 12; row < (Number(y) + Number(h)) * 12; row++) {
        for (let col = Number(x) * 12; col < (Number(x) + Number(w)) * 12; col++) {
          let px = col; let py = row;
          for (let r = 0; r < rotation; r++) [px, py] = [119 - py, px];
          const index = ((offsetY + py) * width + offsetX + px) * 4;
          data[index] = data[index + 1] = data[index + 2] = color === 'white' ? 255 : 0;
        }
      }
    }
  }
  draw(190, 140); if (duplicate) draw(30, 30, secondId);
  return { data, width, height };
}

describe('ArUco print and detection', () => {
  it('detects printed markers in all rotations with stable corner order', () => {
    for (let rotation = 0; rotation < 4; rotation++) {
      const result = findMarker(syntheticMarker(7, rotation), 7, createMarkerDetector());
      expect(result.state).toBe('found');
      expect(result.marker.id).toBe(7);
      let expected = [12, 12];
      for (let i = 0; i < rotation; i++) expected = [119 - expected[1], expected[0]];
      expect(result.marker.corners[0][0] * 500).toBeCloseTo(190 + expected[0], -1);
      expect(result.marker.corners[0][1] * 400).toBeCloseTo(140 + expected[1], -1);
    }
  });
  it('does not attach to another ID, duplicate ID or missing marker', () => {
    const detector = createMarkerDetector();
    expect(findMarker(syntheticMarker(7), 8, detector).state).toBe('wrong-id');
    expect(findMarker(syntheticMarker(7, 0, true), 7, detector).state).toBe('ambiguous');
    const blank = syntheticMarker(7); blank.data.fill(255);
    expect(findMarker(blank, 7, detector)).toEqual({ state: 'missing', marker: null });
    expect(() => markerSvg(250)).toThrow();
  });
});

it('uses the marker in a new photo directly and refuses missing or duplicate references', () => {
  const marker = markerFromPhotoPixels(syntheticMarker(7, 1));
  expect(marker).toMatchObject({ id: 7, placement: 'wall-fixed', dictionary: 'ARUCO_MIP_36h12' });
  expect(marker.sourceCorners).toHaveLength(4);
  expect(() => markerFromPhotoPixels(syntheticMarker(7, 0, true))).toThrow('stesso ID');
  const blank = syntheticMarker(7); blank.data.fill(255);
  expect(() => markerFromPhotoPixels(blank)).toThrow('Nessun marker');
});

it('detects different marker IDs together and preserves their corners in the photo', () => {
  const pixels = syntheticMarker(7, 0, true, 8);
  const marker = markerFromPhotoPixels(pixels);
  expect(marker.references.map((m) => m.id)).toEqual([7, 8]);
  const result = findTrackedMarkers(pixels, marker, createMarkerDetector());
  expect(result.state).toBe('found');
  expect(result.count).toBe(2);
  expect(result.homography[0]).toBeCloseTo(1, 5);
  expect(result.homography[4]).toBeCloseTo(1, 5);
  expect(findTrackedMarkers(syntheticMarker(7), marker, createMarkerDetector()).state).toBe('insufficient');
  expect(findTrackedMarkers(syntheticMarker(7, 0, true), marker, createMarkerDetector()).state).toBe('ambiguous');
});
