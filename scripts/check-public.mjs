import { readdir, readFile } from 'node:fs/promises';

const allowed = new Set([
  '.gitignore', '.nvmrc', 'README.md', 'PRIVACY.md', 'package.json', 'package-lock.json',
  'index.html', 'vite.config.js', 'vitest.config.js', 'eslint.config.js', 'playwright.config.js',
  '.github/workflows/pages.yml', 'scripts/check-public.mjs', 'e2e/app.spec.js',
  ...['Annotator.jsx', 'App.jsx', 'CameraView.jsx', 'XRView.jsx', 'main.jsx', 'photoTracker.js', 'photoTracker.test.js', 'session.js', 'storage.js', 'storage.test.js', 'style.css', 'webxr.js'].map((p) => `src/${p}`),
  'src/lib/photoAlignment.js', 'src/lib/photoAlignment.test.js',
]);
const ignored = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report', '.vite', 'coverage']);
const forbidden = /IMG_[0-9]{3,}|cason[-]wiki|\/home\/[a-z]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{256}/;
let count = 0;
async function scan(directory = '.', build = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!build && ignored.has(entry.name)) continue;
    const file = directory === '.' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed: ${file}`);
    if (entry.isDirectory()) { await scan(file, build); continue; }
    if (!build && !allowed.has(file)) throw new Error(`Unexpected public file: ${file}`);
    if (/\.(?:jpe?g|png|webp|heic|gif|pdf|glb|obj|sh3d|mp4|mov)$/i.test(file)) throw new Error(`Media/data file not allowed: ${file}`);
    if (forbidden.test(await readFile(file, 'utf8'))) throw new Error(`Potential private content: ${file}`);
    count++;
  }
}
await scan();
try { await scan('dist', true); } catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log(`Public export verified: ${count} source/build files; no bundled photos, user sessions, private project references or detected secrets.`);
