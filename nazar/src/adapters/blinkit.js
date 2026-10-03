// blinkit.js - Blinkit product pages are server-rendered with
// window.grofers.PRELOADED_STATE. The product sits at
// ui.pdp.bffPdp.bffData.tracking.le_meta.custom_data.seo with an `attributes`
// array (name / value / visibility) that holds nutrition, ingredients and unit.
(function (root) {
  'use strict';
  const N = root.Nazar;

  // Cut the JSON object that starts after `marker` out of the HTML, respecting strings.
  function sliceJson(html, marker) {
    const at = html.indexOf(marker);
    if (at < 0) return null;
    const start = html.indexOf('{', at);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
    }
    return null;
  }

  function seoFromHtml(html) {
    const raw = sliceJson(html, 'PRELOADED_STATE');
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      const bff = state && state.ui && state.ui.pdp && state.ui.pdp.bffPdp && state.ui.pdp.bffPdp.bffData;
      return bff && bff.tracking && bff.tracking.le_meta && bff.tracking.le_meta.custom_data && bff.tracking.le_meta.custom_data.seo || null;
    } catch (e) {
      return null;
    }
  }

  function productFromSeo(seo, url) {
    const attrs = {};
    const fields = [];
    for (const a of seo.attributes || []) {
      if (!a || !a.name) continue;
      if (attrs[a.name] === undefined) attrs[a.name] = a.value;
      if (/per\s*100\s*(g|ml)/i.test(a.name)) fields.push({ name: a.name, value: String(a.value) });
    }
    const tableKey = Object.keys(attrs).find(k => /nutrition(al)?\s*(info|facts|value)/i.test(k));
    return N.generic.buildProduct({
      platform: 'blinkit',
      id: seo.id,
      url,
      name: seo.product_name,
      brand: seo.brand,
      price: seo.price,
      mrp: seo.mrp,
      image: Array.isArray(seo.images) ? seo.images[0] : undefined,
      unitText: attrs['Unit'] || attrs['Net Weight'] || attrs['Net Quantity'],
      basisText: attrs['Nutrition Comparison Basis'],
      ingredientsText: attrs['Ingredients'],
      features: attrs['Key Features'],
      description: attrs['Description'],
      foodType: attrs['Food Type'],
      care: {
        concern: attrs['Concern'] || attrs['Hero Concern'] || attrs['Benefits and Uses'],
        skinType: attrs['Skin Type'] || attrs['Skin/Hair Type'],
        hairType: attrs['Hair Type'],
        keyIngredients: attrs['Key Ingredients'],
        hero: attrs['Hero Ingredient'],
        preferences: attrs['Preferences'],
        fragrance: attrs['Fragrance'],
        formulation: attrs['Formulation'],
        sulphateFree: attrs['Sulphate Free'] || attrs['Sulfate Free'],
        parabenFree: attrs['Paraben Free'],
      },
      fields,
      table: tableKey ? attrs[tableKey] : undefined,
    });
  }

  const adapter = {
    platform: 'blinkit',
    label: 'Blinkit',
    // Blinkit's Add to cart and +/- stepper sit in the right column, so the panel docks left over the image gallery.
    panelSide: 'left',
    match: host => /(^|\.)blinkit\.com$/.test(host),

    productUrl: id => `${(root.location && /blinkit\.com$/.test(root.location.hostname)) ? root.location.origin : 'https://blinkit.com'}/prn/p/prid/${id}`,

    // Product cards are div[role=button] whose id is the numeric product id.
    findCards(doc) {
      const out = [];
      for (const el of doc.querySelectorAll("div[role='button'][id]")) {
        if (!/^\d+$/.test(el.id)) continue;
        if (!el.querySelector('img')) continue;
        out.push({ el, id: el.id, url: adapter.productUrl(el.id) });
      }
      return out;
    },

    pdpFromLocation(loc) {
      const m = loc.pathname.match(/\/prid\/(\d+)/);
      return m ? { id: m[1], url: adapter.productUrl(m[1]) } : null;
    },

    parse(html, url) {
      const seo = seoFromHtml(html);
      return seo ? productFromSeo(seo, url) : null;
    },
  };

  N.adapters.push(adapter);
  N.blinkit = { sliceJson, seoFromHtml, productFromSeo };
})(typeof globalThis !== 'undefined' ? globalThis : this);
