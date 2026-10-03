// claims.js - "Claim check" for food: compares what the pack says (name, key
// features) with what the label shows. Only label facts are used, never opinions.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { round } = N.util;

  function check(product, n, ing) {
    const name = (product.name || '').toLowerCase();
    const claimText = [product.name, product.features, product.description].filter(Boolean).join(' ').toLowerCase();
    const out = [];
    const push = (claim, reality, sev = 2) => out.push({ claim, reality, sev });

    // Protein claims: share of calories coming from protein.
    if (/protein/.test(name) && n.protein !== undefined && n.energy) {
      const share = (n.protein * 4) / n.energy;
      if (share < 0.15) {
        push('"Protein" in the name', `Only ${round(share * 100, 0)}% of calories come from protein (${round(n.protein)} g / 100 g)` +
          (n.sugar !== undefined && n.sugar > n.protein ? `, and there is more sugar (${round(n.sugar)} g) than protein.` : '.'), 3);
      }
    }

    // Grain claims vs the first ingredient.
    if (ing && ing.firstIsRefined && /multi[\s-]*grain|whole\s*wheat|atta|millet|ragi|jowar|bajra|oats|digestive|high\s*fib(re|er)|brown\s*bread/.test(claimText)) {
      push('Multigrain / atta / millet claim', `The first (largest) ingredient is "${ing.first}", i.e. refined flour.`, 3);
    }

    // Sugar claims.
    if (/no\s*added\s*sugar|sugar[\s-]*free|zero\s*sugar|without\s*added\s*sugar/.test(claimText)) {
      const realSugars = ing ? ing.sugars : [];
      if (realSugars.length) push('"No added sugar" / "sugar free"', `Ingredients include ${realSugars.slice(0, 3).join(', ')}.`, 3);
      else if (/sugar[\s-]*free|zero\s*sugar/.test(claimText) && n.sugar !== undefined && n.sugar > 0.5) {
        push('"Sugar free"', `The label shows ${round(n.sugar)} g sugar / 100 g.`, 2);
      }
      if (ing && ing.has('sweetener')) push('What "sugar free" means here', 'The sweetness comes from an artificial sweetener.', 1);
    }

    // Baked / not fried.
    if (/\bbaked\b|not\s*fried|non[\s-]*fried/.test(claimText) && n.fat !== undefined && n.fat > 20) {
      push('"Baked / not fried"', `Still ${round(n.fat)} g fat / 100 g.`, 2);
    }

    // Fibre claims (6 g / 100 g is the common "high fibre" bar).
    if (/high\s*(in\s*)?fib(re|er)|fib(re|er)\s*rich|rich\s*in\s*fib(re|er)/.test(claimText) && n.fibre !== undefined && n.fibre < 6) {
      push('"High fibre"', `Only ${round(n.fibre)} g fibre / 100 g.`, 2);
    }

    // Low fat / lite.
    if (/low[\s-]*fat|\blite\b|\blight\b/.test(name) && n.fat !== undefined && n.fat > 3) {
      push('"Low fat / lite"', `${round(n.fat)} g fat / 100 g.`, 2);
    }

    // "No preservatives" / "natural" vs additive codes.
    if (/no\s*preservatives?|preservative[\s-]*free/.test(claimText) && ing && ing.has('preservative')) {
      push('"No preservatives"', 'Preservative found in ingredients: ' + ing.flags.find(f => f.key === 'preservative').details.join(', '), 3);
    }
    if (/\b(100%\s*)?natural\b/.test(name) && ing && (ing.has('colour') || ing.has('flavour') || ing.has('sweetener'))) {
      push('"Natural"', 'Ingredients include an artificial colour, flavour or sweetener.', 2);
    }

    // Generic "healthy" naming with a poor nutrition profile is handled in score.js
    // because it depends on the final score.
    return out.sort((a, b) => b.sev - a.sev);
  }

  N.claims = { check };
})(typeof globalThis !== 'undefined' ? globalThis : this);
