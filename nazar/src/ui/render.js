// render.js - card badges, the badge popover and the product-page panel.
// All UI lives in <nazar-ui> hosts with shadow roots.
(function (root) {
  'use strict';
  const N = root.Nazar;
  const { esc, round } = N.util;
  const ui = N.ui;

  function host(kind) {
    const el = document.createElement('nazar-ui');
    el.setAttribute('data-kind', kind);
    const shadow = el.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${ui.CSS}</style><div class="nz"></div>`;
    return { el, box: shadow.querySelector('.nz'), shadow };
  }

  function ring(score, size, stroke) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = score == null ? 0 : score / 100;
    const label = score == null ? '?' : score;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${c * pct} ${c}"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.38)}">${label}</text>
    </svg>`;
  }

  const memberById = (s, id) => s.members.find(m => m.id === id) || s.members[0];
  const resultFor = (product, member) => N.evaluate(product, member);

  /* ------------------------------------------------------------------ badge */

  function badgeInner(product, settings) {
    const m = memberById(settings, settings.activeId);
    const r = resultFor(product, m);
    const many = settings.members.length > 1;
    const claimFlag = r.claims && r.claims.some(c => c.sev >= 3) ? '<span class="flag" title="A claim on the pack doesn\'t match the label">⚑</span>' : '';
    const top = r.reasons.find(x => x.pts < 0);
    const title = r.score == null ? 'Nazar: no data to judge'
      : `Nazar ${r.score}/100 for ${m.name} (${r.profile.label}): ${r.verdict.label}` + (top ? `\nBiggest minus: ${top.label}` : '');
    return { cls: 'v-' + r.verdict.key, html: `<div class="badge" title="${esc(title)}">${ring(r.score, 22, 3)}<span>${esc(r.verdict.label)}</span>${many ? `<span class="who">${esc(m.name)}</span>` : ''}${claimFlag}</div>` };
  }

  function mountBadge(cardEl, product, settings) {
    let h = cardEl.__nazarBadge;
    if (!h) {
      h = host('badge');
      Object.assign(h.el.style, { position: 'absolute', top: '30px', right: '6px', zIndex: '5' });
      if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
      cardEl.appendChild(h.el);
      cardEl.__nazarBadge = h;
      h.el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openPopover(h.el, h.product, h.settings);
      }, true);
    }
    h.product = product;
    h.settings = settings;
    const b = badgeInner(product, settings);
    h.box.className = 'nz ' + b.cls;
    h.box.innerHTML = b.html;
  }

  function unmountBadge(cardEl) {
    if (cardEl.__nazarBadge) { cardEl.__nazarBadge.el.remove(); cardEl.__nazarBadge = null; }
  }

  /* ------------------------------------------------------- shared sections */

  function sectionWhy(r) {
    const scored = r.reasons.filter(x => Math.abs(x.pts) >= 0.5);
    if (!scored.length) return '';
    const max = Math.max(...scored.map(x => Math.abs(x.pts)), 1);
    const mult = r.kind === 'food' ? 1.2 : 1;
    const rows = scored.slice(0, 8).map(x => {
      const neg = x.pts < 0;
      const shown = neg ? x.pts * mult : x.pts;
      return `<div class="why"><span class="l">${esc(x.label)}</span><span class="p ${neg ? 'neg' : 'pos'}">${neg ? '' : '+'}${shown.toFixed(0)}</span>
        <span class="d">${esc(x.detail)}</span>
        <span class="bar"><i style="width:${Math.round(Math.abs(x.pts) / max * 100)}%;background:${neg ? '#ef4444' : '#22c55e'}"></i></span></div>`;
    }).join('');
    return `<div class="sec"><h4>Why this score? (starts at 100)</h4>${rows}</div>`;
  }

  function sectionClaims(r) {
    if (!r.claims || !r.claims.length) return '';
    return `<div class="sec"><h4>Claim check</h4>${r.claims.map(c =>
      `<div class="claim s${c.sev >= 2 ? 3 : 1}"><div class="c">${esc(c.claim)}</div><div class="r">${esc(c.reality)}</div></div>`).join('')}</div>`;
  }

  /* --------------------------------------------------------- food sections */

  function sectionPack(product) {
    const pm = N.packMath(product);
    if (!pm) return '';
    const u = product.liquid ? 'ml' : 'g';
    const t = [];
    if (pm.kcal !== undefined) t.push([pm.kcal, 'kcal in the pack'], [pm.walkMin + ' min', 'brisk walk to burn']);
    if (pm.sugarTsp !== undefined) t.push([pm.sugarTsp, 'tsp of sugar']);
    if (pm.saltPct !== undefined) t.push([pm.saltPct + '%', 'of daily salt']);
    if (pm.proteinPer10 !== undefined && product.price) t.push([pm.proteinPer10 + ' g', 'protein per ₹10']);
    if (pm.per100 !== undefined) t.push(['₹' + pm.per100, `per 100 ${u}`]);
    if (pm.rotis !== undefined && t.length < 6) t.push([pm.rotis, 'rotis of energy']);
    return `<div class="sec"><h4>Whole pack (${round(pm.grams, 0)} ${u})</h4><div class="tiles">${t.slice(0, 6).map(([b, s]) =>
      `<div class="tile"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div></div>`;
  }

  function sectionIngredients(r) {
    const ing = r.ing;
    if (!ing) return `<div class="sec"><h4>Ingredients</h4><div class="first">This listing has no ingredient list.</div></div>`;
    const chips = ing.flags.map(f => `<span class="chip s${Math.min(f.sev, 3)}" title="${esc(f.why + (f.details.length ? ': ' + f.details.join(', ') : ''))}">${esc(f.label)}${f.inTop3 ? ' · top 3' : ''}</span>`);
    if (ing.firstIsWhole) chips.unshift(`<span class="chip good">Whole food base</span>`);
    if (!chips.length) chips.push(`<span class="chip good">No red flags</span>`);
    return `<div class="sec"><h4>Ingredients</h4>
      <div class="first">Largest ingredient: <b>${esc(ing.first || '?')}</b>${ing.upfMarkers ? ` · ${ing.upfMarkers} ultra-processing marker${ing.upfMarkers > 1 ? 's' : ''}` : ''}</div>
      <div class="chips">${chips.join('')}</div>
      <details><summary>Full list</summary>${esc(ing.raw)}</details></div>`;
  }

  const NUT_ROWS = [
    ['energy', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['sugar', 'Sugar', 'g'],
    ['addedSugar', 'Added sugar', 'g'], ['fat', 'Fat', 'g'], ['satFat', 'Saturated fat', 'g'], ['transFat', 'Trans fat', 'g'],
    ['fibre', 'Fibre', 'g'], ['sodium', 'Sodium', 'mg'],
  ];
  const CUT = { sugar: [5, 22.5], addedSugar: [5, 22.5], fat: [3, 17.5], satFat: [1.5, 5], sodium: [120, 600] };
  const CUT_DRINK = { sugar: [2.5, 11.25], addedSugar: [2.5, 11.25], fat: [1.5, 8.75], satFat: [0.75, 2.5], sodium: [120, 300] };

  function sectionNutrition(product) {
    const n = product.nutrition || {};
    const cuts = product.liquid ? CUT_DRINK : CUT;
    const rows = NUT_ROWS.filter(([k]) => n[k] !== undefined).map(([k, label, u]) => {
      const c = cuts[k];
      const lvl = c ? (n[k] > c[1] ? 'high' : n[k] > c[0] ? 'medium' : 'low') : '';
      return `<tr><td><span class="dot ${lvl}"></span>${label}</td><td>${round(n[k], 1)} ${u}</td></tr>`;
    }).join('');
    if (!rows) return '';
    const warn = product.warnings && product.warnings.length ? `<div class="warn">⚠ ${product.warnings.map(esc).join('<br>⚠ ')}</div>` : '';
    return `<div class="sec"><h4>Nutrition per 100 ${product.liquid ? 'ml' : 'g'}</h4><table class="nut">${rows}</table>${warn}</div>`;
  }

  /* --------------------------------------------------------- care sections */

  function sectionCareFlags(r) {
    const a = r.care;
    if (!a) return '';
    const bad = r.reasons.filter(x => !x.good && x.pts <= -0.5).map(x => `<span class="chip ${x.pts <= -8 ? 's3' : 's2'}" title="${esc(x.detail)}">${esc(x.label)}</span>`);
    const info = r.reasons.filter(x => !x.good && x.pts > -0.5).map(x => `<span class="chip" title="${esc(x.detail)}">${esc(x.label)}</span>`);
    const good = r.reasons.filter(x => x.good).map(x => `<span class="chip good" title="${esc(x.detail)}">${esc(x.label)}</span>`);
    const all = bad.concat(good, info);
    if (!all.length) all.push('<span class="chip good">No ingredients of concern</span>');
    const line = a.oneIdx >= 0 ? `<div class="first">Ingredients after #${a.oneIdx + 1} (${esc(a.items[a.oneIdx])}) are usually under ~1%.</div>` : '';
    return `<div class="sec"><h4>Ingredient check</h4>${line}<div class="chips">${all.join('')}</div>
      <details><summary>Full list (${a.items.length})</summary>${a.items.map((x, i) => `${i === a.oneIdx ? '<b>— ~1% line —</b> ' : ''}${esc(x)}`).join(', ')}</details></div>`;
  }

  function sectionBrandSays(product) {
    const c = product.care || {};
    const rows = [['Made for', c.concern], ['Skin type', c.skinType], ['Hair type', c.hairType], ['Key ingredients', c.keyIngredients],
      ['Hero ingredient', c.hero], ['Highlights', c.preferences], ['Fragrance', c.fragrance]].filter(([, v]) => v);
    if (!rows.length) return '';
    return `<div class="sec"><h4>What the listing claims</h4><table class="nut">${rows.map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td>${esc(String(v).slice(0, 80))}</td></tr>`).join('')}</table></div>`;
  }

  function sectionCarePrice(product) {
    if (!product.price || !product.packG) return '';
    const u = product.liquid ? 'ml' : 'g';
    return `<div class="sec"><h4>Price</h4><div class="tiles"><div class="tile"><b>₹${round(product.price / product.packG * 100, 0)}</b><span>per 100 ${u}</span></div>
      <div class="tile"><b>${round(product.packG, 0)} ${u}</b><span>pack size</span></div></div></div>`;
  }

  /* ----------------------------------------------------------------- shell */

  function memberTabs(product, settings, viewId) {
    if (settings.members.length < 2) return '';
    return `<div class="members">${settings.members.map(m => {
      const r = resultFor(product, m);
      return `<button class="mem v-${r.verdict.key} ${m.id === viewId ? 'on' : ''}" data-member="${esc(m.id)}">${ring(r.score, 24, 3)}${esc(m.name)}</button>`;
    }).join('')}</div>`;
  }

  function heroBlock(r, member) {
    const notes = [];
    if (r.score !== null && r.partial) notes.push(`Partial data: ${r.cov.missing.join(', ')} not in the listing`);
    if (r.capped) notes.push(`Score capped at ${r.capped.max}: ${r.capped.why}`);
    return `<div class="hero">${ring(r.score, 64, 7)}<div><div class="vl">${esc(r.verdict.label)}</div>
      <div class="ln">${esc(r.verdict.line)}</div>
      <div class="pb">${esc(r.profile.icon)} ${esc(member.name)} · ${esc(r.profile.label)}: ${esc(r.profile.blurb)}</div></div></div>
      ${notes.map(x => `<div class="note">${esc(x)}</div>`).join('')}`;
  }

  function productLine(product, platformLabel) {
    const ft = product.kind === 'food' ? (product.foodType || '') : '';
    const veg = /non[\s_-]*veg|egg/i.test(ft) ? '<span class="veg nonveg"></span>' : /^veg/i.test(ft) ? '<span class="veg"></span>' : '';
    const meta = [product.unitText, product.price ? '₹' + product.price : '', platformLabel].filter(Boolean).join(' · ');
    return `<div class="prod">${veg}${esc(product.name || 'Product')}<div class="meta">${esc(meta)}</div></div>`;
  }

  const FOOT = `<div class="foot">Based on the listing's data, which can differ from the actual pack. Not medical advice. Nazar is unofficial and not affiliated with any platform.</div>`;

  function fullBody(product, settings, viewId, platformLabel) {
    const member = memberById(settings, viewId);
    const r = resultFor(product, member);
    const top = productLine(product, platformLabel) + memberTabs(product, settings, member.id) + heroBlock(r, member) + sectionClaims(r);
    const rest = r.kind === 'care'
      ? sectionWhy(r) + sectionCareFlags(r) + sectionBrandSays(product) + sectionCarePrice(product)
      : sectionWhy(r) + sectionPack(product) + sectionIngredients(r) + sectionNutrition(product);
    return { cls: 'v-' + r.verdict.key, html: top + rest + FOOT };
  }

  /* --------------------------------------------------------------- popover */

  let pop = null;
  function closePopover() { if (pop) { pop.el.remove(); pop = null; } }

  function openPopover(anchor, product, settings) {
    closePopover();
    pop = host('popover');
    let viewId = settings.activeId;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 336);
    const below = rect.bottom + 8 + 400 < window.innerHeight;
    Object.assign(pop.el.style, { position: 'fixed', zIndex: '2147483001', left: left + 'px', top: below ? rect.bottom + 6 + 'px' : Math.max(8, rect.top - 6 - Math.min(window.innerHeight * 0.7, 520)) + 'px' });
    const draw = () => {
      const b = fullBody(product, settings, viewId, '');
      pop.box.className = 'nz ' + b.cls;
      pop.box.innerHTML = `<div class="pop"><div class="head"><span class="brand">na<b>z</b>ar</span><span class="sp"></span><button class="ib" data-close>×</button></div>${b.html}
        ${product.url ? `<a class="more" href="${esc(product.url)}">Open product page →</a>` : ''}</div>`;
    };
    draw();
    pop.box.addEventListener('click', e => {
      e.stopPropagation();
      const t = e.target.closest('[data-member],[data-close]');
      if (!t) return;
      if (t.hasAttribute('data-close')) return closePopover();
      viewId = t.getAttribute('data-member');
      draw();
    });
    document.documentElement.appendChild(pop.el);
  }

  document.addEventListener('click', e => { if (pop && !e.composedPath().includes(pop.el)) closePopover(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });
  window.addEventListener('scroll', () => closePopover(), { passive: true });

  /* ----------------------------------------------------------------- panel */

  // The panel docks to one side of the window. Each site has a default side that
  // keeps its Add to cart / +/- buttons clear; the user can flip it (remembered per site).
  let panel = null;

  function sideFor(defaultSide) {
    try { return localStorage.getItem('nazar:side') || defaultSide || 'right'; } catch (e) { return defaultSide || 'right'; }
  }
  function saveSide(side) { try { localStorage.setItem('nazar:side', side); } catch (e) { /* ignore */ } }

  function showPanel(product, settings, platformLabel, defaultSide) {
    hidePanel();
    panel = host('panel');
    Object.assign(panel, { product, settings, platformLabel, viewId: settings.activeId, min: sessionMin(), side: sideFor(defaultSide) });
    panel.box.addEventListener('click', e => {
      const t = e.target.closest('[data-member],[data-close],[data-min],[data-open],[data-flip]');
      if (!t) return;
      if (t.hasAttribute('data-close')) return hidePanel();
      if (t.hasAttribute('data-min')) { panel.min = true; setSessionMin(true); }
      if (t.hasAttribute('data-open')) { panel.min = false; setSessionMin(false); }
      if (t.hasAttribute('data-flip')) { panel.side = panel.side === 'left' ? 'right' : 'left'; saveSide(panel.side); }
      if (t.hasAttribute('data-member')) panel.viewId = t.getAttribute('data-member');
      drawPanel();
    });
    drawPanel();
    document.documentElement.appendChild(panel.el);
  }

  function drawPanel() {
    if (!panel) return;
    const b = fullBody(panel.product, panel.settings, panel.viewId, panel.platformLabel);
    panel.box.className = 'nz ' + b.cls;
    if (panel.min) {
      const r = resultFor(panel.product, memberById(panel.settings, panel.viewId));
      panel.box.innerHTML = `<div class="tab side-${panel.side}" data-open title="Open Nazar">${ring(r.score, 34, 4)}<span>NAZAR</span></div>`;
      return;
    }
    panel.box.innerHTML = `<div class="panel side-${panel.side}"><div class="head"><span class="brand">na<b>z</b>ar</span><span class="plat">${esc(panel.platformLabel)}</span><span class="sp"></span>
      <button class="ib" data-flip title="Move to the other side">⇄</button><button class="ib" data-min title="Minimise">–</button><button class="ib" data-close title="Close">×</button></div>${b.html}</div>`;
  }

  function hidePanel() { if (panel) { panel.el.remove(); panel = null; } }

  function showPanelMessage(text, platformLabel, defaultSide) {
    hidePanel();
    panel = host('panel');
    panel.box.className = 'nz v-unknown';
    panel.box.innerHTML = `<div class="panel side-${sideFor(defaultSide)}"><div class="head"><span class="brand">na<b>z</b>ar</span><span class="plat">${esc(platformLabel)}</span><span class="sp"></span><button class="ib" data-close>×</button></div>
      <div class="sec">${esc(text)}</div></div>`;
    panel.box.addEventListener('click', e => { if (e.target.closest('[data-close]')) hidePanel(); });
    document.documentElement.appendChild(panel.el);
  }

  function sessionMin() { try { return sessionStorage.getItem('nazar:min') === '1'; } catch (e) { return false; } }
  function setSessionMin(v) { try { sessionStorage.setItem('nazar:min', v ? '1' : '0'); } catch (e) { /* ignore */ } }

  function updateSettings(settings) {
    if (panel && panel.product) {
      panel.settings = settings;
      if (!settings.members.some(m => m.id === panel.viewId)) panel.viewId = settings.activeId;
      drawPanel();
    }
    closePopover();
  }

  Object.assign(ui, { mountBadge, unmountBadge, openPopover, closePopover, showPanel, hidePanel, showPanelMessage, updateSettings, ring });
})(typeof globalThis !== 'undefined' ? globalThis : this);
