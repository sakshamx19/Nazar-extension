// util.js - shared namespace and small helpers. Loaded first in every context
// (content scripts, popup, node tests), so everything hangs off globalThis.Nazar.
(function (root) {
  'use strict';
  const N = root.Nazar = root.Nazar || {};
  N.adapters = N.adapters || [];
  N.debug = N.debug || false;

  // First number in a string: "3.9 g" -> 3.9, "<0.5" -> 0.5
  function num(s) {
    if (s == null) return undefined;
    const m = String(s).match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : undefined;
  }

  const UNIT = '(kg|g|gm|gms|grams?|ml|l|ltr|litres?|liters?)';

  function toGrams(value, unit) {
    const u = unit.toLowerCase();
    return (u === 'kg' || u === 'l' || u === 'ltr' || u.startsWith('lit')) ? value * 1000 : value;
  }

  // Pack size in grams (ml treated as g). "200 g", "1 kg", "1 pc (200 g)", "6 x 30 g"
  function packGrams(text) {
    if (!text) return undefined;
    const t = String(text).toLowerCase();
    const multi = t.match(new RegExp('(\\d+)\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '\\b'));
    if (multi) return +multi[1] * toGrams(+multi[2], multi[3]);
    const one = t.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '\\b'));
    return one ? toGrams(+one[1], one[2]) : undefined;
  }

  function isLiquid(text) {
    return /\d\s*(ml|l|ltr|litres?|liters?)\b|per\s*100\s*ml/i.test(text || '');
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Piecewise-linear lookup. pts = [[x, y], ...] with ascending x.
  function interp(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  }

  const round = (v, d = 1) => v == null ? v : Math.round(v * 10 ** d) / 10 ** d;

  N.util = { num, packGrams, isLiquid, esc, clamp, interp, round };
  N.log = (...a) => { if (N.debug) console.log('%c[Nazar]', 'color:#0f766e;font-weight:bold', ...a); };

  if (typeof module !== 'undefined') module.exports = N;
})(typeof globalThis !== 'undefined' ? globalThis : this);
