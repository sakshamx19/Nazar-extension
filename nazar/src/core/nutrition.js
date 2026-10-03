// nutrition.js - turns any nutrition text into one normalised object per 100 g/ml.
//
// Handles the formats seen on Indian quick-commerce listings:
//   Zepto:   "Energy (kcal): 572.0, Protein (g): 12.5, Total Sugar (g): 3.6, ..."
//   Blinkit: "Energy: 86.4 kcal, Total Fat: 6.0 g, ..." and typed fields like
//            "Protein Per 100 g" = "3 g"
//   Packs:   "Energy 480kcal Protein 6g Carbohydrate 60g" (no separators)
//
// Output keys: energy (kcal), protein, carbs, sugar, addedSugar, fat, satFat,
// transFat, fibre (g), sodium, cholesterol (mg).
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { round } = N.util;

  // Order matters: longer / more specific names first so "Saturated Fat" is not read as "Fat".
  const NAMES = [
    ['skip', 'unsaturated\\s*fat(?:ty\\s*acids?)?|mono\\s*-?\\s*unsaturated[a-z ]*|poly\\s*-?\\s*unsaturated[a-z ]*|mufa|pufa|omega\\s*-?\\s*\\d'],
    ['skip', 'sugar\\s*alcohols?|polyols?|lactose|starch|vitamin\\s*[a-z0-9]*|calcium|iron|potassium|magnesium|zinc|phosphorus'],
    ['addedSugar', 'added\\s*sugars?'],
    ['sugar', 'total\\s*sugars?|sugars?'],
    ['satFat', 'saturated\\s*fat(?:ty\\s*acids?)?|saturates'],
    ['transFat', 'trans\\s*fat(?:ty\\s*acids?)?'],
    ['fat', 'total\\s*fat|fats?'],
    ['carbs', 'total\\s*carbohydrates?|carbohydrates?|carbs'],
    ['fibre', 'dietary\\s*fib(?:re|er)s?|fib(?:re|er)s?'],
    ['protein', 'proteins?'],
    ['sodium', 'sodium'],
    ['salt', 'salt'],
    ['cholesterol', 'cholesterol'],
    ['energy', 'energy|calories'],
  ];
  const NAME_RE = new RegExp('\\b(' + NAMES.map(n => n[1]).join('|') + ')\\b', 'gi');
  const KEY_OF = NAMES.map(([key, src]) => [key, new RegExp('^(?:' + src + ')$', 'i')]);

  const GRAM_KEYS = ['protein', 'carbs', 'sugar', 'addedSugar', 'fat', 'satFat', 'transFat', 'fibre', 'salt'];
  const MG_KEYS = ['sodium', 'cholesterol'];

  function keyFor(name) {
    const clean = name.trim().replace(/\s+/g, ' ');
    for (const [key, re] of KEY_OF) if (re.test(clean)) return key;
    return null;
  }

  // One "name ... value unit" chunk -> [key, value] in canonical units, or null.
  function readPiece(key, piece) {
    if (key === 'skip') return null;
    let value, unit;
    if (key === 'energy') {
      // Prefer the kcal figure when both kJ and kcal are given.
      const kcal = piece.match(/(\d+(?:\.\d+)?)\s*k?cal\b/i) || piece.match(/\(\s*k?cal\s*\)[^\d]*(\d+(?:\.\d+)?)/i);
      if (kcal) { value = parseFloat(kcal[1]); unit = 'kcal'; }
    }
    if (value === undefined) {
      const m = piece.match(/(\d+(?:\.\d+)?)\s*(kcal|kj|mcg|µg|mg|gms?|g)?\b/i);
      if (!m) return null;
      value = parseFloat(m[1]);
      unit = (m[2] || '').toLowerCase();
      if (!unit) {
        const paren = piece.match(/\(\s*(kcal|kj|mcg|µg|mg|gms?|g)\s*\)/i);
        if (paren) unit = paren[1].toLowerCase();
      }
    }
    if (unit === 'gm' || unit === 'gms') unit = 'g';

    if (key === 'energy') {
      if (unit === 'kj') value = value / 4.184;
    } else if (GRAM_KEYS.includes(key)) {
      if (unit === 'kcal' || unit === 'kj') return null;
      if (unit === 'mg') value = value / 1000;
      if (unit === 'mcg' || unit === 'µg') value = value / 1e6;
    } else if (MG_KEYS.includes(key)) {
      if (unit === 'g') value = value * 1000;
      if (unit === 'mcg' || unit === 'µg') value = value / 1000;
    }
    return [key, value];
  }

  // Basis of a free-text table: '100' (per 100 g/ml), a serving size in grams, or 'serving' (unknown size).
  function tableBasis(text) {
    if (/(per|\/)\s*100\s*(g|gm|ml)\b|100\s*(g|ml)\s*(contains|provides)/i.test(text)) return '100';
    const sized = text.match(/per\s*(?:serv(?:e|ing)\s*)?\(?\s*(\d+(?:\.\d+)?)\s*(g|gm|ml)\b/i);
    if (sized && parseFloat(sized[1]) !== 100) return parseFloat(sized[1]);
    if (/per\s*serv(e|ing)/i.test(text)) return 'serving';
    return '100'; // most listings omit the basis; sanity checks below catch the bad ones
  }

  // Free-text table -> { values, basis }
  function parseTable(text) {
    const out = {};
    if (!text) return { values: out, basis: null };
    const t = String(text).replace(/ /g, ' ');
    const hits = [...t.matchAll(NAME_RE)];
    hits.forEach((h, i) => {
      const key = keyFor(h[1]);
      if (!key) return;
      const piece = t.slice(h.index + h[1].length, i + 1 < hits.length ? hits[i + 1].index : t.length);
      const read = readPiece(key, piece);
      if (read && out[read[0]] === undefined) out[read[0]] = read[1];
    });
    const basis = tableBasis(t);
    if (typeof basis === 'number') {
      const f = 100 / basis;
      for (const k of Object.keys(out)) out[k] *= f;
      return { values: out, basis: '100' };
    }
    return { values: basis === 'serving' ? {} : out, basis };
  }

  // Typed per-100 fields, e.g. [{ name: 'Protein Per 100 g', value: '3 g' }]
  function parseFields(fields) {
    const out = {};
    for (const { name, value } of fields) {
      const nm = name.replace(/per\s*100\s*(g|ml)/i, '').trim();
      const key = keyFor(nm);
      if (!key) continue;
      const read = readPiece(key, ' ' + value);
      if (read && out[read[0]] === undefined) out[read[0]] = read[1];
    }
    return out;
  }

  // Merge sources, convert salt, drop impossible values and record warnings.
  function finalize(primary, secondary) {
    const n = Object.assign({}, secondary || {}, primary || {});
    const warnings = [];
    if (primary && secondary) {
      for (const k of Object.keys(primary)) {
        const a = primary[k], b = secondary[k];
        if (b === undefined || a === undefined) continue;
        const diff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);
        if (diff > 0.2) warnings.push(`${k}: listing says ${round(a)} and ${round(b)} in two places`);
      }
    }
    if (n.sodium === undefined && n.salt !== undefined) n.sodium = n.salt * 400;
    delete n.salt;

    for (const k of GRAM_KEYS) if (n[k] !== undefined && (n[k] < 0 || n[k] > 100)) { warnings.push(`${k} value ${n[k]} g dropped (impossible per 100 g)`); delete n[k]; }
    if (n.energy !== undefined && (n.energy < 0 || n.energy > 950)) { warnings.push(`energy ${n.energy} kcal dropped`); delete n.energy; }
    if (n.sodium !== undefined && n.sodium > 40000) delete n.sodium;
    if (n.satFat !== undefined && n.fat !== undefined && n.satFat > n.fat + 0.5) warnings.push('saturated fat is more than total fat');
    if (n.addedSugar !== undefined && n.sugar !== undefined && n.addedSugar > n.sugar + 0.5) n.sugar = n.addedSugar;

    // Calories should roughly equal 4*protein + 4*carbs + 9*fat. Big gaps usually
    // mean per-serving numbers or typos.
    if (n.protein !== undefined && n.carbs !== undefined && n.fat !== undefined) {
      const est = 4 * n.protein + 4 * n.carbs + 9 * n.fat;
      if (n.energy === undefined) { n.energy = est; n._energyEstimated = true; }
      else if (Math.abs(est - n.energy) / Math.max(n.energy, 1) > 0.25) {
        warnings.push(`calories (${round(n.energy, 0)}) don't match protein/carbs/fat (~${round(est, 0)})`);
      }
    }
    for (const k of Object.keys(n)) if (typeof n[k] === 'number') n[k] = round(n[k], 2);
    return { nutrition: n, warnings };
  }

  // Core nutrients needed for a confident score.
  function coverage(n) {
    const core = ['energy', 'sugar', 'fat', 'satFat', 'sodium', 'protein'];
    const have = core.filter(k => n[k] !== undefined || (k === 'sugar' && n.addedSugar !== undefined));
    return { have: have.length, of: core.length, missing: core.filter(k => !have.includes(k)) };
  }

  N.nutrition = { parseTable, parseFields, finalize, coverage, keyFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
