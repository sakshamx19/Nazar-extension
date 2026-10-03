// ingredients.js - reads an ingredient list and flags things worth knowing:
// refined flour, palm oil, hydrogenated fat, added sugars, sweeteners, colours
// and other ultra-processing markers (INS / E codes included).
(function (root) {
  'use strict';
  const N = root.Nazar;

  // INS code ranges -> flag key. Acidity regulators, antioxidants and raising
  // agents (300s, 500s, citric acid etc.) are deliberately not flagged.
  function codeFlag(code) {
    const c = parseInt(code, 10);
    if ([102, 104, 110, 122, 124, 127, 129, 132, 133, 142, 143].includes(c)) return 'colour';
    if (c >= 150 && c <= 155) return 'caramel';
    if (c >= 200 && c <= 252 && ![260, 270, 290, 296].includes(c)) return 'preservative';
    if (c >= 400 && c <= 499) return 'emulsifier';
    if ([620, 621, 622, 627, 631, 635].includes(c)) return 'enhancer';
    if ([950, 951, 952, 954, 955, 961, 962, 969].includes(c)) return 'sweetener';
    if (c >= 1400 && c <= 1452) return 'modifiedStarch';
    return null;
  }

  const FLAGS = {
    hydrogenated: { label: 'Hydrogenated fat / vanaspati', sev: 3, why: 'Risk of trans fat', re: /hydrogenated|vanaspati|interesterified/i },
    palm: { label: 'Palm oil', sev: 2, why: 'High in saturated fat', re: /\bpalm\b|palmolein/i },
    maida: { label: 'Maida (refined flour)', sev: 2, why: 'Wheat flour with the fibre removed', re: /maida|refined\s*(wheat\s*)?flour/i },
    sugar: { label: 'Added sugar', sev: 2, why: 'Sugar added during manufacturing', re: null },
    sweetener: { label: 'Artificial sweetener', sev: 2, why: 'Sucralose, aspartame etc.', re: /sucralose|aspartame|acesulfame|saccharin|neotame/i },
    colour: { label: 'Synthetic colour', sev: 2, why: 'Artificial food colour', re: /tartrazine|sunset\s*yellow|carmoisine|ponceau|allura\s*red|brilliant\s*blue|erythrosine|indigo\s*carmine|fast\s*green|synthetic\s*(food\s*)?colou?rs?|artificial\s*colou?rs?/i },
    caramel: { label: 'Caramel colour', sev: 1, why: 'Added colour', re: /caramel\s*colou?r/i },
    enhancer: { label: 'Flavour enhancer (MSG etc.)', sev: 1, why: 'Boosts taste artificially', re: /monosodium\s*glutamate|\bmsg\b|disodium\s*(inosinate|guanylate)/i },
    preservative: { label: 'Preservative', sev: 1, why: 'Added to extend shelf life', re: /sodium\s*benzoate|potassium\s*sorbate|sorbic\s*acid|benzoic\s*acid|metabisulphite|sulphites?|nitrite/i },
    emulsifier: { label: 'Emulsifier / stabiliser', sev: 1, why: 'A marker of ultra-processed food', re: /emulsifiers?|stabili[sz]ers?|thickeners?|thickening\s*agents?/i },
    flavour: { label: 'Artificial flavour', sev: 1, why: 'Lab-made flavouring', re: /artificial\s*flavou?r|nature[\s-]*identical|added\s*flavou?rs?\b/i },
    modifiedStarch: { label: 'Modified starch', sev: 1, why: 'Processed thickener', re: /modified\s*starch/i },
    caffeine: { label: 'Caffeine', sev: 1, why: 'Not suitable for children', re: /caffeine|guarana|coffee\s*(extract|powder)/i },
  };

  const SUGAR_RE = /\b(sugar|cane\s*sugar|brown\s*sugar|glucose\s*syrup|liquid\s*glucose|corn\s*syrup|invert\s*(?:sugar|syrup)|dextrose|maltodextrin|fructose|sucrose|jaggery|honey|malt\s*extract|maltose|golden\s*syrup)\b/gi;
  const WHOLE_RE = /^(whole\s*wheat|atta|whole\s*grain|oats?|rolled\s*oats|millets?|ragi|jowar|bajra|brown\s*rice|quinoa|barley|peanuts?|almonds?|cashews?|nuts|chickpea|chana|moong|masoor|urad|rajma|dal|lentils?|tepary\s*beans?|moth\s*beans?|gram\s*(pulse\s*)?flour|besan|milk|curd|paneer|toned\s*milk|pasteuri[sz]ed)/i;

  // Split on commas that are not inside brackets.
  function topLevel(text) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of text) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';') && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function codesIn(text) {
    const codes = new Set();
    for (const m of text.matchAll(/\b(?:INS|E)\s*-?\s*(\d{3,4})[a-z]?/gi)) codes.add(m[1]);
    // "(330, 296)" style lists after "Acidity Regulator"
    for (const m of text.matchAll(/\(([\d\s,&a-z()]*\d{3,4}[\d\s,&a-z()]*)\)/gi)) {
      if (/\b(g|gm|ml|kg)\b|%/i.test(m[1])) continue;
      for (const c of m[1].matchAll(/(?<!\d)(\d{3,4})(?!\d)/g)) codes.add(c[1]);
    }
    return [...codes];
  }

  function analyze(text) {
    if (!text || !String(text).trim()) return null;
    const raw = String(text).replace(/\s+/g, ' ').trim().replace(/^ingredients?\s*[:\-]\s*/i, '');
    // Remove phrases that mention sugar without adding any.
    const cleaned = raw.replace(/(no|without|free\s*from|zero)\s+added\s+sugars?|sugar[\s-]*free|no\s+sugar/gi, ' ');
    const items = topLevel(raw);
    const first = (items[0] || '').replace(/[([].*$/, '').replace(/\d+(\.\d+)?\s*%/, '').trim();

    const found = {};
    const add = (key, detail) => {
      if (!found[key]) found[key] = Object.assign({ key, details: [] }, FLAGS[key]);
      if (detail && !found[key].details.includes(detail)) found[key].details.push(detail);
    };
    for (const [key, f] of Object.entries(FLAGS)) {
      if (!f.re) continue;
      const m = cleaned.match(f.re);
      if (m) add(key, m[0]);
    }
    for (const code of codesIn(cleaned)) {
      const key = codeFlag(code);
      if (key) add(key, 'INS ' + code);
    }
    const sugars = [...new Set([...cleaned.matchAll(SUGAR_RE)].map(m => m[1].toLowerCase().replace(/\s+/g, ' ')))];
    if (sugars.length) sugars.forEach(s => add('sugar', s));

    // Where an ingredient sits matters: first three are the bulk of the product.
    const top3 = items.slice(0, 3).join(' | ');
    const flags = Object.values(found).map(f => {
      const inTop = f.key === 'sugar' ? SUGAR_RE.test(top3.replace(/(no|without)\s+added\s+sugars?/gi, '')) : (f.re ? f.re.test(top3) : false);
      SUGAR_RE.lastIndex = 0;
      return Object.assign({}, f, { inTop3: inTop, sev: f.sev + (inTop && f.sev >= 2 ? 1 : 0) });
    }).sort((a, b) => b.sev - a.sev);

    const upfKeys = ['hydrogenated', 'sweetener', 'colour', 'caramel', 'enhancer', 'emulsifier', 'flavour', 'modifiedStarch'];
    const upfMarkers = flags.filter(f => upfKeys.includes(f.key)).length
      + (sugars.some(s => /maltodextrin|glucose syrup|corn syrup|invert|dextrose/.test(s)) ? 1 : 0);

    return {
      raw,
      items,
      first,
      firstIsRefined: FLAGS.maida.re.test(first),
      firstIsWhole: WHOLE_RE.test(first),
      flags,
      sugars,
      upfMarkers,
      has: key => !!found[key],
    };
  }

  N.ingredients = { analyze, topLevel, FLAGS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
