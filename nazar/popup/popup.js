// popup.js - family members, toggles, local data stats/export.
(async function () {
  'use strict';
  const N = globalThis.Nazar;
  const $ = id => document.getElementById(id);
  const esc = N.util.esc;
  if (location.search.includes('welcome') || window.innerWidth > 440) document.body.classList.add('page');

  let s = await N.store.getSettings();
  const save = async patch => { s = await N.store.setSettings(patch); };

  const options = (map, sel) => Object.entries(map).map(([k, label]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const foodOptions = Object.fromEntries(Object.entries(N.PROFILES).map(([k, p]) => [k, `${p.icon} ${p.label}`]));
  const skinOptions = Object.fromEntries(Object.entries(N.care.SKIN).map(([k, v]) => [k, '🧴 ' + v]));
  const hairOptions = Object.fromEntries(Object.entries(N.care.HAIR).map(([k, v]) => [k, '💇 ' + v]));

  function drawMembers() {
    $('members').innerHTML = s.members.map(m => `
      <div class="member ${m.id === s.activeId ? 'on' : ''}" data-id="${esc(m.id)}">
        <div class="line top">
          <input type="radio" name="active" ${m.id === s.activeId ? 'checked' : ''} title="Show this member on product cards">
          <input type="text" class="name" value="${esc(m.name)}" maxlength="14" placeholder="Name">
          <select class="profile" title="Food goal">${options(foodOptions, m.profile || 'general')}</select>
          <button class="x" title="Remove" ${s.members.length < 2 ? 'disabled' : ''}>×</button>
        </div>
        <div class="line care">
          <select class="skin" title="Skin type">${options(skinOptions, m.skin || 'normal')}</select>
          <select class="hair" title="Hair type">${options(hairOptions, m.hair || 'normal')}</select>
          <label class="preg" title="Flags retinoids and other actives to avoid in pregnancy"><input type="checkbox" class="pregnant" ${m.pregnant ? 'checked' : ''}>Pregnant</label>
        </div>
      </div>`).join('');
    $('add').disabled = s.members.length >= 6;
  }

  function readRow(row, m) {
    return Object.assign({}, m, {
      name: row.querySelector('.name').value.trim() || 'Member',
      profile: row.querySelector('.profile').value,
      skin: row.querySelector('.skin').value,
      hair: row.querySelector('.hair').value,
      pregnant: row.querySelector('.pregnant').checked,
    });
  }

  $('members').addEventListener('change', async e => {
    const row = e.target.closest('.member');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.type === 'radio') { await save({ activeId: id }); return drawMembers(); }
    await save({ members: s.members.map(m => m.id === id ? readRow(row, m) : m) });
  });

  $('members').addEventListener('click', async e => {
    if (!e.target.classList.contains('x') || e.target.disabled) return;
    const id = e.target.closest('.member').dataset.id;
    const members = s.members.filter(m => m.id !== id);
    await save({ members, activeId: s.activeId === id ? members[0].id : s.activeId });
    drawMembers();
  });

  $('add').addEventListener('click', async () => {
    if (s.members.length >= 6) return;
    const id = 'm' + Date.now().toString(36);
    await save({ members: s.members.concat({ id, name: 'Member ' + (s.members.length + 1), profile: 'general', skin: 'normal', hair: 'normal', pregnant: false }) });
    drawMembers();
    const rows = $('members').querySelectorAll('.name');
    rows[rows.length - 1].select();
  });

  for (const key of ['showBadges', 'showPanel', 'debug']) {
    $(key).checked = !!s[key];
    $(key).addEventListener('change', e => save({ [key]: e.target.checked }));
  }

  async function drawStats() {
    const all = await N.store.allProducts();
    const food = all.filter(x => x.kind === 'food' && x.nutrition && Object.keys(x.nutrition).length >= 3).length;
    const care = all.filter(x => x.kind === 'care').length;
    $('stats').innerHTML = [[all.length, 'products seen'], [food, 'food with nutrition'], [care, 'personal care']]
      .map(([b, t]) => `<div class="stat"><b>${b}</b><span>${t}</span></div>`).join('');
  }

  $('export').addEventListener('click', async () => {
    const all = await N.store.allProducts();
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: all.length, products: all }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nazar-products-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('clear').addEventListener('click', async () => {
    const n = await N.store.clearProducts();
    $('clear').textContent = `Removed ${n}`;
    drawStats();
  });

  drawMembers();
  drawStats();
})();
