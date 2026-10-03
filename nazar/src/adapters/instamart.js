// instamart.js - EXPERIMENTAL. Swiggy Instamart's web product URL pattern and
// page layout are not verified yet. This uses the same label-based reading as
// Zepto ("Nutrition Information", "Ingredients" rows) and guesses the item URL.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const ITEM = /\/instamart\/item\/([A-Za-z0-9_-]+)/;

  const adapter = {
    platform: 'instamart',
    label: 'Instamart',
    panelSide: 'right',
    experimental: true,
    match: (host, path) => /(^|\.)swiggy\.com$/.test(host) && /^\/instamart/.test(path || ''),

    findCards(doc) {
      const out = [];
      for (const el of doc.querySelectorAll('a[href*="/instamart/item/"]')) {
        const m = el.getAttribute('href').match(ITEM);
        if (!m || !el.querySelector('img')) continue;
        out.push({ el, id: m[1], url: new URL(el.getAttribute('href'), root.location.origin).href });
      }
      return out;
    },

    pdpFromLocation(loc) {
      const m = loc.pathname.match(ITEM);
      return m ? { id: m[1], url: loc.origin + loc.pathname } : null;
    },

    parse(html, url, id) {
      const doc = new root.DOMParser().parseFromString(html, 'text/html');
      const p = adapter.fromDocument(doc, url, id);
      if (!p.table) p.table = N.generic.nutritionFromRaw(html);
      return N.generic.buildProduct(p);
    },

    fromDocument(doc, url, id) {
      return N.generic.fromDocument(doc, { platform: 'instamart', id, url });
    },
  };

  N.adapters.push(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : this);
