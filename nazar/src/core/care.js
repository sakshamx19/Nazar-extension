// care.js - personal care (shampoo, soap, face wash, creams, serums, sunscreen...).
//
// There is no nutrition label here, so this is a SUITABILITY check: given a family
// member's skin and hair type, how well does the ingredient list fit? It flags known
// irritants and harsh ingredients, rewards actives that address the member's concern,
// and checks pack claims ("sulfate free", hero ingredients) against the INCI list.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { clamp, round } = N.util;

  /* ---------------------------------------------------------- product type */

  const TYPES = [
    ['sunscreen', /sun\s*screen|sunscreen|sun\s*block|\bspf\s*\d+|sun\s*(gel|cream|lotion|stick|fluid)/i, 'face', 'leave'],
    ['shampoo', /shampoo/i, 'hair', 'rinse'],
    ['conditioner', /conditioner/i, 'hair', 'rinse'],
    ['hairOil', /hair\s*oil|\boil\b.*\bhair\b|\bhair\b.*\boil\b/i, 'hair', 'leave'],
    ['hairCare', /hair\s*(serum|mask|cream|gel|spray|tonic)|leave[\s-]*in/i, 'hair', 'leave'],
    ['faceWash', /face\s*wash|facewash|cleanser|cleansing\s*(gel|foam|milk)|micellar/i, 'face', 'rinse'],
    ['bodyWash', /body\s*wash|shower\s*(gel|cream)|soap|bath\s*bar|handwash|hand\s*wash/i, 'body', 'rinse'],
    ['serum', /serum|essence|ampoule|toner/i, 'face', 'leave'],
    ['bodyLotion', /body\s*(lotion|butter|cream|milk|oil)|petroleum\s*jelly/i, 'body', 'leave'],
    ['moisturizer', /moisturi[sz]|cream|lotion|gel\s*cream|night\s*cream|day\s*cream|face\s*gel/i, 'face', 'leave'],
    ['lip', /lip\s*(balm|care|butter)/i, 'face', 'leave'],
    ['toothpaste', /tooth\s*paste|toothpaste|dental\s*cream/i, 'oral', 'rinse'],
    ['deodorant', /deo(dorant)?\b|antiperspirant|roll[\s-]*on|body\s*spray/i, 'body', 'leave'],
  ];
  const CARE_RE = /shampoo|conditioner|hair\s*(oil|serum|mask|cream|gel|spray)|face\s*wash|facewash|cleanser|soap|body\s*wash|shower\s*gel|hand\s*wash|moisturi[sz]|face\s*cream|night\s*cream|day\s*cream|cold\s*cream|lotion|serum|sun\s*screen|sunscreen|\bspf\b|toner|lip\s*balm|tooth\s*paste|toothpaste|deodorant|\bdeo\b|body\s*butter|petroleum\s*jelly|micellar|face\s*gel|scrub|face\s*mask/i;

  function detectType(name, hint) {
    const text = `${name || ''} ${hint || ''}`;
    for (const [type, re, area, use] of TYPES) if (re.test(text)) return { type, area, use };
    return { type: 'other', area: 'body', use: 'leave' };
  }

  /* ------------------------------------------------------ ingredient rules */

  // pen: base penalty. extra: added for matching member traits. use: 'rinse' | 'leave' | undefined (both).
  const BAD = [
    { key: 'drug', label: 'Steroid / prescription drug', re: /clobetasol|betamethasone|mometasone|hydrocortisone|fluocinolone|beclomethasone|hydroquinone|tretinoin|mercury|mercuric/i,
      why: 'Should only be used under a doctor\'s supervision. Often misused in fairness creams.', pen: 40, cap: 15 },
    { key: 'formaldehyde', label: 'Formaldehyde releaser', re: /dmdm\s*hydantoin|imidazolidinyl\s*urea|diazolidinyl\s*urea|quaternium-15|bronopol|2-bromo-2-nitropropane|sodium\s*hydroxymethylglycinate|formaldehyde|methenamine/i,
      why: 'Preservative that slowly releases formaldehyde; a common skin allergen.', pen: 12 },
    { key: 'mit', label: 'Methylisothiazolinone (MIT)', re: /methylisothiazolinone|methylchloroisothiazolinone/i,
      why: 'Strong contact allergen; restricted in leave-on products in the EU.', pen: 4, leavePen: 12, extra: { sensitive: 8 } },
    { key: 'triclosan', label: 'Triclosan', re: /triclosan|triclocarban/i, why: 'Antibacterial with hormone and resistance concerns.', pen: 8 },
    { key: 'sulfate', label: 'Harsh sulfate (SLS / SLES)', re: /sodium\s*lauryl\s*sul(?:f|ph)ate|ammonium\s*lauryl\s*sul(?:f|ph)ate|sodium\s*laureth\s*sul(?:f|ph)ate|ammonium\s*laureth\s*sul(?:f|ph)ate|\bsls\b|\bsles\b|sodium\s*coco[\s-]*sul(?:f|ph)ate/i,
      why: 'Strong foaming cleanser that can strip natural oils.', pen: 8, leavePen: 12, extra: { dryHair: 14, coloured: 14, drySkin: 12, sensitive: 12, kid: 8 } },
    { key: 'fragrance', label: 'Added fragrance', re: /\b(parfum|fragrance|perfume)\b/i, why: 'The most common cause of cosmetic skin reactions.', pen: 5, leavePen: 8, extra: { sensitive: 20, kid: 8 } },
    { key: 'allergens', label: 'Fragrance allergens', re: /\b(limonene|linalool|citral|geraniol|eugenol|isoeugenol|coumarin|citronellol|benzyl\s*salicylate|hexyl\s*cinnamal|amyl\s*cinnamal|cinnamal|farnesol|hydroxycitronellal|benzyl\s*benzoate)\b/i,
      why: 'Listed allergens that come with fragrance or essential oils.', pen: 2, extra: { sensitive: 6, kid: 3 } },
    { key: 'essentialOil', label: 'Irritating essential oils', re: /(tea\s*tree|melaleuca|peppermint|mentha|eucalyptus|cinnamon|clove|bergamot|lemon\s*(peel\s*)?oil|citrus\s*(limon|aurantium)|lavender|lavandula)/i,
      why: 'Can irritate sensitive skin, especially in leave-on products.', pen: 0, extra: { sensitive: 5 }, leaveOnly: true },
    { key: 'alcohol', label: 'Drying alcohol high in the list', test: (items) => items.slice(0, 6).some(i => /^(alcohol(\s*denat\.?)?|alcohol\s*denat.*|sd\s*alcohol.*|ethanol|ethyl\s*alcohol|isopropyl\s*alcohol)$/i.test(i)),
      why: 'Alcohol denat / ethanol near the top can dry and irritate skin. (Cetyl, cetearyl and benzyl alcohol are different and fine.)', pen: 4, leavePen: 8, extra: { drySkin: 10, sensitive: 10 } },
    { key: 'comedogenic', label: 'Pore-clogging ingredients', re: /coconut\s*oil|cocos\s*nucifera\s*(\(coconut\)\s*)?oil|cocoa\s*butter|theobroma\s*cacao|isopropyl\s*myristate|isopropyl\s*palmitate|isopropyl\s*isostearate|myristyl\s*myristate|acetylated\s*lanolin|\blanolin\b|wheat\s*germ\s*oil|triticum\s*vulgare\s*germ\s*oil|laureth-4|algae\s*extract|ethylhexyl\s*palmitate|decyl\s*oleate|octyl\s*stearate/i,
      why: 'Known to clog pores for acne-prone skin.', pen: 0, extra: { oily: 10 }, faceLeaveOnly: true },
    { key: 'mineralOil', label: 'Mineral oil / petrolatum', re: /mineral\s*oil|paraffinum\s*liquidum|\bpetrolatum\b|liquid\s*paraffin/i,
      why: 'Heavy occlusive: great for very dry skin, can feel heavy on oily skin.', pen: 0, extra: { oily: 4 }, faceLeaveOnly: true },
    { key: 'colour', label: 'Synthetic colour', re: /\bci\s*\d{5}\b/i, why: 'Cosmetic dye, no skin benefit.', pen: 1, extra: { sensitive: 3, kid: 3 }, leaveOnly: true },
    { key: 'paraben', label: 'Paraben', re: /(methyl|ethyl|propyl|butyl|isobutyl|isopropyl)\s*-?paraben/i,
      why: 'Regulators allow parabens at low levels; some people prefer to avoid them.', pen: 1, extra: { kid: 3 } },
    { key: 'retinoid', label: 'Retinoid', re: /retinol|retinal\b|retinaldehyde|retinyl|adapalene|hydroxypinacolone\s*retinoate/i,
      why: 'Effective active, but avoid during pregnancy and for children.', pen: 0, extra: { pregnant: 30, kid: 15 } },
    { key: 'bha', label: 'Salicylic acid (BHA)', re: /salicylic\s*acid|betaine\s*salicylate/i,
      why: 'Fine for most adults; in leave-on products, check with a doctor during pregnancy.', pen: 0, extra: { pregnantLeave: 8, kid: 6 } },
  ];

  const GOOD = [
    { key: 'dandruff', label: 'Anti-dandruff active', re: /ketoconazole|zinc\s*pyrithione|piroctone\s*olamine|selenium\s*sulfide|climbazole|ciclopirox|coal\s*tar/i, for: 'dandruff', bonus: 20 },
    { key: 'acne', label: 'Acne-fighting active', re: /salicylic\s*acid|benzoyl\s*peroxide|niacinamide|azelaic\s*acid|zinc\s*pca|adapalene|\bsulfur\b|tea\s*tree/i, for: 'oily', bonus: 12 },
    { key: 'hydration', label: 'Hydrating / barrier ingredients', re: /ceramide|hyaluron|sodium\s*hyaluronate|squalane|shea\s*butter|butyrospermum|\burea\b|panthenol|petrolatum|colloidal\s*oat|allantoin|glycerin/i, for: 'drySkin', bonus: 12, needs: 2 },
    { key: 'soothing', label: 'Soothing ingredients', re: /centella|madecassoside|asiaticoside|panthenol|allantoin|bisabolol|colloidal\s*oat|avena\s*sativa|ceramide/i, for: 'sensitive', bonus: 8 },
    { key: 'gentle', label: 'Gentle cleansers', re: /cocamidopropyl\s*betaine|coco[\s-]*glucoside|decyl\s*glucoside|lauryl\s*glucoside|sodium\s*cocoyl\s*(isethionate|glutamate|glycinate)|disodium\s*laureth\s*sulfosuccinate/i, for: 'any', bonus: 4, rinseOnly: true },
  ];

  const UV_FILTERS = /zinc\s*oxide|titanium\s*dioxide|avobenzone|butyl\s*methoxydibenzoylmethane|octocrylene|bemotrizinol|bis-ethylhexyloxyphenol\s*methoxyphenyl\s*triazine|ethylhexyl\s*triazone|diethylamino\s*hydroxybenzoyl\s*hexyl\s*benzoate|tinosorb|uvinul|ethylhexyl\s*methoxycinnamate|octinoxate|homosalate|octisalate|ethylhexyl\s*salicylate|drometrizole\s*trisiloxane|polysilicone-15|methylene\s*bis-benzotriazolyl|benzophenone|oxybenzone|ensulizole|phenylbenzimidazole\s*sulfonic/i;

  // Hero ingredients that brands put on the front of the pack -> how they appear in INCI.
  const HEROES = [
    ['onion', /allium\s*cepa|onion/i], ['bhringraj', /eclipta|bhringraj|bhringa/i], ['rice water', /oryza\s*sativa|rice/i],
    ['vitamin c', /ascorb|vitamin\s*c/i], ['vitamin e', /tocopher|vitamin\s*e/i], ['aloe', /aloe/i], ['argan', /argania|argan/i],
    ['tea tree', /melaleuca|tea\s*tree/i], ['niacinamide', /niacinamide/i], ['hyaluronic', /hyaluron/i], ['retinol', /retin/i],
    ['keratin', /keratin/i], ['biotin', /biotin/i], ['coconut', /cocos\s*nucifera|coconut/i], ['almond', /prunus\s*amygdalus|almond/i],
    ['neem', /azadirachta|neem/i], ['turmeric', /curcuma|turmeric|haldi/i], ['haldi', /curcuma|turmeric|haldi/i],
    ['saffron', /crocus\s*sativus|saffron|kesar/i], ['kesar', /crocus\s*sativus|saffron|kesar/i], ['charcoal', /charcoal|carbon\s*powder/i],
    ['honey', /\bmel\b|honey/i], ['rosemary', /rosmarinus|rosemary/i], ['amla', /emblica|phyllanthus|amla/i],
    ['cica', /centella|cica/i], ['centella', /centella/i], ['ceramide', /ceramide/i], ['salicylic', /salicylic/i],
    ['strawberry', /fragaria|strawberry/i], ['mulberry', /morus/i], ['shea', /butyrospermum|shea/i], ['kojic', /kojic/i],
    ['glycolic', /glycolic/i], ['peptide', /peptide/i], ['caffeine', /caffeine/i], ['hibiscus', /hibiscus/i],
    ['reetha', /sapindus|reetha|soapnut/i], ['shikakai', /acacia\s*concinna|shikakai/i], ['avocado', /persea\s*gratissima|avocado/i],
    ['jojoba', /simmondsia|jojoba/i], ['olive', /olea\s*europaea|olive/i], ['cucumber', /cucumis|cucumber/i], ['green tea', /camellia\s*sinensis|green\s*tea/i],
    ['milk', /lac\b|milk/i], ['multani', /montmorillonite|bentonite|fuller|multani/i], ['sandalwood', /santalum|sandal/i], ['rose', /rosa\s*(damascena|centifolia)|rose\s*(water|extract|oil)/i],
  ];
  // Ingredients after these are usually present at or below ~1%.
  const ONE_PCT = /^(parfum|fragrance|perfume|phenoxyethanol|ethylhexylglycerin|sodium\s*benzoate|potassium\s*sorbate|methylparaben|propylparaben|benzyl\s*alcohol|disodium\s*edta|tetrasodium\s*edta|dmdm\s*hydantoin|chlorphenesin|caprylyl\s*glycol)/i;

  function topLevel(text) { return N.ingredients.topLevel(text); }

  function analyze(text, type) {
    if (!text || !String(text).trim()) return null;
    const raw = String(text).replace(/\s+/g, ' ').trim().replace(/^ingredients?\s*[:\-]\s*/i, '').replace(/\.\s*$/, '');
    const cleaned = raw.replace(/(fragrance|perfume|parfum|sul(?:f|ph)ate|paraben|alcohol|silicone)[\s-]*free/gi, ' ');
    const items = topLevel(raw).map(s => s.replace(/\.$/, '').trim());
    const lower = items.map(s => s.toLowerCase());
    const found = [];
    for (const rule of BAD) {
      if (rule.leaveOnly && type.use !== 'leave') continue;
      if (rule.faceLeaveOnly && !(type.use === 'leave' && type.area === 'face')) continue;
      const hit = rule.test ? rule.test(lower) : rule.re.test(cleaned);
      if (!hit) continue;
      const m = rule.re ? cleaned.match(rule.re) : null;
      found.push({ ...rule, match: m ? m[0] : '' });
    }
    const good = [];
    for (const g of GOOD) {
      if (g.rinseOnly && type.use !== 'rinse') continue;
      const re = new RegExp(g.re.source, 'gi');
      const hits = [...new Set([...cleaned.matchAll(re)].map(m => m[0].toLowerCase()))];
      if (hits.length >= (g.needs || 1)) good.push({ ...g, hits });
    }
    const oneIdx = lower.findIndex(i => ONE_PCT.test(i));
    return { raw, items, lower, found, good, oneIdx, hasUv: UV_FILTERS.test(cleaned), has: k => found.some(f => f.key === k) };
  }

  /* ---------------------------------------------------------------- traits */

  // A family member's care traits -> flags used by the rules.
  function traitsOf(member) {
    const t = {};
    const skin = member.skin || 'normal', hair = member.hair || 'normal';
    if (skin === 'oily') t.oily = true;
    if (skin === 'dry') t.drySkin = true;
    if (skin === 'sensitive') t.sensitive = true;
    if (hair === 'dandruff') t.dandruff = true;
    if (hair === 'dry') t.dryHair = true;
    if (hair === 'coloured') t.coloured = true;
    if (hair === 'hairfall') t.hairfall = true;
    if (member.pregnant) t.pregnant = true;
    if (member.profile === 'kids') t.kid = true;
    return t;
  }

  const SKIN = { normal: 'Normal skin', oily: 'Oily / acne-prone', dry: 'Dry skin', sensitive: 'Sensitive skin' };
  const HAIR = { normal: 'Normal hair', dandruff: 'Dandruff', dry: 'Dry / curly / frizzy', coloured: 'Colour-treated', hairfall: 'Hair fall' };

  const VERDICTS = [
    { min: 75, key: 'great', label: 'Great fit', line: 'Suits this person well' },
    { min: 55, key: 'ok', label: 'Good fit', line: 'Fine for regular use' },
    { min: 35, key: 'some', label: 'Use with care', line: 'Has ingredients this person may not like' },
    { min: 0, key: 'avoid', label: 'Not a fit', line: 'Look for a gentler alternative' },
  ];

  /* ----------------------------------------------------------------- claims */

  function claims(product, a, type) {
    const out = [];
    const c = product.care || {};
    const text = [product.name, product.features, product.description, c.preferences, c.fragrance].filter(Boolean).join(' ').toLowerCase();
    const push = (claim, reality, sev = 2) => out.push({ claim, reality, sev });

    if ((/sul(?:f|ph)ate[\s-]*free|no\s*sul(?:f|ph)ates?/.test(text) || /yes/i.test(c.sulphateFree || '')) && a.has('sulfate')) {
      push('"Sulfate free"', `Ingredient list contains ${a.found.find(f => f.key === 'sulfate').match}.`, 3);
    }
    if ((/paraben[\s-]*free|no\s*parabens?/.test(text) || /yes/i.test(c.parabenFree || '')) && a.has('paraben')) {
      push('"Paraben free"', `Ingredient list contains ${a.found.find(f => f.key === 'paraben').match}.`, 3);
    }
    if (/fragrance[\s-]*free|unscented|no\s*fragrance/.test(text) && a.has('fragrance')) {
      push('"Fragrance free"', 'Ingredient list contains parfum / fragrance.', 3);
    }
    if (/non[\s-]*comedogenic|oil[\s-]*free/.test(text) && a.has('comedogenic')) {
      push('"Non-comedogenic / oil free"', `Contains ${a.found.find(f => f.key === 'comedogenic').match}, which can clog pores.`, 2);
    }
    if (/dandruff/.test(text) && type.area === 'hair' && !a.good.some(g => g.key === 'dandruff') && type.type === 'shampoo') {
      push('"Anti-dandruff"', 'No recognised anti-dandruff active (ketoconazole, zinc pyrithione, piroctone olamine, selenium sulfide, climbazole) in the list.', 3);
    }
    if (type.type === 'sunscreen' && !a.hasUv) {
      push('Sunscreen / SPF', 'No recognised UV filter found in the ingredient list.', 3);
    }
    if (/chemical[\s-]*free|toxin[\s-]*free|100%\s*natural/.test(text)) {
      push('"Chemical free / 100% natural"', 'Everything is a chemical; this product also lists synthetic ingredients such as preservatives.', 1);
    }

    // Hero ingredient vs the ~1% line.
    const heroText = [product.name, c.hero, c.keyIngredients].filter(Boolean).join(' ').toLowerCase();
    const seen = new Set();
    for (const [word, re] of HEROES) {
      if (!new RegExp('\\b' + word.replace(/\s+/g, '\\s*') + '\\b', 'i').test(heroText)) continue;
      const idx = a.lower.findIndex(i => re.test(i));
      if (seen.has(idx) && idx >= 0) continue;
      seen.add(idx);
      const Word = word.replace(/\b\w/g, ch => ch.toUpperCase());
      if (idx < 0) push(`Hero ingredient: ${Word}`, 'Not found in the listed ingredients (the listing may show a shortened list).', 2);
      else if (a.oneIdx >= 0 && idx > a.oneIdx) {
        push(`Hero ingredient: ${Word}`, `Listed at #${idx + 1}, after ${a.items[a.oneIdx]}: likely under 1% of the formula.`, 2);
      }
    }
    return out.sort((x, y) => y.sev - x.sev);
  }

  /* ------------------------------------------------------------------ score */

  function careScore(product, member) {
    const type = detectType(product.name, product.care && product.care.formulation);
    const t = traitsOf(member);
    const a = analyze(product.ingredientsText, type);
    const prof = {
      label: type.area === 'hair' ? HAIR[member.hair || 'normal'] : SKIN[member.skin || 'normal'],
      icon: type.area === 'hair' ? '💇' : '🧴',
      blurb: `${typeLabel(type.type)} · ${type.use === 'rinse' ? 'rinse-off' : 'leave-on'}` + (t.pregnant ? ' · pregnancy check on' : '') + (t.kid ? ' · child' : ''),
    };
    if (!a) {
      return { kind: 'care', type, score: null, verdict: { key: 'unknown', label: 'No ingredients', line: 'This listing has no ingredient list, so only the brand\'s own claims are shown.' }, reasons: [], claims: [], care: null, profile: prof };
    }

    const reasons = [];
    let penalty = 0, bonus = 0, cap = null;
    for (const f of a.found) {
      let pts = (type.use === 'leave' && f.leavePen !== undefined) ? f.leavePen : f.pen;
      const why = [];
      for (const [trait, extra] of Object.entries(f.extra || {})) {
        if (trait === 'pregnantLeave') { if (t.pregnant && type.use === 'leave') { pts += extra; why.push('pregnancy'); } continue; }
        if (trait === 'dryHair' || trait === 'coloured' || trait === 'dandruff' || trait === 'hairfall') { if (type.area !== 'hair') continue; }
        if (trait === 'drySkin' || trait === 'oily') { if (type.area === 'hair') continue; }
        if (t[trait]) { pts += extra; why.push(trait); }
      }
      if (f.cap && (!cap || f.cap < cap.max)) cap = { max: f.cap, why: f.label };
      if (f.key === 'retinoid' && t.pregnant && type.use === 'leave' && (!cap || cap.max > 20)) cap = { max: 20, why: 'Retinoid during pregnancy' };
      // Soothing extras can't make a fragranced leave-on product a great fit for sensitive skin.
      if (f.key === 'fragrance' && t.sensitive && type.use === 'leave' && (!cap || cap.max > 50)) cap = { max: 50, why: 'Fragrance in a leave-on product, sensitive skin' };
      if (f.key === 'mit' && t.sensitive && (!cap || cap.max > 40)) cap = { max: 40, why: 'MIT preservative, sensitive skin' };
      penalty += pts;
      const detail = (f.match ? f.match + ': ' : '') + f.why + (why.length ? ` (matters more for: ${why.map(traitLabel).join(', ')})` : '');
      reasons.push({ key: f.key, label: f.label, pts: -pts, detail, info: pts < 0.5 });
    }
    for (const g of a.good) {
      if (g.for !== 'any' && !t[g.for]) {
        reasons.push({ key: g.key, label: g.label, pts: 0, detail: g.hits.join(', '), info: true, good: true });
        continue;
      }
      bonus += g.bonus;
      reasons.push({ key: g.key, label: g.label, pts: g.bonus, detail: g.hits.join(', ') + (g.for !== 'any' ? ` (helps ${traitLabel(g.for)})` : ''), good: true });
    }
    // Dandruff member + shampoo without an active: it won't do much for them.
    if (t.dandruff && type.type === 'shampoo' && !a.good.some(g => g.key === 'dandruff')) {
      penalty += 10;
      reasons.push({ key: 'noActive', label: 'No anti-dandruff active', pts: -10, detail: 'Won\'t treat dandruff; look for ketoconazole, zinc pyrithione or piroctone olamine.' });
      if (!cap || cap.max > 65) cap = { max: 65, why: 'Doesn\'t treat dandruff' };
    }

    let s = clamp(100 - penalty + Math.min(bonus, 15), 0, 100);
    if (cap && s > cap.max) s = cap.max; else cap = null;
    s = Math.round(s);
    reasons.sort((x, y) => Math.abs(y.pts) - Math.abs(x.pts));
    return {
      kind: 'care', type, score: s, verdict: VERDICTS.find(v => s >= v.min), reasons, capped: cap,
      claims: claims(product, a, type), care: a, profile: prof, partial: false,
    };
  }

  const TYPE_LABELS = { sunscreen: 'Sunscreen', shampoo: 'Shampoo', conditioner: 'Conditioner', hairOil: 'Hair oil', hairCare: 'Hair care',
    faceWash: 'Face wash', bodyWash: 'Soap / body wash', serum: 'Serum', bodyLotion: 'Body lotion', moisturizer: 'Moisturiser',
    lip: 'Lip care', toothpaste: 'Toothpaste', deodorant: 'Deodorant', other: 'Personal care' };
  const typeLabel = t => TYPE_LABELS[t] || 'Personal care';
  const TRAIT_LABELS = { oily: 'oily / acne-prone skin', drySkin: 'dry skin', sensitive: 'sensitive skin', dandruff: 'dandruff', dryHair: 'dry / curly hair',
    coloured: 'colour-treated hair', hairfall: 'hair fall', pregnant: 'pregnancy', kid: 'children', any: 'everyone' };
  const traitLabel = t => TRAIT_LABELS[t] || t;

  N.care = { detectType, analyze, careScore, CARE_RE, SKIN, HAIR, typeLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
