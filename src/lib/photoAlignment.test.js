import { describe, it, expect } from 'vitest';
import { photoHomography, projectPhotoPoint, validatePhotoCalibration } from './photoAlignment.js';

describe('photo alignment', () => {
  it('recovers a perspective transform from multiple boxes', () => {
    const points = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.1, 0.2], [0.6, 0.7], [0.8, 0.7], [0.8, 0.8], [0.6, 0.8]];
    const expected = [0.8, 0.1, 0.05, -0.1, 0.9, 0.02, 0.1, -0.2, 1];
    const h = photoHomography(points, points.map((p) => projectPhotoPoint(expected, p)));
    const result = projectPhotoPoint(h, [0.5, 0.4]);
    const target = projectPhotoPoint(expected, [0.5, 0.4]);
    result.forEach((v, i) => expect(v).toBeCloseTo(target[i], 8));
  });
  it('rejects collinear correspondences', () => {
    const points = [[0, 0], [0.2, 0], [0.4, 0], [0.8, 0]];
    expect(() => photoHomography(points, points)).toThrow();
  });
  it('requires four valid box corners without manual dimensions', () => {
    const calibration = { version: 1, imageName: 'wall.jpg', boxes: [{ points: [[0, 0], [1, 0], [1, 1], [0, 1]] }] };
    expect(validatePhotoCalibration(calibration)).toBe(true);
    expect(validatePhotoCalibration({ ...calibration, boxes: [{ ...calibration.boxes[0], widthCm: 13, heightCm: 7 }] })).toBe(true);
    expect(validatePhotoCalibration({ ...calibration, boxes: [{ ...calibration.boxes[0], points: [[0, 0], [0, 0], [0, 0], [0, 0]] }] })).toBe(false);
  });
});

import { invertPhotoHomography, wallPhotoPlane } from './photoAlignment.js';

it('anchors a photo to WebXR surface hits without known box dimensions', () => {
  const box = { points: [[0.2, 0.2], [0.4, 0.2], [0.4, 0.3], [0.2, 0.3]] };
  const hits = [[1, 2, -1], [1.2, 2, -1], [1.21, 1.9, -1], [1, 1.9, -1]];
  const plane = wallPhotoPlane(box, hits);
  expect(plane.origin).toEqual(hits[0]);
  box.points.forEach((point, i) => {
    const result = projectPhotoPoint(plane.homography, point);
    expect(result[0]).toBeCloseTo(hits[i][0] - hits[0][0], 8);
    expect(result[1]).toBeCloseTo(hits[0][1] - hits[i][1], 8);
  });
  const inverse = invertPhotoHomography(plane.homography);
  const point = projectPhotoPoint(inverse, projectPhotoPoint(plane.homography, [0.7, 0.8]));
  expect(point[0]).toBeCloseTo(0.7, 8); expect(point[1]).toBeCloseTo(0.8, 8);
  // Legacy metadata is preserved in saved boxes but no longer controls alignment.
  expect(wallPhotoPlane({ ...box, widthCm: 999, heightCm: 999 }, hits)).toEqual(plane);
  expect(() => wallPhotoPlane(box, [hits[0], hits[1], [1.2, 1.9, -1.1], hits[3]])).toThrow('stessa parete');
  expect(() => wallPhotoPlane(box, [hits[0], hits[3], hits[1], hits[2]])).toThrow('angoli');
});

import { ARUCO_DICTIONARY, markerSourceFromFrame, validateMarkerAlignment } from './photoAlignment.js';

it('links a marker to an old photo using corresponding box corners', () => {
  const photoPoints = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.5], [0.4, 0.5]];
  const framePoints = [[0.45, 0.3], [0.85, 0.3], [0.85, 0.8], [0.45, 0.8]];
  const markerPoints = [[0.48, 0.6], [0.58, 0.6], [0.58, 0.7], [0.48, 0.7]];
  const marker = markerSourceFromFrame(7, photoPoints, framePoints, markerPoints);
  expect(marker).toMatchObject({ dictionary: ARUCO_DICTIONARY, id: 7, placement: 'plate-bottom-left' });
  const photoToFrame = photoHomography(photoPoints, framePoints);
  marker.sourceCorners.forEach((point, i) => {
    const projected = projectPhotoPoint(photoToFrame, point);
    projected.forEach((n, j) => expect(n).toBeCloseTo(markerPoints[i][j], 8));
  });
  const calibration = { version: 1, imageName: 'synthetic', boxes: [{ points: photoPoints }], marker };
  expect(validatePhotoCalibration(calibration)).toBe(true);
  expect(validatePhotoCalibration({ ...calibration, marker: { ...marker, id: -1 } })).toBe(false);
  expect(validateMarkerAlignment({ ...marker, sourceCorners: [[NaN, 0], ...marker.sourceCorners.slice(1)] })).toBe(false);
  expect(validateMarkerAlignment({ ...marker, dictionary: 'unsupported' })).toBe(false);
  expect(() => markerSourceFromFrame(7, photoPoints, framePoints.slice(0, 3), markerPoints)).toThrow();
});
