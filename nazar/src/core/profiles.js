// profiles.js - what each health goal cares about.
//
// Every profile starts from the General weights and only ADDS strictness on top
// (`extra`), so a profile can never make junk food look better than General does.
// Weights are penalty points at their worst (negatives) or bonus points at their
// best (protein, fibre). All of it is shown in the UI under "Why this score?".
(function (root) {
  'use strict';
  const N = root.Nazar;

  const BASE = { sugar: 22, fat: 10, satFat: 18, sodium: 18, energy: 14, trans: 12, carbs: 0, refinedFirst: 14, upf: 10, protein: 10, fibre: 10 };

  const PROFILES = {
    general: {
      label: 'General', icon: '🙂', blurb: 'Balanced view for everyday eating',
      extra: {},
    },
    diabetes: {
      label: 'Diabetes', icon: '🩸', blurb: 'Strictest on sugar, refined carbs and maida',
      extra: { sugar: 16, carbs: 14, refinedFirst: 8, fibre: 6 },
      cap: (n, ing) => {
        const s = n.addedSugar !== undefined ? n.addedSugar : n.sugar;
        if (s !== undefined && s > 22.5) return { max: 20, why: 'Very high sugar (>22.5 g / 100 g)' };
        if (ing && ing.flags.some(f => f.key === 'sugar' && f.inTop3)) return { max: 40, why: 'Sugar is in the top 3 ingredients' };
      },
    },
    heart: {
      label: 'Heart / BP', icon: '❤️', blurb: 'Strict on salt, saturated fat and trans fat',
      extra: { sodium: 14, satFat: 10, trans: 12, fibre: 2 },
      cap: n => {
        if (n.transFat !== undefined && n.transFat > 0.2) return { max: 30, why: 'Contains trans fat' };
        if (n.sodium !== undefined && n.sodium > 600) return { max: 35, why: 'High sodium (>600 mg / 100 g)' };
      },
    },
    weightloss: {
      label: 'Weight loss', icon: '⚖️', blurb: 'Fewer calories, more fullness: protein and fibre earn a bonus',
      extra: { energy: 14, fat: 4, sugar: 4, protein: 6, fibre: 6 },
      proteinByCalories: true,
    },
    gym: {
      label: 'Gym / Protein', icon: '💪', blurb: 'What matters most is how much of the calories come from protein',
      extra: { protein: 14, sugar: 2 },
      proteinByCalories: true,
    },
    kids: {
      label: 'Kids', icon: '🧒', blurb: 'Strict on sugar, colours, sweeteners and caffeine',
      extra: { sugar: 10, sodium: 4, upf: 4 },
      cap: (n, ing) => {
        if (ing && (ing.has('colour') || ing.has('sweetener') || ing.has('caffeine'))) return { max: 40, why: 'Synthetic colour, sweetener or caffeine is not for children' };
      },
    },
  };

  for (const p of Object.values(PROFILES)) {
    p.w = {};
    for (const k of Object.keys(BASE)) p.w[k] = BASE[k] + (p.extra[k] || 0);
  }

  N.PROFILES = PROFILES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
