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
  it('requires dimensions and four valid box corners', () => {
    const calibration = { version: 1, imageName: 'wall.jpg', boxes: [{ widthCm: 13, heightCm: 7, points: [[0, 0], [1, 0], [1, 1], [0, 1]] }] };
    expect(validatePhotoCalibration(calibration)).toBe(true);
    expect(validatePhotoCalibration({ ...calibration, boxes: [{ ...calibration.boxes[0], widthCm: 0 }] })).toBe(false);
    expect(validatePhotoCalibration({ ...calibration, boxes: [{ ...calibration.boxes[0], points: [[0, 0], [0, 0], [0, 0], [0, 0]] }] })).toBe(false);
  });
});

import { invertPhotoHomography, metricPhotoPlane } from './photoAlignment.js';

it('anchors a photo using known box dimensions in WebXR meters', () => {
  const box = { widthCm: 20, heightCm: 10, points: [[0.2, 0.2], [0.4, 0.2], [0.4, 0.3], [0.2, 0.3]] };
  const hits = [[1, 2, -1], [1.2, 2, -1], [1.2, 1.9, -1], [1, 1.9, -1]];
  const plane = metricPhotoPlane(box, hits);
  plane.origin.forEach((n, i) => expect(n).toBeCloseTo(hits[0][i], 8));
  expect(projectPhotoPoint(plane.homography, box.points[2])[0]).toBeCloseTo(0.2, 8);
  expect(projectPhotoPoint(plane.homography, box.points[2])[1]).toBeCloseTo(0.1, 8);
  const inverse = invertPhotoHomography(plane.homography);
  const point = projectPhotoPoint(inverse, projectPhotoPoint(plane.homography, [0.7, 0.8]));
  expect(point[0]).toBeCloseTo(0.7, 8); expect(point[1]).toBeCloseTo(0.8, 8);
  expect(() => metricPhotoPlane(box, [[1, 2, -1], [2, 2, -1], [2, 1, -1], [1, 1, -1]])).toThrow('dimensioni');
  expect(() => metricPhotoPlane(box, [hits[0], hits[1], [1.2, 1.9, -1.1], hits[3]])).toThrow('stessa parete');
});
