// score.js - 0-100 score for one product and one profile, with every point explained.
//
// Negative nutrients use UK FSA front-of-pack cut-offs (medium / high per 100 g or
// 100 ml) as anchors. Penalty grows 0 -> 20% at "medium", 60% at "high" and 100%
// at twice "high". Protein and fibre earn bonus points. Ingredients add penalties
// for ultra-processing markers. Some profiles also have hard caps.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { interp, clamp, round } = N.util;

  const FOOD = { sugar: [5, 22.5], fat: [3, 17.5], satFat: [1.5, 5], sodium: [120, 600] };
  const DRINK = { sugar: [2.5, 11.25], fat: [1.5, 8.75], satFat: [0.75, 2.5], sodium: [120, 300] };
  const ENERGY_FOOD = [[100, 0], [250, 0.3], [400, 0.6], [550, 1]];
  const ENERGY_DRINK = [[20, 0], [50, 0.4], [100, 0.8], [150, 1]];

  const band = ([med, high]) => [[0, 0], [med, 0.2], [high, 0.6], [high * 2, 1]];
  const level = (v, [med, high]) => v > high ? 'high' : v > med ? 'medium' : 'low';

  const VERDICTS = [
    { min: 70, key: 'great', label: 'Great choice', line: 'Fine to eat every day' },
    { min: 50, key: 'ok', label: 'Okay', line: 'Fine in normal portions' },
    { min: 30, key: 'some', label: 'Occasional treat', line: 'Treat it as a treat, not daily food' },
    { min: 0, key: 'avoid', label: 'Avoid', line: 'Look for a better option' },
  ];
  const verdictFor = s => VERDICTS.find(v => s >= v.min);

  function score(product, profileKey) {
    const P = N.PROFILES[profileKey] || N.PROFILES.general;
    const w = P.w;
    const n = product.nutrition || {};
    const ing = product.ingredientsText ? N.ingredients.analyze(product.ingredientsText) : null;
    const cov = N.nutrition.coverage(n);

    if (cov.have < 3) {
      return { score: null, verdict: { key: 'unknown', label: 'No data', line: 'This listing has no nutrition information' }, reasons: [], ing, cov, profile: P };
    }

    const liquid = !!product.liquid;
    const T = liquid ? DRINK : FOOD;
    const unit = liquid ? 'ml' : 'g';
    const reasons = [];
    let penalty = 0, bonus = 0;

    const neg = (key, label, value, fraction, weight, detail) => {
      if (!weight || value === undefined) return;
      const pts = fraction * weight;
      penalty += pts;
      if (pts >= 0.5) reasons.push({ key, label, pts: -pts, detail });
    };

    // Sugar: added sugar when the listing gives it, else total sugar.
    if (n.addedSugar !== undefined) {
      neg('addedSugar', 'Added sugar', n.addedSugar, interp(n.addedSugar, band(T.sugar)), w.sugar,
        `${round(n.addedSugar)} g / 100 ${unit} (${level(n.addedSugar, T.sugar)})`);
      if (n.sugar !== undefined && n.sugar > n.addedSugar) {
        neg('sugar', 'Total sugar', n.sugar, interp(n.sugar, band(T.sugar)), w.sugar * 0.25,
          `${round(n.sugar)} g / 100 ${unit}, including natural sugars`);
      }
    } else if (n.sugar !== undefined) {
      neg('sugar', 'Sugar', n.sugar, interp(n.sugar, band(T.sugar)), w.sugar,
        `${round(n.sugar)} g / 100 ${unit} (${level(n.sugar, T.sugar)})`);
    }
    if (n.satFat !== undefined) neg('satFat', 'Saturated fat', n.satFat, interp(n.satFat, band(T.satFat)), w.satFat,
      `${round(n.satFat)} g / 100 ${unit} (${level(n.satFat, T.satFat)})`);
    else if (n.fat !== undefined && n.fat > T.fat[1]) {
      // Listing skipped saturated fat on a high-fat product (butter, ghee, namkeen).
      // Assume 40% of fat is saturated rather than giving a free pass.
      const est = n.fat * 0.4;
      neg('satFat', 'Saturated fat (estimated)', est, interp(est, band(T.satFat)), w.satFat,
        `Not listed; assumed ~40% of ${round(n.fat)} g fat`);
    }
    if (n.fat !== undefined) neg('fat', 'Total fat', n.fat, interp(n.fat, band(T.fat)), w.fat,
      `${round(n.fat)} g / 100 ${unit} (${level(n.fat, T.fat)})`);
    if (n.sodium !== undefined) neg('sodium', 'Sodium (salt)', n.sodium, interp(n.sodium, band(T.sodium)), w.sodium,
      `${round(n.sodium, 0)} mg / 100 ${unit} (${level(n.sodium, T.sodium)})`);
    if (n.energy !== undefined) neg('energy', 'Calories', n.energy, interp(n.energy, liquid ? ENERGY_DRINK : ENERGY_FOOD), w.energy,
      `${round(n.energy, 0)} kcal / 100 ${unit}`);
    if (n.transFat !== undefined && n.transFat > 0.2) neg('transFat', 'Trans fat', n.transFat, interp(n.transFat, [[0.2, 0.3], [0.5, 0.7], [1, 1]]), w.trans,
      `${round(n.transFat, 2)} g / 100 ${unit}`);
    if (w.carbs && n.carbs !== undefined) neg('carbs', 'Carbohydrates', n.carbs, interp(n.carbs, [[30, 0], [60, 0.6], [80, 1]]), w.carbs,
      `${round(n.carbs)} g / 100 ${unit}`);

    if (ing) {
      if (ing.firstIsRefined) neg('refinedFirst', 'Maida is the first ingredient', 1, 1, w.refinedFirst, `"${ing.first}" is the largest ingredient`);
      const sevSum = ing.flags.filter(f => f.key !== 'sugar' && f.key !== 'maida').reduce((s, f) => s + f.sev, 0);
      if (sevSum) neg('ingredients', 'Processing markers', sevSum, Math.min(1, sevSum / 8), w.upf,
        ing.flags.filter(f => f.key !== 'sugar' && f.key !== 'maida').map(f => f.label).join(', '));
    }

    // Bonuses. Protein counts half when the product is already heavily penalised,
    // so a protein-rich namkeen can't hide its salt and fat.
    // Gym / weight-loss judge protein by the share of calories it supplies, so
    // fried snacks with "some protein" don't win.
    if (n.protein !== undefined) {
      let pts, detail;
      if (P.proteinByCalories && n.energy) {
        const share = (n.protein * 4) / n.energy;
        pts = interp(share, [[0.1, 0], [0.2, 0.5], [0.35, 1]]) * w.protein;
        detail = `${round(n.protein)} g / 100 ${unit}, ${round(share * 100, 0)}% of calories from protein`;
      } else {
        pts = interp(n.protein, liquid ? [[1, 0], [3, 0.5], [6, 1]] : [[3, 0], [8, 0.5], [15, 1]]) * w.protein;
        detail = `${round(n.protein)} g / 100 ${unit}`;
      }
      if (penalty > 40) pts /= 2;
      if (pts >= 0.5) { bonus += pts; reasons.push({ key: 'protein', label: 'Protein', pts, detail }); }
    }
    if (n.fibre !== undefined) {
      const pts = interp(n.fibre, [[1, 0], [3, 0.5], [6, 1]]) * w.fibre;
      if (pts >= 0.5) { bonus += pts; reasons.push({ key: 'fibre', label: 'Fibre', pts, detail: `${round(n.fibre)} g / 100 ${unit}` }); }
    }
    if (ing && ing.firstIsWhole) { bonus += 3; reasons.push({ key: 'whole', label: 'Whole food base', pts: 3, detail: `First ingredient: ${ing.first}` }); }

    // Maida-first products usually get their fibre/protein from additives, so
    // their bonuses count for less.
    if (ing && ing.firstIsRefined) bonus *= 0.6;
    let s = clamp(100 - 1.2 * penalty + Math.min(bonus, 25), 0, 100);

    const caps = [];
    if (n.transFat !== undefined && n.transFat > 0.5) caps.push({ max: 30, why: 'Trans fat > 0.5 g / 100 g' });
    if (ing && ing.has('hydrogenated')) caps.push({ max: 40, why: 'Hydrogenated fat / vanaspati' });
    const pc = P.cap && P.cap(n, ing);
    if (pc) caps.push(pc);
    let capped = null;
    for (const c of caps) if (s > c.max) { s = c.max; capped = c; }

    s = Math.round(s);
    reasons.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    const claims = N.claims.check(product, n, ing);
    if (s < 40 && /health|healthy|diet|nutri|fit/i.test(product.name || '')) {
      claims.push({ claim: '"Healthy / diet / nutri" in the name', reality: `Scores only ${s}/100 for this profile.`, sev: 2 });
    }

    return {
      score: s,
      verdict: verdictFor(s),
      reasons,
      capped,
      claims,
      ing,
      cov,
      partial: cov.have < cov.of,
      profile: P,
      penalty: round(penalty * 1.2, 1),
      bonus: round(Math.min(bonus, 25), 1),
    };
  }

  // Whole-pack numbers that are easier to feel than "per 100 g".
  function packMath(product) {
    const n = product.nutrition || {};
    const g = product.packG;
    if (!g) return null;
    const f = g / 100;
    const out = { grams: g };
    if (n.energy !== undefined) { out.kcal = Math.round(n.energy * f); out.walkMin = Math.round(out.kcal / 5); out.rotis = round(out.kcal / 100, 1); }
    const sugar = n.addedSugar !== undefined && n.addedSugar > 0 ? n.addedSugar : n.sugar;
    if (sugar !== undefined) out.sugarTsp = round(sugar * f / 4, 1);
    if (n.sodium !== undefined) out.saltPct = Math.round(n.sodium * f * 2.5 / 5000 * 100);
    if (n.protein !== undefined) {
      out.protein = round(n.protein * f, 1);
      if (product.price) out.proteinPer10 = round(out.protein / product.price * 10, 1);
    }
    if (product.price) out.per100 = round(product.price / f, 0);
    return out;
  }

  // One entry point for the UI: food gets the nutrition score for the member's
  // food profile, personal care gets the suitability check for their skin / hair.
  function evaluate(product, member) {
    if (product.kind === 'care') return N.care.careScore(product, member);
    return Object.assign(score(product, member.profile), { kind: 'food' });
  }

  // Should a card / panel show anything at all for this product?
  function hasVerdict(product) {
    if (product.kind === 'care') return !!product.ingredientsText;
    if (product.kind === 'other') return false;
    return score(product, 'general').score !== null;
  }

  N.score = score;
  N.evaluate = evaluate;
  N.hasVerdict = hasVerdict;
  N.packMath = packMath;
  N.VERDICTS = VERDICTS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
