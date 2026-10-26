// Conservative local patch tracking. Stops on weak/ambiguous matches instead of
// presenting an unchanged overlay as if it were still attached to the wall.
export function trackPhotoPoints(previous, next, points, width, height) {
  function score(ax, ay, bx, by) {
    let meanA = 0; let meanB = 0; let variance = 0; let error = 0;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      meanA += previous[(ay + y) * width + ax + x];
      meanB += next[(by + y) * width + bx + x];
    }
    meanA /= 81; meanB /= 81;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const a = previous[(ay + y) * width + ax + x] - meanA;
      const b = next[(by + y) * width + bx + x] - meanB;
      variance += a * a; error += (a - b) ** 2;
    }
    return variance < 400 ? Infinity : error / variance;
  }
  return points.map(([u, v]) => {
    const ax = Math.round(u * width); const ay = Math.round(v * height);
    if (ax < 5 || ay < 5 || ax >= width - 5 || ay >= height - 5) throw new Error('Riferimento fuori campo.');
    let best = Infinity; let match;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
      const x = ax + dx; const y = ay + dy;
      if (x < 5 || y < 5 || x >= width - 5 || y >= height - 5) continue;
      const error = score(ax, ay, x, y);
      if (error < best) { best = error; match = [x / width, y / height]; }
    }
    if (best > 0.35 || !match) throw new Error('Tracking perso: ferma il video e riaggancia le scatole.');
    return match;
  });
}
