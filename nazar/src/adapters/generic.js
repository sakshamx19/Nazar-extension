// generic.js - helpers shared by adapters: building the common Product object,
// reading "Label -> value" rows from a rendered page, and JSON-LD.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { packGrams, isLiquid, num } = N.util;

  // food: has (or should have) a nutrition label. care: shampoo, soap, creams...
  // other: anything else (detergent, utensils) - Nazar stays quiet on those.
  function kindOf(p, nutrition, care) {
    if (N.nutrition.coverage(nutrition).have >= 3) return 'food';
    const nonFood = /non[_\s-]*food/i.test(p.foodType || '');
    const careName = N.care.CARE_RE.test(p.name || '');
    const careAttrs = care && (care.skinType || care.hairType || care.concern);
    // A non-food listing with an ingredient list is almost always personal care.
    if (careName || (nonFood && (careAttrs || p.ingredientsText))) return 'care';
    return nonFood ? 'other' : 'food';
  }

  // Every adapter returns this shape. Stored in cache, so keep it plain data.
  function buildProduct(p) {
    const fromFields = p.fields && p.fields.length ? N.nutrition.parseFields(p.fields) : null;
    const table = p.table ? N.nutrition.parseTable(p.table) : { values: null, basis: null };
    const { nutrition, warnings } = N.nutrition.finalize(fromFields, table.values);
    if (table.basis === 'serving' && !fromFields) warnings.push('Nutrition table is per serving with no size, skipped');
    const unitText = p.unitText || '';
    const care = p.care && Object.values(p.care).some(Boolean) ? p.care : undefined;
    return {
      platform: p.platform,
      kind: kindOf(p, nutrition, care),
      care,
      id: String(p.id),
      url: p.url,
      name: (p.name || '').trim(),
      brand: (p.brand || '').trim() || undefined,
      price: num(p.price),
      mrp: num(p.mrp),
      unitText,
      packG: packGrams(unitText),
      liquid: isLiquid(unitText) || /100\s*ml/i.test(p.basisText || ''),
      image: p.image,
      foodType: p.foodType,
      ingredientsText: p.ingredientsText ? String(p.ingredientsText).slice(0, 2000) : undefined,
      features: p.features ? String(p.features).slice(0, 400) : undefined,
      description: p.description ? String(p.description).slice(0, 400) : undefined,
      nutrition,
      warnings,
      fetchedAt: Date.now(),
    };
  }

  // Find a short label text node ("Nutrition Information") and return the text of
  // the element next to it. Works on obfuscated class names because it never uses them.
  function labeledValue(doc, labelRe) {
    const body = doc.body || doc.documentElement;
    if (!body) return undefined;
    const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
    while (walker.nextNode()) {
      const t = walker.currentNode.nodeValue.trim();
      if (!t || t.length > 40 || !labelRe.test(t)) continue;
      let el = walker.currentNode.parentElement;
      for (let up = 0; up < 4 && el; up++, el = el.parentElement) {
        if (el.closest && el.closest('nazar-ui')) break;
        const sib = el.nextElementSibling;
        if (sib) {
          const v = (sib.innerText || sib.textContent || '').trim();
          if (v) return v;
        }
      }
    }
    return undefined;
  }

  function jsonLdProduct(doc) {
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const list = Array.isArray(data) ? data : data['@graph'] || [data];
        const p = list.find(x => x && /product/i.test(x['@type']));
        if (p) {
          const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers || {};
          return {
            name: p.name,
            brand: typeof p.brand === 'object' ? p.brand && p.brand.name : p.brand,
            price: offer.price || offer.lowPrice,
            image: Array.isArray(p.image) ? p.image[0] : p.image,
          };
        }
      } catch (e) { /* ignore broken JSON-LD */ }
    }
    return {};
  }

  // Last-resort: nutrition text sitting inside a JSON payload in raw HTML.
  function nutritionFromRaw(html) {
    const m = html.match(/Energy[^"<\\]{0,40}?\d[^"<\\]{10,700}/i);
    return m && /protein/i.test(m[0]) ? m[0] : undefined;
  }

  const LABELS = {
    nutrition: /^nutrition(al)?\s*(information|info|facts|values?)\s*(\(.*\))?:?$/i,
    ingredients: /^ingredients?:?$/i,
    unit: /^(unit|net\s*(quantity|weight|qty|wt\.?)|quantity|weight|pack\s*size):?$/i,
    features: /^key\s*features:?$/i,
    foodType: /^(food\s*type|veg\s*\/\s*non[\s-]*veg|dietary\s*preference):?$/i,
    description: /^(description|about\s*(the\s*)?product|product\s*details):?$/i,
    concern: /^(concern|benefits?(\s*and\s*uses)?|hero\s*concern):?$/i,
    skinType: /^(skin\s*type|skin\s*\/\s*hair\s*type):?$/i,
    hairType: /^hair\s*type:?$/i,
    keyIngredients: /^key\s*ingredients?:?$/i,
    hero: /^hero\s*ingredients?:?$/i,
    preferences: /^(preferences?|product\s*highlights?):?$/i,
    formulation: /^(formulation|product\s*form|form):?$/i,
  };

  // Pull everything from a rendered (or DOMParser-built) product page.
  function fromDocument(doc, base) {
    const ld = jsonLdProduct(doc);
    const h1 = doc.querySelector('h1');
    const v = re => labeledValue(doc, re);
    return Object.assign({
      care: {
        concern: v(LABELS.concern), skinType: v(LABELS.skinType), hairType: v(LABELS.hairType),
        keyIngredients: v(LABELS.keyIngredients), hero: v(LABELS.hero), preferences: v(LABELS.preferences), formulation: v(LABELS.formulation),
      },
      name: ld.name || (h1 && h1.textContent),
      brand: ld.brand,
      price: ld.price,
      image: ld.image,
      table: labeledValue(doc, LABELS.nutrition),
      ingredientsText: labeledValue(doc, LABELS.ingredients),
      unitText: labeledValue(doc, LABELS.unit),
      features: labeledValue(doc, LABELS.features),
      foodType: labeledValue(doc, LABELS.foodType),
      description: labeledValue(doc, LABELS.description),
    }, base);
  }

  N.generic = { buildProduct, labeledValue, jsonLdProduct, nutritionFromRaw, fromDocument, LABELS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
