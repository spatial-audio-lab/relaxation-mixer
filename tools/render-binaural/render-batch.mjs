/* ================================================================
 * Render wsadowy — Playwright + Chromium headless
 * ================================================================
 * Uruchamia ten sam kod renderujący co render.html, ale bez klikania.
 * Zapisuje pliki WAV do katalogu wskazanego przez --out.
 *
 *   node tools/render-binaural/render-batch.mjs --out ./_render
 *   node tools/render-binaural/render-batch.mjs --out ./_render --only oddech-w-ciele
 *
 * Wymaga: npm i -D playwright  (oraz `npx playwright install chromium`)
 * ================================================================ */

/* Playwright ładuje się dopiero w trybie renderu (import dynamiczny niżej).
   Tryb --serve go nie potrzebuje i ma działać na czystym Node. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const OUT = path.resolve(process.cwd(), argVal('--out', './_render'));
const ONLY = argVal('--only', null);
const PORT = Number(argVal('--port', '8123'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.css': 'text/css; charset=utf-8'
};

function serve(root, port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      /* Obsługa Range — bez niej <audio> nie przewija, więc podsłuch w edytorze
         nie potrafiłby wystartować od wybranej sekundy. */
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      const size = fs.statSync(file).size;
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, () => resolve(srv));
  });
}

/* Tryb serwera: podnosi serwer z obsługą Range i nic więcej nie robi.
   Python http.server nie obsługuje Range, przez co podsłuch w edytorze
   nie potrafi wystartować od wybranej sekundy. */
if (args.includes('--serve')) {
  await serve(ROOT, PORT);
  console.log(`Serwer z obsługą Range: http://127.0.0.1:${PORT}`);
  console.log(`Edytor:  http://127.0.0.1:${PORT}/tools/render-binaural/editor.html`);
  console.log(`Render:  http://127.0.0.1:${PORT}/tools/render-binaural/render.html`);
  console.log(`Aplikacja: http://127.0.0.1:${PORT}/index.html`);
  console.log('\nCtrl+C kończy.');
} else {

const presets = JSON.parse(fs.readFileSync(path.join(__dirname, 'presets.json'), 'utf8'));
const list = presets.presets.filter((p) => !ONLY || p.id === ONLY);
if (!list.length) {
  console.error('Nie znaleziono presetu: ' + ONLY);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  console.error('\nBrak paczki playwright — jest potrzebna tylko do renderu wsadowego.\n');
  console.error('  npm i -D playwright');
  console.error('  npx playwright install chromium\n');
  console.error('Jeśli chcesz tylko podnieść serwer dla edytora, uruchom:');
  console.error('  node tools/render-binaural/render-batch.mjs --serve\n');
  process.exit(1);
}

const srv = await serve(ROOT, PORT);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.setDefaultTimeout(0);          // rendery długich medytacji trwają minuty
page.setDefaultNavigationTimeout(0);
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[render]')) console.log('  ' + t.slice(8).trim()); });

await page.goto(`http://127.0.0.1:${PORT}/tools/render-binaural/render.html`);
await page.waitForFunction(() => window.SALRender);

const report = [];
for (const preset of list) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${preset.slug}  (${preset.title})\n`);
  const b64 = await page.evaluate(async ({ preset }) => {
    const d = await (await fetch('presets.json')).json();
    const buf = await window.SALRender.renderPreset(
      d.engine, d.voicePositions, preset, '../..',
      (m) => console.log('[render] ' + m)
    );
    const wav = window.SALRender.bufferToWav24(buf);
    const bytes = new Uint8Array(wav);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return { b64: btoa(s), seconds: buf.duration, rate: buf.sampleRate };
  }, { preset });

  const target = path.join(OUT, preset.slug + '.wav');
  fs.writeFileSync(target, Buffer.from(b64.b64, 'base64'));
  const mb = fs.statSync(target).size / 1048576;
  console.log(`  ✔ ${mb.toFixed(1)} MB · ${b64.seconds.toFixed(1)} s · ${((Date.now() - t0) / 1000).toFixed(1)} s renderu\n`);
  report.push({ slug: preset.slug, title: preset.title, seconds: b64.seconds, sampleRate: b64.rate, megabytes: +mb.toFixed(1) });
}

fs.writeFileSync(path.join(OUT, '_render-report.json'), JSON.stringify(report, null, 2), 'utf8');
await browser.close();
srv.close();
console.log('Gotowe → ' + OUT);

}
