# Nazar: health score for quick commerce

Chrome extension (Manifest V3) that puts a personal 0-100 health score on packaged
food, and an ingredient suitability check on shampoo, soap, creams and other personal
care, in Blinkit, Zepto and Swiggy Instamart. Runs entirely in the user's browser: no
backend, no account, nothing sent anywhere.

## Install (developer mode)

1. Open `chrome://extensions`, turn on **Developer mode**
2. **Load unpacked** → pick this `nazar` folder
3. The setup page opens: add family members and pick each one's food goal, skin type and hair type
4. Open Blinkit / Zepto and browse any food category

After editing code, hit the reload icon on the extension card and refresh the site tab.

## What it does

| Where | What you see |
|---|---|
| Product cards | Score ring + verdict for the active family member (food: Great choice / Okay / Occasional treat / Avoid; personal care: Great fit / Good fit / Use with care / Not a fit). ⚑ means a claim on the pack doesn't match the label. Click for the full breakdown. |
| Product page | Side panel: every family member's score, **Why this score?** (each point explained), **Claim check**. Food adds whole-pack maths, ingredient flags and a nutrition table; personal care adds an ingredient check with the ~1% line, what the listing claims, and ₹/100 ml. The panel docks left on Blinkit and right on Zepto so the Add to cart and +/- buttons stay clear; ⇄ flips it. |
| Popup | Family members + goals, toggles, local data stats, **Export JSON** of every product seen. |

Products with nothing to judge (food without a nutrition label, personal care without an ingredient list, detergent etc.) get no badge.

## Profiles

General, Diabetes, Heart / BP, Weight loss, Gym / Protein, Kids. Each profile starts
from the General weights and only **adds** strictness, so no profile can make junk look
better than General does. Gym and Weight loss judge protein by the share of calories it
supplies, so fried snacks with "some protein" don't win. Some profiles have hard caps
(e.g. Heart: sodium > 600 mg/100 g caps the score at 35).

## Personal care (`src/core/care.js`)

A suitability check, not a health score. Each member has a skin type (normal, oily /
acne-prone, dry, sensitive), a hair type (normal, dandruff, dry / curly, colour-treated,
hair fall) and a pregnancy flag.

- Product type (shampoo, face wash, soap, moisturiser, serum, sunscreen, ...) and
  rinse-off vs leave-on come from the name.
- Penalties for steroids / prescription drugs (capped at 15), formaldehyde releasers,
  MIT, triclosan, harsh sulfates, fragrance and fragrance allergens, drying alcohol near
  the top, and pore-clogging oils on acne-prone faces. Most of these weigh more for the
  member traits they affect (fragrance for sensitive skin, SLES for dry or coloured hair).
- Bonuses for actives that help the member: anti-dandruff agents, acne actives, barrier
  and hydrating ingredients, soothing ingredients, gentle surfactants.
- Caps: fragrance in a leave-on product for sensitive skin (50), retinoids in pregnancy
  (20), a non-medicated shampoo for a dandruff member (65).
- Claim check: "sulfate / paraben / fragrance free" vs the list, "anti-dandruff" with no
  active, sunscreen with no UV filter, and **hero ingredients vs the ~1% line**: anything
  listed after fragrance or common preservatives is usually under 1%.

About 5 of 7 sampled Blinkit personal care listings include a full ingredient list.
Those without one get a panel with the listing's own claims, but no score.

## How the food score works (`src/core/score.js`)

- Start at 100.
- Penalties for sugar (added sugar when listed), saturated fat, total fat, sodium,
  calories, trans fat, carbs (Diabetes), maida as the first ingredient, and
  ultra-processing markers. Cut-offs follow UK FSA front-of-pack levels per 100 g /
  100 ml: 20% of the weight at "medium", 60% at "high", 100% at twice "high".
- Bonuses for protein and fibre (halved when the product is already heavily
  penalised; reduced for maida-first products).
- Missing saturated fat on a high-fat product is estimated at 40% of fat and labelled
  "estimated" instead of being ignored.

It is a transparent heuristic, not a regulatory or medical rating.

## How data is read

| Platform | Source | Status |
|---|---|---|
| Blinkit | Product page HTML → `window.grofers.PRELOADED_STATE` → `…custom_data.seo.attributes` (typed "Per 100 g" fields + nutrition table) | Verified on real pages |
| Zepto | "Nutrition Information" / "Ingredients" rows, read by label text (class names are obfuscated). Fetch for cards; if AWS WAF blocks the fetch, the product page is read from the live DOM. | Product page verified; card fetch untested |
| Instamart | Same label-based reader; URL pattern `/instamart/item/<id>` is a guess | **Experimental, untested** |

Fetches go through a queue (3 at a time), only for cards near the viewport, and are
cached in `chrome.storage.local` for 3 days (max 1500 products).

## Layout

```
manifest.json
background.js            opens setup page on install
src/core/                util, nutrition parser, ingredient flags, claim check, profiles, food score, personal care, storage
src/adapters/            generic (label reader, JSON-LD), blinkit, zepto, instamart
src/ui/                  styles (shadow DOM CSS), render (badge, popover, panel)
src/content.js           wires adapter + UI, SPA navigation, fetch queue
popup/                   family + settings + export
tools/capture-blinkit.js README screenshots on live Blinkit pages (headless Chrome + DevTools protocol)
tools/make-icons.js      regenerate icons
```

## Known gaps / next

- Zepto listing cards: needs a check that fetched product HTML contains nutrition.
  Turn on **Debug logs** in the popup and watch the console (`[Nazar] zepto … nutrients: N`).
- Instamart: needs a real product URL to verify the adapter.
- Card badge position (`top: 30px; right: 6px`) may need per-site tweaks.
- Zepto personal care field labels ("Skin Type", "Concern"...) are guessed; Blinkit's are verified.
- Not built yet: better swaps, whole-cart score.
