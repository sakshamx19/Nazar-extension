// store.js - settings and a product cache in chrome.storage.local. Nothing leaves
// the browser. Products are cached as parsed data; scores are recomputed on render
// because they depend on the active family member's profile.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const chromeApi = root.chrome && root.chrome.storage ? root.chrome : null;

  const SETTINGS_KEY = 'nazar:settings';
  const PREFIX = 'p2:';      // bump when the cached Product shape changes
  const LEGACY = /^p:/;      // v0.1 cache, removed on prune
  const TTL = 3 * 24 * 60 * 60 * 1000;
  const MAX = 1500;

  const DEFAULTS = {
    members: [{ id: 'me', name: 'Me', profile: 'general', skin: 'normal', hair: 'normal', pregnant: false }],
    activeId: 'me',
    showBadges: true,
    showPanel: true,
    debug: false,
  };

  async function getSettings() {
    if (!chromeApi) return JSON.parse(JSON.stringify(DEFAULTS));
    const got = (await chromeApi.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
    const s = Object.assign({}, DEFAULTS, got);
    if (!s.members || !s.members.length) s.members = DEFAULTS.members;
    if (!s.members.some(m => m.id === s.activeId)) s.activeId = s.members[0].id;
    return s;
  }

  async function setSettings(patch) {
    const next = Object.assign(await getSettings(), patch);
    await chromeApi.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  const memory = new Map();
  const key = (platform, id) => PREFIX + platform + ':' + id;

  async function getProduct(platform, id) {
    const k = key(platform, id);
    if (memory.has(k)) return memory.get(k);
    if (!chromeApi) return null;
    const hit = (await chromeApi.storage.local.get(k))[k];
    if (hit && Date.now() - hit.fetchedAt < TTL) { memory.set(k, hit); return hit; }
    return null;
  }

  let writes = 0;
  async function putProduct(p) {
    const k = key(p.platform, p.id);
    memory.set(k, p);
    if (!chromeApi) return;
    await chromeApi.storage.local.set({ [k]: p });
    if (++writes % 50 === 0) prune();
  }

  async function allProducts() {
    if (!chromeApi) return [...memory.values()];
    const all = await chromeApi.storage.local.get(null);
    return Object.keys(all).filter(k => k.startsWith(PREFIX)).map(k => all[k]);
  }

  async function prune() {
    const all = await chromeApi.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(PREFIX));
    const now = Date.now();
    const stale = keys.filter(k => now - (all[k].fetchedAt || 0) > TTL);
    const fresh = keys.filter(k => !stale.includes(k)).sort((a, b) => all[a].fetchedAt - all[b].fetchedAt);
    const extra = fresh.length > MAX ? fresh.slice(0, fresh.length - MAX) : [];
    const legacy = Object.keys(all).filter(k => LEGACY.test(k));
    if (stale.length || extra.length || legacy.length) await chromeApi.storage.local.remove(stale.concat(extra, legacy));
  }

  async function clearProducts() {
    memory.clear();
    const all = await chromeApi.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(PREFIX));
    await chromeApi.storage.local.remove(keys);
    return keys.length;
  }

  N.store = { getSettings, setSettings, getProduct, putProduct, allProducts, prune, clearProducts, SETTINGS_KEY, DEFAULTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
