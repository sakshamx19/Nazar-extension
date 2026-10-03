// Records a ~45 s demo video of Nazar on live Blinkit pages (for LinkedIn / social).
//
// Headless Chrome + DevTools protocol: opens Blinkit, injects the extension's content
// scripts (chrome.storage mocked with a demo family), drives a visible cursor, adds
// captions, captures frames with Page.startScreencast and encodes an MP4 with ffmpeg.
//
// Usage: FFMPEG=/path/to/ffmpeg node tools/record-demo.js [out.mp4]
//        (falls back to the ffmpeg-static npm package or ffmpeg on PATH)
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(EXT, '..', 'nazar-demo.mp4'));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; } })();
const PORT = 9336;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VW = 1280, VH = 720, SCALE = 1.5; // CSS viewport; frames come out 1920x1080
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEMBERS = [
  { id: 'me', name: 'Me', profile: 'gym', skin: 'sensitive', hair: 'normal' },
  { id: 'papa', name: 'Papa', profile: 'diabetes', skin: 'normal', hair: 'dandruff' },
  { id: 'mom', name: 'Mom', profile: 'heart', skin: 'dry', hair: 'dry' },
  { id: 'riya', name: 'Riya', profile: 'kids', skin: 'normal', hair: 'normal' },
];
const SETTINGS = { members: MEMBERS, activeId: 'me', showBadges: true, showPanel: true, debug: false };

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const CONTENT = `(() => { const store = { 'nazar:settings': ${JSON.stringify(SETTINGS)} };
  window.chrome = window.chrome || {}; window.chrome.storage = { local: {
    get: async k => k === null ? store : (k in store ? { [k]: store[k] } : {}), set: async o => Object.assign(store, o), remove: async () => {} },
    onChanged: { addListener() {} } }; })();\n` + manifest.content_scripts[0].js.map(f => fs.readFileSync(path.join(EXT, f), 'utf8')).join('\n;\n');
const ICON = 'data:image/png;base64,' + fs.readFileSync(path.join(EXT, 'icons/icon128.png')).toString('base64');

// Cursor + caption layer injected into every page.
const OVERLAY = `(() => {
  if (document.getElementById('nzv-cap')) return;
  const st = document.createElement('style');
  st.textContent = \`#nzv-cap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(20px); opacity: 0; transition: all .45s ease;
      background: rgba(16,35,28,.94); color: #fff; font: 600 22px/1.3 "Segoe UI", system-ui, sans-serif; padding: 12px 22px; border-radius: 14px;
      z-index: 2147483600; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: 1000px; text-align: center; pointer-events: none; }
    #nzv-cap.on { opacity: 1; transform: translateX(-50%) translateY(0); }
    #nzv-cap b { color: #fbbf24; }
    #nzv-cur { position: fixed; left: 640px; top: 400px; width: 26px; height: 26px; z-index: 2147483601; pointer-events: none;
      transition: left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1); }
    #nzv-cur svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .nzv-ring { position: fixed; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #fbbf24;
      z-index: 2147483600; pointer-events: none; animation: nzvr .5s ease-out forwards; }
    @keyframes nzvr { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }\`;
  document.documentElement.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'nzv-cap'; document.documentElement.appendChild(cap);
  const cur = document.createElement('div'); cur.id = 'nzv-cur';
  cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L16 20l-3 1.5-3.5-7.5L4 18z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(cur);
  window.__nzv = {
    caption(html) { cap.classList.remove('on'); setTimeout(() => { cap.innerHTML = html; if (html) cap.classList.add('on'); }, html && cap.innerHTML ? 250 : 0); },
    move(x, y) { cur.style.left = x + 'px'; cur.style.top = y + 'px'; },
    ripple(x, y) { const r = document.createElement('div'); r.className = 'nzv-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600); },
  };
})();`;

const card = (title, sub, foot) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; } body { background: radial-gradient(circle at 30% 20%, #1d3a2f, #0b1a14 70%); color: #fff;
  font-family: "Segoe UI", system-ui, sans-serif; display: flex; align-items: center; justify-content: center; text-align: center; }
  .w { animation: in .8s ease both; } @keyframes in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  img { width: 96px; height: 96px; } h1 { font-size: 64px; margin: 14px 0 6px; letter-spacing: .01em; } h1 b { color: #fbbf24; }
  p { font-size: 26px; margin: 0 auto; opacity: .92; max-width: 900px; line-height: 1.35; } .f { margin-top: 26px; font-size: 18px; opacity: .7; }
  .chips { margin-top: 22px; display: flex; gap: 10px; justify-content: center; } .chips span { border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: 6px 14px; font-size: 17px; }
</style></head><body><div class="w"><img src="${ICON}"><h1>na<b>z</b>ar</h1><p>${title}</p>${sub ? `<div class="chips">${sub.map(s => `<span>${s}</span>`).join('')}</div>` : ''}${foot ? `<div class="f">${foot}</div>` : ''}</div></body></html>`;

async function connect() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nazar-rec-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${VW},${VH}`,
    `--user-agent=${UA}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let n = 0;
  const pending = new Map(), handlers = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) handlers.forEach(h => h(m));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, on: h => handlers.push(h), close: () => { ws.close(); proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500); } };
}

(async () => {
  const { send, on, close } = await connect();
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nazar-frames-'));
  const frames = []; // { file, t }
  const segments = []; // [{ start, end }]
  const clickTimes = []; // wall-clock seconds, mapped to video time for the soundtrack
  let recording = false;
  on(m => {
    if (m.method !== 'Page.screencastFrame') return;
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    if (!recording) return;
    const file = path.join(frameDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(m.params.data, 'base64'));
    frames.push({ file, t: Date.now() / 1000, seg: segments.length - 1 });
  });
  const startRec = async () => { segments.push({ start: Date.now() / 1000 }); recording = true;
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VW * SCALE, maxHeight: VH * SCALE, everyNthFrame: 1 }); };
  const stopRec = async () => { await sleep(80); recording = false; segments[segments.length - 1].end = Date.now() / 1000; await send('Page.stopScreencast'); };

  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const caption = html => evaluate(`window.__nzv && __nzv.caption(${JSON.stringify(html)})`);
  // Center of an element (optionally inside a Nazar shadow root).
  const rectOf = async (js) => evaluate(`(() => { const el = ${js}; if (!el) return null; el.scrollIntoView && false; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const click = async (js, pause = 900) => {
    const p = await rectOf(js);
    if (!p) { console.log('  (target not found)', js.slice(0, 80)); return false; }
    await evaluate(`__nzv.move(${p.x - 4}, ${p.y - 3})`);
    await sleep(800);
    await evaluate(`__nzv.ripple(${p.x}, ${p.y})`);
    clickTimes.push(Date.now() / 1000);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(pause);
    return true;
  };
  const goto = async (url, settle = 6500) => {
    await send('Page.navigate', { url });
    await sleep(settle);
    await evaluate(`document.activeElement && document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);
    await evaluate(OVERLAY);
  };
  const toFirstCard = () => evaluate(`(() => { const c = [...document.querySelectorAll("div[role='button'][id]")].find(e => /^\\d+$/.test(e.id)); if (c) window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 96); })()`);
  const showCard = async (html, hold) => {
    const f = path.join(os.tmpdir(), `nazar-card-${Date.now()}.html`);
    fs.writeFileSync(f, html);
    await send('Page.navigate', { url: 'file:///' + f.replace(/\\/g, '/') });
    await sleep(300);
    await startRec(); await sleep(hold); await stopRec();
  };
  const badgeIn = cardSel => `(() => { const h = ${cardSel}; return h && h.querySelector('nazar-ui') && h.querySelector('nazar-ui').shadowRoot.querySelector('.badge'); })()`;

  try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: SCALE, mobile: false });
    await send('Browser.grantPermissions', { permissions: ['geolocation'], origin: 'https://blinkit.com' });
    await send('Emulation.setGeolocationOverride', { latitude: 28.5933, longitude: 77.2207, accuracy: 50 });

    // Warm-up (not recorded): lets Blinkit settle a delivery location.
    console.log('warming up');
    await goto('https://blinkit.com/cn/face-cream-lotion/cid/163/164', 8000);

    console.log('scene 1: title');
    await showCard(card('Know what\'s inside, <b style="color:#fbbf24">for everyone in your home</b>.', ['Packaged food', 'Shampoo & skincare', 'Blinkit · Zepto · Instamart']), 3800);

    console.log('scene 2: search');
    await goto('https://blinkit.com/s/?q=protein%20chips');
    await toFirstCard();
    await startRec();
    await caption('Searching <b>"protein chips"</b> on Blinkit…');
    await sleep(1600);
    await evaluate(CONTENT);
    await caption('Every product gets a <b>health score</b>, tuned to you');
    await sleep(6500);
    const flagged = `[...document.querySelectorAll("div[role='button'][id]")].find(c => { const h = c.querySelector('nazar-ui'); return h && h.shadowRoot.querySelector('.flag') && c.getBoundingClientRect().top > 80 && c.getBoundingClientRect().bottom < ${VH - 60}; })`;
    await caption('<b>⚑</b> = the pack makes a claim its own label doesn\'t back up');
    await click(badgeIn(flagged), 3800);
    await caption('Tap any badge: <b>why</b> the score is what it is');
    await evaluate(`(() => { const p = document.querySelector('nazar-ui[data-kind=popover]'); const s = p && p.shadowRoot.querySelector('.pop'); if (s) { let y = 0; const t = setInterval(() => { y += 6; s.scrollTop = y; if (y > 330) clearInterval(t); }, 30); } })()`);
    await sleep(3200);
    await stopRec();

    console.log('scene 3: product page');
    await goto('https://blinkit.com/prn/x/prid/1380466');
    await startRec();
    await caption('Open a product: <b>one score per family member</b>');
    await evaluate(CONTENT);
    await sleep(2600);
    const mem = name => `[...document.querySelector('nazar-ui[data-kind=panel]').shadowRoot.querySelectorAll('.mem')].find(b => b.textContent.trim().endsWith('${name}'))`;
    await caption('Me <b>(gym)</b> · Papa <b>(diabetes)</b> · Mom <b>(BP)</b> · Riya <b>(kid)</b>');
    for (const who of ['Papa', 'Mom', 'Riya', 'Papa']) await click(mem(who), 1300);
    await caption('<b>Claim check:</b> "Protein chips"… only 14% of calories come from protein');
    await sleep(2600);
    await caption('Every point explained: <b>salt −22, fibre +16, calories −14</b>…');
    await evaluate(`(() => { const s = document.querySelector('nazar-ui[data-kind=panel]').shadowRoot.querySelector('.panel'); let y = 0; const t = setInterval(() => { y += 5; s.scrollTop = y; if (y > 420) clearInterval(t); }, 30); })()`);
    await sleep(3600);
    await stopRec();

    console.log('scene 4: personal care');
    await goto('https://blinkit.com/cn/face-cream-lotion/cid/163/164');
    await toFirstCard();
    await startRec();
    await caption('Works for <b>shampoo, soap & skincare</b> too');
    await evaluate(CONTENT);
    await sleep(4200);
    await caption('Matched to <b>your</b> skin & hair: here, sensitive skin');
    await sleep(1800);
    const care = `[...document.querySelectorAll("div[role='button'][id]")].find(c => { const h = c.querySelector('nazar-ui'); return h && /Use with care/.test(h.shadowRoot.textContent) && c.getBoundingClientRect().top > 80 && c.getBoundingClientRect().bottom < ${VH - 60}; })`;
    await click(badgeIn(care), 3400);
    await caption('Flags fragrance, harsh sulfates, <b>steroids in fairness creams</b>…');
    await evaluate(`(() => { const p = document.querySelector('nazar-ui[data-kind=popover]'); const s = p && p.shadowRoot.querySelector('.pop'); if (s) { let y = 0; const t = setInterval(() => { y += 6; s.scrollTop = y; if (y > 260) clearInterval(t); }, 30); } })()`);
    await sleep(3400);
    await stopRec();

    console.log('scene 5: end card');
    await showCard(card('Free. Runs <b style="color:#fbbf24">100% in your browser</b>.<br>No account. No data leaves your device.', ['Blinkit', 'Zepto', 'Instamart'], 'Chrome extension · link in the comments'), 4500);
  } finally {
    close();
  }

  // Frame durations: time until the next frame in the same segment, or until the segment ended.
  console.log('encoding', frames.length, 'frames');
  const list = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const end = next && next.seg === f.seg ? next.t : segments[f.seg].end;
    list.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, end - f.t).toFixed(3)}`);
  });
  list.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  const listFile = path.join(frameDir, 'list.txt');
  fs.writeFileSync(listFile, list.join('\n'));

  // Map wall-clock moments to video time (segments are glued back to back).
  const segOffset = [];
  let total = 0;
  segments.forEach((s, i) => {
    const first = frames.find(f => f.seg === i);
    s.first = first ? first.t : s.start;
    segOffset[i] = total;
    total += s.end - s.first;
  });
  const videoTime = wall => {
    const i = segments.findIndex(s => wall >= s.start && wall <= s.end);
    return i < 0 ? null : segOffset[i] + Math.max(0, wall - segments[i].first);
  };
  const timeline = {
    duration: total,
    clicks: clickTimes.map(videoTime).filter(t => t !== null),
    scenes: segOffset.slice(1),
    musicStart: segOffset[1] || 0,
    outroAt: segOffset[segOffset.length - 1],
  };
  const wav = path.join(frameDir, 'soundtrack.wav');
  require('./soundtrack.js').soundtrack(timeline, wav);

  // Keep a video-only master + timeline so add-music.js can swap the music without re-recording.
  const CACHE = path.join(os.tmpdir(), 'nazar-demo-cache');
  fs.mkdirSync(CACHE, { recursive: true });
  const master = path.join(CACHE, 'video-only.mp4');
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-an', '-movflags', '+faststart', master], { stdio: 'ignore' });
  fs.writeFileSync(path.join(CACHE, 'timeline.json'), JSON.stringify(timeline, null, 1));
  execFileSync(FFMPEG, ['-y', '-i', master, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: 'ignore' });
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB, ${total.toFixed(1)} s, ${clickTimes.length} clicks, ${segments.length} scenes)`);
})();
