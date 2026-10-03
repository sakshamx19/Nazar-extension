// Renders Nazar's real UI (badges, panel, popup) on neutral demo pages using real
// Blinkit listing data from tests/fixtures, and captures PNGs with headless Chrome.
// No third-party site is screenshotted, so no platform branding or product photos.
//
// Usage: node tools/make-screenshots.js [outDir]   (default: ../docs/screenshots)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const EXT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(EXT, '..', 'docs', 'screenshots'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nazar-shots-'));
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome not found');
fs.mkdirSync(OUT, { recursive: true });

const url = p => 'file:///' + path.resolve(EXT, p).replace(/\\/g, '/');
const fixture = id => JSON.parse(fs.readFileSync(path.join(EXT, 'tests/fixtures', `blinkit-${id}.json`), 'utf8'));

const SETTINGS = {
  members: [
    { id: 'me', name: 'Me', profile: 'gym', skin: 'sensitive', hair: 'normal' },
    { id: 'papa', name: 'Papa', profile: 'diabetes', skin: 'normal', hair: 'dandruff' },
    { id: 'mom', name: 'Mom', profile: 'heart', skin: 'dry', hair: 'dry' },
    { id: 'riya', name: 'Riya', profile: 'kids', skin: 'normal', hair: 'normal' },
  ],
  activeId: 'me', showBadges: true, showPanel: true,
};

const CORE = ['src/core/util.js', 'src/core/nutrition.js', 'src/core/ingredients.js', 'src/core/claims.js', 'src/core/profiles.js',
  'src/core/score.js', 'src/core/care.js', 'src/core/store.js', 'src/adapters/generic.js', 'src/adapters/blinkit.js',
  'src/ui/styles.js', 'src/ui/render.js'];

const mockChrome = settings => `<script>
  const __store = { 'nazar:settings': ${JSON.stringify(settings)} };
  window.chrome = { storage: { local: {
    get: async k => k === null ? __store : (k in __store ? { [k]: __store[k] } : {}),
    set: async o => Object.assign(__store, o), remove: async () => {} }, onChanged: { addListener() {} } } };
  try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
</script>`;

const page = (title, body, script, extraCss = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f5f6f7; color: #1f2937; }
  .bar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 28px; display: flex; align-items: center; gap: 12px; }
  .bar b { font-size: 15px; } .bar span { font-size: 12px; color: #6b7280; }
  ${extraCss}
</style>${mockChrome(SETTINGS)}${CORE.map(f => `<script src="${url(f)}"></script>`).join('')}</head>
<body>${body}<script>
  const N = window.Nazar;
  const SETTINGS = ${JSON.stringify(SETTINGS)};
  const product = id => N.blinkit.productFromSeo(FIX[id], 'https://example.com/p/' + id);
  ${script}
</script></body></html>`;

const fixScript = ids => `<script>const FIX = ${JSON.stringify(Object.fromEntries(ids.map(id => [id, fixture(id)])))};</script>`;

const PALETTE = ['#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0', '#ddd6fe', '#fed7aa', '#a5f3fc', '#fbcfe8'];

// 1. Product grid with badges
function cardsPage() {
  const ids = ['534557', '232160', '1380466', '588816', '12872', '23779', '427623', '693558', '468885', '520366'];
  const css = `.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; padding: 22px 28px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 10px; }
    .img { height: 120px; border-radius: 10px; display: flex; align-items: center; justify-content: center; text-align: center;
      font-weight: 700; font-size: 13px; color: #374151; padding: 10px; }
    .nm { font-size: 13px; font-weight: 600; margin-top: 8px; height: 34px; overflow: hidden; }
    .u { font-size: 12px; color: #6b7280; margin-top: 2px; } .p { font-weight: 700; margin-top: 6px; font-size: 13px; }`;
  const body = fixScript(ids) + `<div class="bar"><b>Product listing</b><span>Demo page · real listing data · badge shows the selected member ("Me": Gym profile, sensitive skin)</span></div>
    <div class="grid">${ids.map((id, i) => `<div class="card" id="c${id}"><div class="img" style="background:${PALETTE[i % PALETTE.length]}">${fixture(id).brand || ''}</div>
      <div class="nm"></div><div class="u"></div><div class="p"></div></div>`).join('')}</div>`;
  const script = `for (const id of Object.keys(FIX)) {
      const p = product(id), el = document.getElementById('c' + id);
      el.querySelector('.nm').textContent = p.name; el.querySelector('.u').textContent = p.unitText; el.querySelector('.p').textContent = '₹' + p.price;
      if (N.hasVerdict(p)) N.ui.mountBadge(el, p, SETTINGS);
    }`;
  return page('cards', body, script, css);
}

// 2/3. Product page with the panel open
function panelPage(id, viewMember, side) {
  const css = `.pdp { display: grid; grid-template-columns: 420px 1fr; gap: 28px; padding: 28px; max-width: 860px; }
    .hero { height: 420px; border-radius: 16px; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #6b7280; }
    h1 { font-size: 20px; margin: 0 0 6px; } .u { color: #6b7280; } .price { font-size: 22px; font-weight: 800; margin: 14px 0; }
    .btn { display: inline-block; background: #16a34a; color: #fff; padding: 10px 26px; border-radius: 10px; font-weight: 700; }`;
  const f = fixture(id);
  const body = fixScript([id]) + `<div class="bar"><b>Product page</b><span>Demo page · real listing data</span></div>
    <div class="pdp"><div class="hero">${f.brand}</div><div><h1>${f.product_name}</h1><div class="u" id="u"></div><div class="price">₹${f.price}</div><span class="btn">Add to cart</span></div></div>`;
  const script = `const p = product('${id}'); document.getElementById('u').textContent = p.unitText;
    N.ui.showPanel(p, Object.assign({}, SETTINGS, { activeId: '${viewMember}' }), 'Blinkit', '${side}');`;
  return page('panel', body, script, css);
}

// 4. Popup / setup page
function popupPage() {
  let html = fs.readFileSync(path.join(EXT, 'popup/popup.html'), 'utf8');
  html = html.replace(/<script src="\.\.\/([^"]+)"><\/script>/g, (m, p) => `<script src="${url(p)}"></script>`)
    .replace('<script src="popup.js"></script>', `<script src="${url('popup/popup.js')}"></script>`)
    .replace('<head>', '<head>' + mockChrome(SETTINGS));
  return html;
}

const shots = [
  ['cards.png', cardsPage(), [1400, 760]],
  ['panel-food.png', panelPage('1380466', 'papa', 'right'), [1280, 1000]],
  ['panel-care.png', panelPage('693558', 'me', 'right'), [1280, 1000]],
  ['setup.png', popupPage(), [700, 980]],
];

for (const [name, html, [w, h]] of shots) {
  const file = path.join(TMP, name.replace('.png', '.html'));
  fs.writeFileSync(file, html);
  const out = path.join(OUT, name);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=4000', `--window-size=${w},${h}`, `--screenshot=${out}`,
    'file:///' + file.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 60000 });
  console.log('wrote', path.relative(process.cwd(), out));
}
fs.rmSync(TMP, { recursive: true, force: true });
