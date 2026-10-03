// Fetch real Blinkit product pages and save just the product object as test fixtures.
// Usage: node tools/fetch-fixtures.js 12872 534557 ...
const fs = require('fs');
const path = require('path');
require('../src/core/util.js');
require('../src/core/nutrition.js');
require('../src/adapters/generic.js');
require('../src/adapters/blinkit.js');
const N = globalThis.Nazar;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const dir = path.join(__dirname, '..', 'tests', 'fixtures');
fs.mkdirSync(dir, { recursive: true });

(async () => {
  for (const id of process.argv.slice(2)) {
    const res = await fetch(`https://blinkit.com/prn/p/prid/${id}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    const html = await res.text();
    const seo = N.blinkit.seoFromHtml(html);
    if (!seo) { console.log(id, 'HTTP', res.status, 'no product payload'); continue; }
    fs.writeFileSync(path.join(dir, `blinkit-${id}.json`), JSON.stringify(seo, null, 1));
    console.log(id, '->', seo.product_name);
    await new Promise(r => setTimeout(r, 800));
  }
})();
