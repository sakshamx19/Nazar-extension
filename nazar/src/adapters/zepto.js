// zepto.js - Zepto product pages (/pn/<slug>/pvid/<uuid>) show nutrition as a
// "Nutrition Information" row: "Energy (kcal): 572.0, Protein (g): 12.5, ...".
// Zepto sits behind AWS WAF; a fetch from the user's own tab carries the WAF
// cookie, a fetch from a server does not.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const UUID = /\/pvid\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

  const adapter = {
    platform: 'zepto',
    label: 'Zepto',
    // Zepto's Add to Cart sits under the image on the left, so the panel docks right.
    panelSide: 'right',
    match: host => /(^|\.)zepto(now)?\.com$/.test(host),

    findCards(doc) {
      const out = [];
      for (const el of doc.querySelectorAll('a[href*="/pvid/"]')) {
        const m = el.getAttribute('href').match(UUID);
        if (!m || !el.querySelector('img')) continue;
        out.push({ el, id: m[1].toLowerCase(), url: new URL(el.getAttribute('href'), root.location.origin).href });
      }
      return out;
    },

    pdpFromLocation(loc) {
      const m = loc.pathname.match(UUID);
      return m ? { id: m[1].toLowerCase(), url: loc.origin + loc.pathname } : null;
    },

    isBlocked: html => /awsWafIntegration|challenge-container/.test(html.slice(0, 5000)),

    parse(html, url, id) {
      if (adapter.isBlocked(html)) return null;
      const doc = new root.DOMParser().parseFromString(html, 'text/html');
      const p = adapter.fromDocument(doc, url, id);
      if (!p.table) p.table = N.generic.nutritionFromRaw(html);
      return N.generic.buildProduct(p);
    },

    fromDocument(doc, url, id) {
      return N.generic.fromDocument(doc, { platform: 'zepto', id, url });
    },
  };

  N.adapters.push(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : this);
