// Puts a real music track under the last recorded demo video, keeping the click
// "pops" and scene "whooshes" in sync. Run tools/record-demo.js once first.
//
// Usage: FFMPEG=/path/to/ffmpeg node tools/add-music.js <music.mp3> [out.mp4] [--volume 0.6] [--start 12]
//   --volume  music level (0-1, default 0.6; effects stay at full level)
//   --start   skip this many seconds into the song (e.g. to start at the drop)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? parseFloat(args.splice(i, 2)[1]) : def; };
const volume = flag('--volume', 0.6);
const start = flag('--start', 0);
const [music, outArg] = args;
if (!music || !fs.existsSync(music)) { console.error('Usage: node tools/add-music.js <music.mp3> [out.mp4] [--volume 0.6] [--start 0]'); process.exit(1); }

const FFMPEG = process.env.FFMPEG || (() => { try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; } })();
const CACHE = path.join(os.tmpdir(), 'nazar-demo-cache');
const master = path.join(CACHE, 'video-only.mp4');
if (!fs.existsSync(master)) { console.error('No recording found. Run tools/record-demo.js first.'); process.exit(1); }
const timeline = JSON.parse(fs.readFileSync(path.join(CACHE, 'timeline.json'), 'utf8'));
const OUT = path.resolve(outArg || path.join(__dirname, '..', '..', 'nazar-demo.mp4'));

const sfx = path.join(CACHE, 'sfx.wav');
require('./soundtrack.js').soundtrack(Object.assign({}, timeline, { music: false }), sfx);

const d = timeline.duration;
const filter = `[2:a]atrim=0:${d.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st=${(d - 3).toFixed(2)}:d=3,volume=${volume}[m];` +
  `[1:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`;
execFileSync(FFMPEG, ['-y', '-i', master, '-i', sfx, '-ss', String(start), '-stream_loop', '-1', '-i', music,
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: 'ignore' });
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) with ${path.basename(music)} at volume ${volume}`);
