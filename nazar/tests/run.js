// Node test runner for the core engine: node tests/run.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['util', 'nutrition', 'ingredients', 'claims', 'profiles', 'score', 'care']) require(path.join(root, 'src/core', f + '.js'));
require(path.join(root, 'src/adapters/generic.js'));
require(path.join(root, 'src/adapters/blinkit.js'));
const N = globalThis.Nazar;

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.log('  FAIL:', msg); } };

// 1. Zepto nutrition string (Haldiram's Bhujia, from the live page)
console.log('\n== Zepto text parse ==');
const z = N.nutrition.parseTable('Energy (kcal): 572.0, Protein (g): 12.5, Total Carbohydrate (g): 42.3, Total Sugar (g): 3.6, Added Sugar (g): 0.0, Total Fat (g): 39.2, Saturated Fat (g): 12.2, Trans Fat (g): 0.1, Cholesterol (mg): 0.0, Sodium (mg): 814.1');
console.log(z.values);
ok(z.values.energy === 572 && z.values.protein === 12.5 && z.values.carbs === 42.3, 'energy/protein/carbs');
ok(z.values.sugar === 3.6 && z.values.addedSugar === 0 && z.values.fat === 39.2, 'sugar/addedSugar/fat');
ok(z.values.satFat === 12.2 && z.values.transFat === 0.1 && z.values.sodium === 814.1, 'satFat/trans/sodium');

const bhujia = N.generic.buildProduct({
  platform: 'zepto', id: 'x', name: "Haldiram's Bhujia Spicy Crunchy Snack", unitText: '1 pc (200 g)', price: 60,
  table: 'Energy (kcal): 572.0, Protein (g): 12.5, Total Carbohydrate (g): 42.3, Total Sugar (g): 3.6, Added Sugar (g): 0.0, Total Fat (g): 39.2, Saturated Fat (g): 12.2, Trans Fat (g): 0.1, Cholesterol (mg): 0.0, Sodium (mg): 814.1',
  ingredientsText: 'Tepary Beans Flour, Edible Vegetable Oil (Cotton Seed, Corn and Palmolein Oil), Gram Pulse Flour, Iodised Salt, Spices and Condiments (Red Chilli Powder, Black Pepper Powder, Ginger Powder, Clove Powder, Mace Powder, Nutmeg Powder and Cardamom Powder), Used As Natural Flavouring Substances',
});
ok(bhujia.packG === 200, 'pack grams from "1 pc (200 g)"');

// 2. Other formats
console.log('\n== Format variants ==');
const v1 = N.nutrition.parseTable('Nutritional Information per 100g: Energy 2010 kJ / 480 kcal Protein 6g Carbohydrate 60g of which Sugars 22g Fat 24g Saturated Fat 11g Salt 1.2g');
console.log(v1.values);
ok(v1.values.energy === 480 && v1.values.sugar === 22 && v1.values.satFat === 11 && Math.round(v1.values.salt * 10) === 12, 'kJ/kcal + salt');
const v2 = N.nutrition.parseTable('Per serving (30 g): Energy 150 kcal, Protein 3 g, Fat 9 g');
ok(v2.values.energy === 500 && v2.values.protein === 10, 'per-serving scaled to 100 g: ' + JSON.stringify(v2.values));
const v3 = N.nutrition.parseTable('Total Fat 20 g, Saturated Fat 8 g, Monounsaturated Fat 7 g, Polyunsaturated Fat 4 g');
ok(v3.values.fat === 20 && v3.values.satFat === 8 && Object.keys(v3.values).length === 2, 'unsaturated fats skipped: ' + JSON.stringify(v3.values));

// 3. Ingredients
console.log('\n== Ingredients ==');
const ing = N.ingredients.analyze('Refined Wheat Flour (Maida), Sugar, Edible Vegetable Oil (Palm), Invert Syrup, Raising Agents (503(ii), 500(ii)), Emulsifiers (322, 471), Artificial Flavour (Vanilla), Colour (150d)');
console.log(' first:', ing.first, '| refined first:', ing.firstIsRefined, '| upf markers:', ing.upfMarkers);
console.log(' flags:', ing.flags.map(f => `${f.label}[${f.sev}${f.inTop3 ? ',top3' : ''}] ${f.details.join('/')}`).join(' ; '));
ok(ing.firstIsRefined, 'maida first');
ok(ing.has('emulsifier') && ing.has('caramel') && ing.has('flavour') && ing.has('palm') && ing.has('sugar'), 'flags found');
ok(!ing.flags.some(f => f.details.includes('INS 503')), 'raising agents not flagged');
const noSugar = N.ingredients.analyze('Oats, Almonds, Dates. No added sugar.');
ok(!noSugar.has('sugar'), '"No added sugar" text is not an added sugar');

// 4. Real Blinkit products through every profile
console.log('\n== Blinkit fixtures x profiles ==');
const fx = path.join(__dirname, 'fixtures');
const profiles = Object.keys(N.PROFILES);
console.log('product'.padEnd(52), profiles.map(p => p.slice(0, 7).padStart(8)).join(''));
const products = [bhujia];
const careProducts = [];
for (const f of fs.readdirSync(fx).filter(f => f.endsWith('.json'))) {
  const seo = JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'));
  const p = N.blinkit.productFromSeo(seo, 'https://blinkit.com/prn/p/prid/' + seo.id);
  (p.kind === 'care' ? careProducts : products).push(p);
}
for (const p of products) {
  const cells = profiles.map(k => { const r = N.score(p, k); return String(r.score === null ? '?' : r.score).padStart(8); });
  console.log(p.name.slice(0, 50).padEnd(52), cells.join(''));
}

console.log('\n== Details ==');
for (const p of products) {
  const r = N.score(p, 'general');
  console.log(`\n${p.name} [${p.unitText}, ₹${p.price}] -> ${r.score} ${r.verdict.label}${r.partial ? ' (partial: missing ' + r.cov.missing.join(',') + ')' : ''}${r.capped ? ' cap: ' + r.capped.why : ''}`);
  console.log('  nutrition:', JSON.stringify(p.nutrition));
  if (p.warnings.length) console.log('  warnings:', p.warnings.join(' | '));
  console.log('  why:', r.reasons.slice(0, 6).map(x => `${x.label} ${x.pts > 0 ? '+' : ''}${x.pts.toFixed(1)}`).join(', '));
  if (r.ing) console.log('  ingredients:', r.ing.flags.map(f => f.label).join(', ') || 'clean', '| first:', r.ing.first);
  if (r.claims.length) r.claims.forEach(c => console.log('  CLAIM:', c.claim, '->', c.reality));
  const pm = N.packMath(p);
  if (pm) console.log('  pack:', JSON.stringify(pm));
}

const protein = products.find(p => /protein potato chips/i.test(p.name));
if (protein) ok(N.score(protein, 'general').claims.some(c => /protein/i.test(c.claim)), 'protein chips claim flagged');
const milk = products.find(p => /milk/i.test(p.name));
const biscuit = products.find(p => /bourbon|good day/i.test(p.name));
if (milk && biscuit) ok(N.score(milk, 'kids').score > N.score(biscuit, 'kids').score, 'milk beats biscuit for kids');
ok(N.score(bhujia, 'heart').score <= 35, 'bhujia capped for heart profile');
ok(N.score(bhujia, 'gym').score < 50, 'gym profile does not reward fried namkeen: ' + N.score(bhujia, 'gym').score);
const butter = products.find(p => /butter/i.test(p.name));
if (butter) ok(N.score(butter, 'general').score < 45, 'butter without satFat still penalised: ' + N.score(butter, 'general').score);
for (const p of products) for (const k of ['diabetes', 'heart', 'kids']) {
  const g = N.score(p, 'general').score, s = N.score(p, k).score;
  if (g !== null) ok(s <= g, `${k} never kinder than general for ${p.name} (${s} > ${g})`);
}

// 5. Personal care
console.log('\n== Personal care x members ==');
const members = {
  normal: { name: 'Normal', profile: 'general' },
  dandruff: { name: 'Dandruff', profile: 'general', hair: 'dandruff' },
  dryHair: { name: 'DryHair', profile: 'general', hair: 'dry' },
  sensitive: { name: 'Sensitive', profile: 'general', skin: 'sensitive' },
  oily: { name: 'Oily', profile: 'general', skin: 'oily' },
  pregnant: { name: 'Pregnant', profile: 'general', pregnant: true },
};
console.log('product'.padEnd(50), Object.keys(members).map(k => k.slice(0, 9).padStart(10)).join(''));
for (const p of careProducts) {
  console.log(p.name.slice(0, 48).padEnd(50), Object.values(members).map(m => String(N.evaluate(p, m).score ?? '?').padStart(10)).join(''));
}
for (const p of careProducts) {
  const r = N.evaluate(p, members.sensitive);
  console.log(`\n${p.name} [${N.care.typeLabel(r.type.type)}, ${r.type.use}]`);
  if (r.score === null) { console.log('  no ingredient list; listing claims:', JSON.stringify(p.care)); continue; }
  console.log('  sensitive:', r.score, r.verdict.label, '|', r.reasons.map(x => `${x.label} ${x.pts > 0 ? '+' : ''}${Math.round(x.pts)}`).join(', '));
  if (r.care.oneIdx >= 0) console.log('  1% line at #' + (r.care.oneIdx + 1), r.care.items[r.care.oneIdx]);
  r.claims.forEach(c => console.log('  CLAIM:', c.claim, '->', c.reality));
}
ok(careProducts.length >= 5, 'personal care fixtures classified as care: ' + careProducts.length);
ok(products.every(p => p.kind === 'food'), 'food fixtures stay food');
const clinic = careProducts.find(p => /clinic plus/i.test(p.name));
if (clinic) {
  ok(N.evaluate(clinic, members.dryHair).score < N.evaluate(clinic, members.normal).score, 'SLES shampoo scores lower for dry hair');
  ok(N.evaluate(clinic, members.dandruff).reasons.some(x => x.key === 'noActive'), 'dandruff member warned: no anti-dandruff active');
}
const cetaphil = careProducts.find(p => /cetaphil/i.test(p.name));
if (cetaphil) ok(N.evaluate(cetaphil, members.sensitive).score >= 75, 'Cetaphil is a great fit for sensitive skin: ' + N.evaluate(cetaphil, members.sensitive).score);
const hs = careProducts.find(p => /head & shoulders/i.test(p.name));
if (hs) ok(N.evaluate(hs, members.normal).score === null && !N.hasVerdict(hs), 'no ingredient list -> no score, no badge');

// Synthetic edge cases
const steroid = N.generic.buildProduct({ platform: 't', id: 's', name: 'Fairness Cream', foodType: 'non_food', ingredientsText: 'Hydroquinone 2%, Tretinoin 0.025%, Mometasone Furoate 0.1%, Cream base' });
ok(steroid.kind === 'care' && N.evaluate(steroid, members.normal).score <= 15, 'steroid fairness cream capped: ' + N.evaluate(steroid, members.normal).score);
const ret = N.generic.buildProduct({ platform: 't', id: 'r', name: 'Night Serum', ingredientsText: 'Aqua, Glycerin, Retinol, Squalane, Phenoxyethanol' });
ok(N.evaluate(ret, members.pregnant).score <= 20 && N.evaluate(ret, members.normal).score > 60, 'retinol flagged only for pregnancy');
const sf = N.generic.buildProduct({ platform: 't', id: 'f', name: 'Sulfate Free Onion Shampoo', ingredientsText: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Parfum, Phenoxyethanol, Allium Cepa Extract' });
const sfc = N.evaluate(sf, members.normal).claims.map(c => c.claim).join(' | ');
ok(/Sulfate free/.test(sfc) && /Onion/.test(sfc), 'sulfate-free + onion hero claims caught: ' + sfc);
const spf = N.generic.buildProduct({ platform: 't', id: 'u', name: 'Aloe Sunscreen SPF 50', ingredientsText: 'Aqua, Aloe Barbadensis Leaf Juice, Glycerin, Parfum' });
ok(N.evaluate(spf, members.normal).claims.some(c => /UV filter/.test(c.reality)), 'sunscreen without UV filter flagged');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
