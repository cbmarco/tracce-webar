import { photoHomography, projectPhotoPoint } from './lib/photoAlignment.js';

// Fit all corners together. Evaluate marker groups, so one misread/moved marker
// cannot contribute a few misleading corners to an otherwise valid fit.
export function fitMarkerAlignment(matches, width, height) {
  if (matches.length < 2) return null;
  const fit = (group) => photoHomography(group.flatMap((m) => m.sourceCorners), group.flatMap((m) => m.corners));
  const error = (h, marker) => Math.sqrt(marker.sourceCorners.reduce((sum, point, i) => {
    const projected = projectPhotoPoint(h, point);
    return sum + ((projected[0] - marker.corners[i][0]) * width) ** 2 + ((projected[1] - marker.corners[i][1]) * height) ** 2;
  }, 0) / 4);
  const groups = [matches, ...matches.map((m) => [m])];
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) groups.push([matches[i], matches[j]]);
  }
  let best = null;
  for (const group of groups) {
    try {
      const h = fit(group);
      const inliers = matches.filter((m) => error(h, m) <= 3);
      if (inliers.length < 2) continue;
      const homography = fit(inliers);
      if (inliers.some((m) => error(homography, m) > 3)) continue;
      // Reject projections crossing infinity anywhere on the photo.
      if ([[0, 0], [1, 0], [1, 1], [0, 1]].some(([x, y]) => homography[6] * x + homography[7] * y + 1 <= 0.00001)) continue;
      const residual = inliers.reduce((sum, m) => sum + error(homography, m), 0);
      if (!best || inliers.length > best.matches.length || (inliers.length === best.matches.length && residual < best.residual)) {
        best = { homography, matches: inliers, residual };
      }
    } catch { /* A degenerate hypothesis supplies no usable alignment. */ }
  }
  return best;
}
