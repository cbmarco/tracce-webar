import { expect, test } from '@playwright/test';

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
