// Captures README screenshots of Nazar running on real Blinkit pages.
//
// Branded Chrome no longer loads unpacked extensions from the command line, so this
// opens Blinkit in headless Chrome, injects the extension's content scripts through
// the DevTools protocol (same code, with chrome.storage mocked), waits for badges and
// the panel, and saves PNGs. Also captures the setup popup.
//
// Usage: node tools/capture-blinkit.js [outDir]   (default: ../docs/screenshots)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(EXT, '..', 'docs', 'screenshots'));
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
const PORT = 9334;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const W = 1440, H = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEMBERS = [
  { id: 'me', name: 'Me', profile: 'gym', skin: 'sensitive', hair: 'normal' },
  { id: 'papa', name: 'Papa', profile: 'diabetes', skin: 'normal', hair: 'dandruff' },
  { id: 'mom', name: 'Mom', profile: 'heart', skin: 'dry', hair: 'dry' },
  { id: 'riya', name: 'Riya', profile: 'kids', skin: 'normal', hair: 'normal' },
];
const settings = activeId => ({ members: MEMBERS, activeId, showBadges: true, showPanel: true, debug: false });

const SHOTS = [
  // Category page first: it settles the delivery location for the pages after it.
  { file: 'blinkit-care-listing.png', url: 'https://blinkit.com/cn/face-cream-lotion/cid/163/164', active: 'me', wait: 14000 },
  { file: 'blinkit-search.png', url: 'https://blinkit.com/s/?q=protein%20chips', active: 'me', wait: 12000 },
  { file: 'blinkit-panel-food.png', url: 'https://blinkit.com/prn/x/prid/1380466', active: 'papa', wait: 7000 },
  { file: 'blinkit-panel-care.png', url: 'https://blinkit.com/prn/x/prid/693558', active: 'me', wait: 7000 },
];

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const contentCode = manifest.content_scripts[0].js.map(f => fs.readFileSync(path.join(EXT, f), 'utf8')).join('\n;\n');
const mockChrome = s => `(() => {
  const store = { 'nazar:settings': ${JSON.stringify(s)} };
  window.chrome = window.chrome || {};
  window.chrome.storage = { local: {
    get: async k => k === null ? store : (k in store ? { [k]: store[k] } : {}),
    set: async o => Object.assign(store, o), remove: async () => {} }, onChanged: { addListener() {} } };
})();`;

async function cdp() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nazar-cdp-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, `--user-agent=${UA}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let n = 0;
  const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result;
  const close = () => { ws.close(); proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500); };
  return { send, evaluate, close };
}

async function shoot(send, file) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', path.join(path.relative(process.cwd(), OUT), file));
}

(async () => {
  if (!CHROME) throw new Error('Chrome not found');
  fs.mkdirSync(OUT, { recursive: true });
  const { send, evaluate, close } = await cdp();
  try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Browser.grantPermissions', { permissions: ['geolocation'], origin: 'https://blinkit.com' });
    await send('Emulation.setGeolocationOverride', { latitude: 28.5933, longitude: 77.2207, accuracy: 50 });

    for (const s of SHOTS) {
      await send('Page.navigate', { url: s.url });
      await sleep(7000);
      // Close the search suggestions dropdown, then bring the first product card to the top.
      await evaluate(`document.activeElement && document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);
      if (!s.url.includes('/prid/')) await evaluate(`(() => { const c = [...document.querySelectorAll("div[role='button'][id]")].find(e => /^\\d+$/.test(e.id)); if (c) window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 104); })()`);
      await evaluate(mockChrome(settings(s.active)) + '\n' + contentCode);
      await sleep(s.wait);
      const stats = await evaluate(`JSON.stringify({ badges: document.querySelectorAll('nazar-ui[data-kind=badge]').length, panel: !!document.querySelector('nazar-ui[data-kind=panel]') })`);
      console.log(s.file, stats.result.value);
      await shoot(send, s.file);
    }

    // Setup / popup page (Nazar's own UI, no site involved).
    const popupHtml = fs.readFileSync(path.join(EXT, 'popup/popup.html'), 'utf8')
      .replace(/<script src="\.\.\/([^"]+)"><\/script>/g, (m, p) => `<script src="file:///${path.join(EXT, p).replace(/\\/g, '/')}"></script>`)
      .replace('<script src="popup.js"></script>', `<script src="file:///${path.join(EXT, 'popup/popup.js').replace(/\\/g, '/')}"></script>`)
      .replace('<head>', `<head><script>${mockChrome(settings('me'))}</script>`);
    const tmp = path.join(os.tmpdir(), 'nazar-setup.html');
    fs.writeFileSync(tmp, popupHtml);
    await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 980, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'file:///' + tmp.replace(/\\/g, '/') });
    await sleep(2500);
    await shoot(send, 'setup.png');
    fs.rmSync(tmp, { force: true });
  } finally {
    close();
  }
})();
