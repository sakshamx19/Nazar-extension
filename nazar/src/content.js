// content.js - wires an adapter to the page: badges on product cards, the panel on
// product pages, SPA navigation, and a polite fetch queue. Everything runs in the
// user's own tab with their own session; no server of ours is involved.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const adapter = N.adapters.find(a => a.match(location.hostname, location.pathname));
  if (!adapter) return;

  let settings = null;
  const failed = new Map(); // id -> time of last failure, to avoid hammering

  /* ------------------------------------------------------------ fetch queue */

  const CONCURRENCY = 3;
  let active = 0;
  const waiting = [];
  const acquire = priority => new Promise(res => {
    if (active < CONCURRENCY) { active++; res(); } else if (priority) waiting.unshift(res); else waiting.push(res);
  });
  const release = () => { const next = waiting.shift(); if (next) next(); else active--; };

  const inflight = new Map();

  async function load(id, url, priority) {
    const cached = await N.store.getProduct(adapter.platform, id);
    if (cached) return cached;
    if (failed.has(id) && Date.now() - failed.get(id) < 10 * 60 * 1000) return null;
    if (inflight.has(id)) return inflight.get(id);
    const job = (async () => {
      await acquire(priority);
      try {
        const res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html' } });
        const html = await res.text();
        const product = res.ok ? adapter.parse(html, url, id) : null;
        N.log(adapter.platform, id, 'HTTP', res.status, html.length + 'b', product ? 'nutrients: ' + Object.keys(product.nutrition).length : 'no product');
        if (!product) { failed.set(id, Date.now()); return null; }
        product.id = String(id);
        product.url = product.url || url;
        await N.store.putProduct(product);
        return product;
      } catch (e) {
        N.log('fetch failed', id, e && e.message);
        failed.set(id, Date.now());
        return null;
      } finally {
        release();
        inflight.delete(id);
      }
    })();
    inflight.set(id, job);
    return job;
  }

  /* ------------------------------------------------------------------ cards */

  const cards = new WeakMap(); // el -> { id, url }
  const mounted = new Set();   // card elements that have a badge
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      hydrate(e.target);
    }
  }, { rootMargin: '400px 0px' });

  async function hydrate(el) {
    const card = cards.get(el);
    if (!card || !settings.showBadges) return;
    const product = await load(card.id, card.url, false);
    if (!el.isConnected || el.getAttribute('data-nazar') !== card.id) return;
    // Nothing to judge (no nutrition, no ingredient list, non-food non-care): stay quiet.
    if (!product || !N.hasVerdict(product)) return;
    N.ui.mountBadge(el, product, settings);
    mounted.add(el);
  }

  function scan() {
    if (!settings || !settings.showBadges) return;
    for (const card of adapter.findCards(document)) {
      const prev = card.el.getAttribute('data-nazar');
      if (prev === card.id) continue;
      // Recycled card element now showing a different product.
      if (prev) { N.ui.unmountBadge(card.el); mounted.delete(card.el); }
      card.el.setAttribute('data-nazar', card.id);
      cards.set(card.el, card);
      io.observe(card.el);
    }
  }

  function repaintBadges() {
    for (const el of [...mounted]) {
      if (!el.isConnected) { mounted.delete(el); continue; }
      const h = el.__nazarBadge;
      if (h && h.product) N.ui.mountBadge(el, h.product, settings);
    }
  }

  function removeAllBadges() {
    for (const el of mounted) N.ui.unmountBadge(el);
    mounted.clear();
    for (const el of document.querySelectorAll('[data-nazar]')) el.removeAttribute('data-nazar');
  }

  /* ----------------------------------------------------------- product page */

  let pdpKey = null;

  async function checkPdp() {
    const pdp = adapter.pdpFromLocation(location);
    const key = pdp ? pdp.id : null;
    if (key === pdpKey) return;
    pdpKey = key;
    N.ui.hidePanel();
    if (!pdp || !settings.showPanel) return;

    let product = await load(pdp.id, pdp.url, true);
    // Sites that render nutrition client-side (or block our fetch) can still be
    // read from the live page once it has rendered.
    if ((!product || !N.hasVerdict(product)) && adapter.fromDocument) {
      product = await readLive(pdp) || product;
    }
    if (pdpKey !== key) return; // user navigated away meanwhile
    const label = adapter.label + (adapter.experimental ? ' (beta)' : '');
    if (!product) return N.ui.showPanelMessage("Couldn't read this product's details.", label, adapter.panelSide);
    // Personal care without an ingredient list still gets a panel with the brand's claims.
    if (!N.hasVerdict(product) && product.kind !== 'care') {
      return N.ui.showPanelMessage(product.kind === 'other'
        ? 'Nazar checks packaged food and personal care. This product is neither.'
        : 'This listing has no nutrition information, so there is nothing to score.', label, adapter.panelSide);
    }
    N.ui.showPanel(product, settings, label, adapter.panelSide);
  }

  async function readLive(pdp) {
    for (let i = 0; i < 20; i++) {
      const raw = adapter.fromDocument(document, pdp.url, pdp.id);
      if (raw.table || raw.ingredientsText) {
        const product = N.generic.buildProduct(raw);
        if (N.hasVerdict(product)) {
          await N.store.putProduct(product);
          return product;
        }
      }
      await new Promise(r => setTimeout(r, 400));
      if (adapter.pdpFromLocation(location)?.id !== pdp.id) return null;
    }
    return null;
  }

  /* ------------------------------------------------------------------ boot */

  async function boot() {
    settings = await N.store.getSettings();
    N.debug = !!settings.debug;
    N.log('adapter', adapter.platform);
    N.store.prune().catch(() => {});

    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 250);
    }).observe(document.body, { childList: true, subtree: true });

    // SPA navigation: content scripts can't hook the page's history calls, so poll.
    let href = location.href;
    setInterval(() => {
      if (location.href !== href) { href = location.href; checkPdp(); scan(); }
    }, 600);

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || !changes[N.store.SETTINGS_KEY]) return;
      const before = settings;
      settings = await N.store.getSettings();
      N.debug = !!settings.debug;
      if (!settings.showBadges) removeAllBadges();
      else if (!before.showBadges) scan();
      else repaintBadges();
      if (!settings.showPanel) { N.ui.hidePanel(); pdpKey = null; }
      else if (!before.showPanel) { pdpKey = null; checkPdp(); }
      N.ui.updateSettings(settings);
    });

    scan();
    checkPdp();
  }

  boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
