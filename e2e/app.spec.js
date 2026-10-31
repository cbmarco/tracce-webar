import { expect, test } from '@playwright/test';
import { markerSvg } from '../src/aruco.js';

async function preparePhoto(page) {
  await page.goto('/tracce-webar/');
  await expect(page).toHaveTitle('Tracce · WebAR');
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext('2d');
    context.fillStyle = '#c8cfbd'; context.fillRect(0, 0, 800, 600);
    context.strokeStyle = '#304b38'; context.lineWidth = 8; context.strokeRect(320, 240, 160, 60);
    return canvas.toDataURL('image/png');
  });
  await page.getByLabel('Foto originale').setInputFiles({ name: 'synthetic-wall.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  const image = page.locator('.annotator > img');
  await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await markCorners(image, [[0.4, 0.4], [0.6, 0.4], [0.6, 0.5], [0.4, 0.5]]);
  await expect(page.getByText('✓ Scatola 1')).toBeVisible();
}
async function markCorners(image, points) {
  for (const [x, y] of points) {
    const rect = await image.boundingBox();
    await image.click({ position: { x: rect.width * x, y: rect.height * y } });
  }
}
async function fakeCamera(page) {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); const image = context.createImageData(640, 480);
    let seed = 17;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = seed >>> 24; image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => context.putImageData(image, 0, 0), 100);
      const track = stream.getVideoTracks()[0]; const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); window.__cameraStopped = true; };
      return stream;
    };
  });
}

test('standalone workflow exports/restores photos and projects a camera frame without a backend', async ({ page }) => {
  const apiCalls = [];
  await page.route('**/api/**', (route) => { apiCalls.push(route.request().url()); return route.abort(); });
  await preparePhoto(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta sessione' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('synthetic-wall-tracce.json');
  const savedPath = await download.path();
  await page.reload();
  await page.getByLabel('Importa sessione').setInputFiles(savedPath);
  await expect(page.getByText('✓ Scatola 1')).toBeVisible();
  await expect(page.locator('.annotator circle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Continua' }).click();
  await expect(page.getByRole('heading', { name: 'WebAR spaziale' })).toBeVisible();
  await fakeCamera(page);
  await page.getByRole('button', { name: 'Apri fotocamera' }).click();
  await page.getByRole('button', { name: 'Ferma e allinea' }).click();
  const frozen = page.getByAltText('Fotogramma da allineare');
  await expect(frozen).toBeVisible();
  await markCorners(frozen, [[0.2, 0.2], [0.7, 0.2], [0.7, 0.7], [0.2, 0.7]]);
  await expect(page.getByAltText('Tracce sovrapposte')).toBeVisible();
  const projected = await page.locator('.projection').evaluate((image) => {
    const matrix = new DOMMatrix(image.style.transform);
    const point = matrix.transformPoint(new DOMPoint(image.naturalWidth * 0.4, image.naturalHeight * 0.4));
    const stage = image.parentElement.getBoundingClientRect();
    return [point.x / point.w / stage.width, point.y / point.w / stage.height];
  });
  expect(projected[0]).toBeCloseTo(0.2, 2); expect(projected[1]).toBeCloseTo(0.2, 2);
  await page.getByRole('button', { name: 'Avvia sovrapposizione live' }).click();
  await expect(page.getByText('● Tracking video')).toBeVisible();
  await page.getByRole('button', { name: 'Riaggancia parete' }).click();
  await page.getByRole('button', { name: 'Modalità' }).click();
  expect(await page.evaluate(() => window.__cameraStopped)).toBe(true);
  expect(apiCalls).toEqual([]);
});

test('mobile guide supports correction and a recoverable camera permission error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparePhoto(page);
  await page.getByRole('button', { name: 'Modifica scatola 1, alto a sinistra' }).click();
  await markCorners(page.locator('.annotator > img'), [[0.39, 0.39]]);
  await expect(page.getByRole('button', { name: 'Continua' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Continua' }).click();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Apri fotocamera' }).click();
  await expect(page.getByRole('alert')).toContainText('Accesso alla fotocamera negato');
  await fakeCamera(page);
  await page.getByRole('button', { name: 'Riprova fotocamera' }).click();
  await expect(page.getByRole('button', { name: 'Ferma e allinea' })).toBeVisible();
  await page.getByRole('button', { name: 'Modalità' }).click();
  expect(await page.evaluate(() => window.__cameraStopped)).toBe(true);
});

test('WebXR launch requests spatial features and offers camera fallback on failure', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: async () => true,
      requestSession: async (mode, options) => { window.__xrRequest = { mode, features: options.requiredFeatures }; throw new Error('Superfici non disponibili'); },
    } });
  });
  await preparePhoto(page);
  await page.getByRole('button', { name: 'Continua' }).click();
  await page.getByRole('button', { name: 'Apri WebAR' }).click();
  await page.getByRole('button', { name: 'Entra in WebAR' }).click();
  await expect(page.getByRole('alert')).toContainText('Superfici non disponibili');
  expect(await page.evaluate(() => window.__xrRequest)).toEqual({ mode: 'immersive-ar', features: ['hit-test', 'dom-overlay'] });
  await expect(page.getByRole('button', { name: 'Usa fotocamera e omografia' })).toBeEnabled();
});


test('private drafts survive reload and can be deleted from this browser', async ({ page }) => {
  await preparePhoto(page);
  await expect(page.getByText('✓ Salvato solo su questo dispositivo')).toBeVisible();
  await page.reload();
  await expect(page.getByText('✓ Scatola 1')).toBeVisible();
  await expect(page.getByAltText('Foto della parete')).toBeVisible();
  await page.getByRole('button', { name: 'Le tue pareti', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pareti salvate' })).toBeVisible();
  await page.getByRole('button', { name: 'Elimina synthetic-wall.png' }).click();
  await expect(page.getByRole('region', { name: 'Pareti salvate' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tracce-webar.sessions.v1')).sessions)).toEqual([]);
  await page.reload();
  await expect(page.getByLabel('Foto originale')).toBeVisible();
});

test('quota errors keep the previous session and offer export', async ({ page }) => {
  await preparePhoto(page);
  await expect(page.getByText('✓ Salvato solo su questo dispositivo')).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Modifica scatola 1, alto a sinistra' }).click();
  await markCorners(page.locator('.annotator > img'), [[0.39, 0.39]]);
  await expect(page.getByRole('alert')).toContainText('spazio esaurito');
  await expect(page.getByRole('button', { name: 'Esporta sessione' })).toBeEnabled();
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('tracce-webar.sessions.v1')).sessions[0]);
  expect(retained.boxes[0].points[0][0]).toBeCloseTo(0.4, 2);
});


test('holding and dragging an annotation keeps the loupe open and suppresses browser menus', async ({ page }) => {
  await preparePhoto(page);
  await page.getByRole('button', { name: 'Modifica scatola 1, alto a sinistra' }).click();
  const image = page.getByAltText('Foto della parete');
  const rect = await image.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.down();
  await expect(page.locator('.loupe')).toBeVisible();
  const prevented = await image.evaluate((element) => ({
    contextMenu: !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    imageDrag: !element.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
  }));
  expect(prevented).toEqual({ contextMenu: true, imageDrag: true });
  await expect(page.locator('.loupe')).toBeVisible();
  await page.mouse.move(rect.x + rect.width * 0.39, rect.y + rect.height * 0.39);
  await page.mouse.up();
  await expect(page.locator('.loupe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continua' })).toBeEnabled();
});


async function fakeMarkerCamera(page, id = 0) {
  await page.evaluate(async ({ correct, wrong }) => {
    async function image(svg) { const value = new Image(); value.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await value.decode(); return value; }
    const [correctImage, wrongImage] = await Promise.all([image(correct), image(wrong)]);
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d');
    window.__arucoScene = { mode: 'correct' };
    function draw() {
      context.fillStyle = '#c8cfbd'; context.fillRect(0, 0, 640, 480);
      context.strokeStyle = '#304b38'; context.lineWidth = 8; context.strokeRect(288, 144, 256, 240);
      const mode = window.__arucoScene.mode;
      if (mode !== 'missing') context.drawImage(mode === 'wrong' ? wrongImage : correctImage, 300, 275, 90, 90);
      if (mode === 'duplicate') context.drawImage(correctImage, 60, 40, 90, 90);
    }
    draw();
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = canvas.captureStream(10); const timer = setInterval(draw, 100);
      const track = stream.getVideoTracks()[0]; const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); window.__arucoStopped = true; };
      return stream;
    };
  }, { correct: markerSvg(id), wrong: markerSvg((id + 7) % 250) });
}

test('ArUco calibrates an old photo, reacquires automatically and restores the link locally', async ({ page }) => {
  await preparePhoto(page);
  await page.getByRole('button', { name: 'Continua' }).click();
  await fakeMarkerCamera(page);
  await page.getByRole('button', { name: 'Apri ArUco' }).click();
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica marker SVG' }).click();
  expect((await downloadPending).suggestedFilename()).toBe('aruco-mip36h12-0.svg');
  const pngPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica marker PNG per termica' }).click();
  const pngDownload = await pngPending;
  expect(pngDownload.suggestedFilename()).toBe('aruco-mip36h12-0-384px.png');
  const stream = await pngDownload.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pngResult = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height);
    const { createMarkerDetector, findMarker } = await import('/tracce-webar/src/aruco.js');
    return { blackBorder: context.getImageData(40, 40, 1, 1).data[0], whiteBorder: context.getImageData(39, 40, 1, 1).data[0], width: image.width, height: image.height, colors: [...new Set(pixels.data)], detection: findMarker(pixels, 0, createMarkerDetector()).state };
  }, Buffer.concat(chunks).toString('base64'));
  expect(pngResult).toEqual({ blackBorder: 0, whiteBorder: 255, width: 384, height: 384, colors: expect.arrayContaining([0, 255]), detection: 'found' });
  expect(pngResult.colors).toHaveLength(2);
  await expect(page.getByRole('link', { name: 'Apri Kitty Printer' })).toHaveAttribute('href', 'https://print.unseen-site.fun/');
  await expect(page.getByText('● ArUco 0 rilevato', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ferma e collega marker' }).click();
  const frozen = page.getByAltText('Fotogramma di calibrazione ArUco');
  await markCorners(frozen, [[0.45, 0.3], [0.85, 0.3], [0.85, 0.8], [0.45, 0.8]]);
  await page.getByRole('button', { name: 'Salva collegamento ArUco' }).click();
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
  await page.evaluate(() => { window.__arucoScene.mode = 'missing'; });
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toHaveCount(0);
  await page.evaluate(() => { window.__arucoScene.mode = 'wrong'; });
  await expect(page.getByText('È visibile un altro marker: serve l’ID 0.')).toBeVisible();
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toHaveCount(0);
  await page.evaluate(() => { window.__arucoScene.mode = 'duplicate'; });
  await expect(page.getByText('Sono visibili più marker con ID 0: inquadrane uno solo.')).toBeVisible();
  await page.evaluate(() => { window.__arucoScene.mode = 'correct'; });
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
  await page.getByRole('button', { name: 'Modalità' }).click();
  expect(await page.evaluate(() => window.__arucoStopped)).toBe(true);
  await expect(page.getByText('✓ Salvato solo su questo dispositivo')).toBeVisible();
  const storedMarker = await page.evaluate(() => JSON.parse(localStorage.getItem('tracce-webar.sessions.v1')).sessions[0].marker);
  expect(storedMarker.dictionary).toBe('ARUCO_MIP_36h12'); expect(storedMarker.sourceCorners).toHaveLength(4);
  await page.reload();
  await page.getByRole('button', { name: 'Continua' }).click();
  await expect(page.getByText('ArUco 0 collegato', { exact: true })).toBeVisible();
  await fakeMarkerCamera(page);
  await page.getByRole('button', { name: 'Apri ArUco' }).click();
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ricalibra marker' })).toBeVisible();
  await page.getByRole('button', { name: 'Modalità' }).click();
});


test('new marker photo opens WebAR without boxes and survives export, import and reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tracce-webar/');
  const photo = await page.evaluate(async (svg) => {
    const marker = new Image(); marker.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await marker.decode();
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext('2d'); context.fillStyle = '#ddd'; context.fillRect(0, 0, 800, 600);
    context.drawImage(marker, 300, 275, 150, 150);
    return canvas.toDataURL('image/png');
  }, markerSvg(7));
  await page.getByLabel('Foto originale').setInputFiles({ name: 'new-marker-wall.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await expect(page.getByRole('heading', { name: '✓ Marker 7 pronto' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('navigation', { name: 'Passaggi' }).getByRole('button').nth(2).click();
  await expect(page.getByRole('button', { name: 'Apri WebAR', exact: false }).filter({ hasText: 'Apri WebAR →' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Apri fotocamera' })).toBeDisabled();
  await fakeMarkerCamera(page, 7);
  await page.getByRole('button', { name: 'Apri ArUco' }).click();
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ferma e collega marker' })).toHaveCount(0);
  await page.evaluate(() => { window.__arucoScene.mode = 'missing'; });
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toHaveCount(0);
  await page.evaluate(() => { window.__arucoScene.mode = 'correct'; });
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
  await page.getByRole('button', { name: 'Modalità' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta sessione' }).click();
  const path = await (await pending).path();
  await page.getByLabel('Importa sessione').setInputFiles(path);
  await expect(page.getByRole('heading', { name: '✓ Marker 7 pronto' })).toBeVisible();
  await expect(page.getByText('✓ Salvato solo su questo dispositivo')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '✓ Marker 7 pronto' })).toBeVisible();
  await fakeMarkerCamera(page, 7);
  await page.getByRole('button', { name: 'Apri WebAR con marker' }).click();
  await expect(page.getByAltText('Tracce agganciate ad ArUco')).toBeVisible();
});

async function multiMarkerScene(page) {
  return page.evaluate(async (svgs) => {
    const images = await Promise.all(svgs.map(async (svg) => { const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode(); return image; }));
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const context = canvas.getContext('2d');
    const positions = [[80, 100], [980, 180], [500, 620]];
    window.__multiScene = [0, 1, 2];
    function draw(live) {
      context.fillStyle = '#ddd'; context.fillRect(0, 0, 1200, 800);
      positions.forEach(([x, y], id) => {
        if (!window.__multiScene.includes(id)) return;
        context.drawImage(images[id], live ? x * 0.85 + 40 : x, live ? y * 0.85 + 20 : y, live ? 85 : 100, live ? 85 : 100);
      });
    }
    draw(false);
    const photo = canvas.toDataURL('image/png');
    navigator.mediaDevices.getUserMedia = async () => {
      draw(true);
      const stream = canvas.captureStream(10); const timer = setInterval(() => draw(true), 100);
      const track = stream.getVideoTracks()[0]; const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      return stream;
    };
    return photo;
  }, [markerSvg(0), markerSvg(1), markerSvg(2)]);
}

test('three-marker wall uses a common transform, hides with one marker, and preserves references', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tracce-webar/');
  const photo = await multiMarkerScene(page);
  await page.getByLabel('Foto originale').setInputFiles({ name: 'three-marker-wall.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await expect(page.getByRole('heading', { name: '✓ 3 marker pronti' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Apri WebAR con marker' }).click();
  await expect(page.getByText('● 3/3 marker agganciati', { exact: true })).toBeVisible();
  const projection = page.getByAltText('Tracce agganciate ad ArUco');
  await expect(projection).toBeVisible();
  const projected = await projection.evaluate((image) => {
    const m = new DOMMatrix(image.style.transform); const p = m.transformPoint(new DOMPoint(image.naturalWidth * 0.5, image.naturalHeight * 0.5));
    const stage = image.parentElement.getBoundingClientRect(); return [p.x / p.w / stage.width, p.y / p.w / stage.height];
  });
  expect(projected[0]).toBeCloseTo(0.5 * 0.85 + 40 / 1200, 2);
  expect(projected[1]).toBeCloseTo(0.5 * 0.85 + 20 / 800, 2);
  await page.getByRole('button', { name: 'Applica griglia quotata' }).click();
  await expect(page.getByRole('alert')).toContainText('misura positiva');
  await page.getByLabel('Misura reale in cm').fill('16');
  await page.getByRole('button', { name: 'Applica griglia quotata' }).click();
  const grid = page.getByRole('img', { name: 'Griglia quotata, passo 10 cm, origine ID 0' });
  await expect(grid).toBeVisible();
  const gridX = await grid.locator('line[data-axis="x"][data-cm="10"]').evaluate((line) => Number(line.getAttribute('x1')) / line.closest('svg').viewBox.baseVal.width);
  expect(gridX).toBeCloseTo((180 * 0.85 + 40) / 1200, 2);
  await page.getByLabel('Mostra griglia quotata', { exact: true }).uncheck();
  await expect(grid).toHaveCount(0);
  await page.getByLabel('Mostra griglia quotata', { exact: true }).check();
  await expect(grid).toBeVisible();
  await page.getByLabel('Misura di riferimento', { exact: true }).selectOption('distance');
  await page.getByLabel('Misura reale in cm').fill(String(Math.hypot(900, 80) / 5));
  await page.getByRole('button', { name: 'Applica griglia quotata' }).click();
  await expect(grid).toBeVisible();
  await page.evaluate(() => { window.__multiScene = [1, 2]; });
  await expect(page.getByText('● 2/3 marker agganciati', { exact: true })).toBeVisible();
  await expect(projection).toBeVisible();
  await page.evaluate(() => { window.__multiScene = [2]; });
  await expect(projection).toHaveCount(0);
  await expect(page.getByText('1/3 marker · servono almeno 2', { exact: true })).toBeVisible();
  await expect(grid).toHaveCount(0);
  await page.evaluate(() => { window.__multiScene = [0, 2]; });
  await expect(projection).toBeVisible();
  await page.getByRole('button', { name: 'Modalità' }).click();
  await page.getByRole('navigation', { name: 'Passaggi' }).getByRole('button').nth(2).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta sessione' }).click();
  const path = await (await pending).path();
  await page.getByLabel('Importa sessione').setInputFiles(path);
  await expect(page.getByRole('heading', { name: '✓ 3 marker pronti' })).toBeVisible();
  await expect(page.getByText('✓ Salvato solo su questo dispositivo')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '✓ 3 marker pronti' })).toBeVisible();
  await multiMarkerScene(page);
  await page.getByRole('button', { name: 'Apri WebAR con marker' }).click();
  await expect(page.getByText('● 3/3 marker agganciati', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Griglia quotata, passo 10 cm, origine ID 0' })).toBeVisible();
  await expect(page.getByLabel('Misura di riferimento', { exact: true })).toHaveValue('distance');
});


test('A4 template downloads at physical page size with a detectable 16 cm black square', async ({ page }) => {
  await page.goto('/tracce-webar/');
  await page.getByLabel('ID da stampare').fill('12');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica dima A4' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('aruco-mip36h12-12-A4.svg');
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const svg = Buffer.concat(chunks).toString('utf8');
  expect(svg).toContain('width="210mm" height="297mm"');
  const printed = await page.evaluate(async (source) => {
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 594;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, 420, 594);
    const { findMarker, createMarkerDetector } = await import('/tracce-webar/src/aruco.js');
    const detection = findMarker(context.getImageData(0, 0, 420, 594), 12, createMarkerDetector());
    const row = context.getImageData(0, 115, 420, 1).data;
    let blackPixels = 0;
    for (let i = 0; i < row.length; i += 4) if (row[i] < 128) blackPixels++;
    return { ...detection, blackSideMm: blackPixels / 2 };
  }, svg);
  expect(printed.state).toBe('found');
  const [a, b] = printed.marker.corners;
  const sideMm = Math.hypot((a[0] - b[0]) * 210, (a[1] - b[1]) * 297);
  // Detection returns pixel centers, while the printed edges span full pixels.
  expect(Math.abs(sideMm - 160)).toBeLessThanOrEqual(0.5);
  expect(printed.blackSideMm).toBe(160);
});
