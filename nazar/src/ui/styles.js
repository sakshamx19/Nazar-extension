// styles.js - CSS injected into Nazar's shadow roots, so site styles never leak in or out.
(function (root) {
  'use strict';
  const N = root.Nazar;
  N.ui = N.ui || {};

  N.ui.CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.nz { font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; color: #10231c; -webkit-font-smoothing: antialiased; }
.v-great { --vc: #15803d; --vb: #dcfce7; }
.v-ok { --vc: #4d7c0f; --vb: #ecfccb; }
.v-some { --vc: #c2410c; --vb: #ffedd5; }
.v-avoid { --vc: #b91c1c; --vb: #fee2e2; }
.v-unknown { --vc: #6b7280; --vb: #f3f4f6; }

/* ---------- card badge ---------- */
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 2px; border-radius: 999px;
  background: #fff; border: 1.5px solid var(--vc); box-shadow: 0 2px 8px rgba(16,35,28,.18);
  cursor: pointer; font-size: 11px; font-weight: 700; color: var(--vc); line-height: 1; user-select: none; }
.badge:hover { box-shadow: 0 3px 12px rgba(16,35,28,.28); }
.badge .who { font-size: 10px; opacity: .8; }
.badge .flag { font-size: 10px; color: #b91c1c; }

/* ---------- ring ---------- */
.ring { display: block; }
.ring .track { stroke: var(--vb); }
.ring .arc { stroke: var(--vc); stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; }
.ring text { fill: var(--vc); font-weight: 800; font-family: inherit; }

/* ---------- popover + panel shell ---------- */
.pop { width: 320px; max-height: 70vh; overflow: auto; background: #fff; border-radius: 16px;
  box-shadow: 0 12px 40px rgba(16,35,28,.28); border: 1px solid #e5ece8; }
.panel { position: fixed; top: 84px; width: 360px; max-height: calc(100vh - 100px); overflow: auto;
  background: #fff; border-radius: 18px; box-shadow: 0 16px 48px rgba(16,35,28,.30); border: 1px solid #e5ece8; z-index: 2147483000; }
.panel.side-right { right: 16px; } .panel.side-left { left: 16px; }
.tab { position: fixed; top: 140px; z-index: 2147483000; background: #10231c; color: #fff;
  padding: 10px 8px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px;
  box-shadow: -4px 6px 20px rgba(16,35,28,.3); font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.tab .ring text { fill: #fff; }
.tab.side-right { right: 0; border-radius: 14px 0 0 14px; } .tab.side-left { left: 0; border-radius: 0 14px 14px 0; }

.head { position: sticky; top: 0; background: #10231c; color: #fff; padding: 10px 12px; display: flex; align-items: center; gap: 8px; z-index: 2; }
.brand { font-weight: 800; font-size: 15px; letter-spacing: .02em; }
.brand b { color: #fbbf24; }
.plat { font-size: 10px; background: rgba(255,255,255,.14); padding: 2px 6px; border-radius: 6px; }
.head .sp { flex: 1; }
.ib { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; width: 26px; height: 26px; border-radius: 8px; line-height: 1; }
.ib:hover { background: rgba(255,255,255,.14); }

.prod { padding: 10px 14px 4px; font-size: 13px; font-weight: 600; line-height: 1.35; }
.prod .meta { font-size: 11px; color: #5b6b64; font-weight: 500; margin-top: 2px; }
.veg { display: inline-block; width: 10px; height: 10px; border: 1.5px solid #15803d; border-radius: 2px; position: relative; vertical-align: -1px; margin-right: 4px; }
.veg::after { content: ""; position: absolute; inset: 2px; border-radius: 50%; background: #15803d; }
.veg.nonveg { border-color: #b91c1c; } .veg.nonveg::after { background: #b91c1c; }

.members { display: flex; gap: 6px; padding: 8px 14px; overflow-x: auto; }
.mem { flex: none; display: flex; align-items: center; gap: 6px; border: 1.5px solid #e5ece8; background: #fff; border-radius: 12px;
  padding: 4px 8px 4px 4px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; color: #10231c; }
.mem.on { border-color: #10231c; background: #f4f7f5; }

.hero { display: flex; gap: 12px; align-items: center; margin: 6px 14px 4px; padding: 12px; border-radius: 14px; background: var(--vb); }
.hero .vl { font-size: 18px; font-weight: 800; color: var(--vc); }
.hero .ln { font-size: 12px; color: #10231c; margin-top: 2px; }
.hero .pb { font-size: 11px; color: #5b6b64; margin-top: 4px; }
.note { margin: 6px 14px 0; font-size: 11px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 6px 8px; }

.sec { padding: 10px 14px 4px; }
.sec h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #5b6b64; font-weight: 700; }
.why { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 12px; margin-bottom: 7px; }
.why .l { font-weight: 600; }
.why .p { font-weight: 800; text-align: right; }
.why .p.neg { color: #b91c1c; } .why .p.pos { color: #15803d; }
.why .d { grid-column: 1 / -1; font-size: 11px; color: #5b6b64; }
.why .bar { grid-column: 1 / -1; height: 4px; background: #eef2f0; border-radius: 4px; overflow: hidden; }
.why .bar i { display: block; height: 100%; border-radius: 4px; }

.claim { border-left: 3px solid #b91c1c; background: #fef2f2; border-radius: 8px; padding: 6px 8px; margin-bottom: 6px; font-size: 12px; }
.claim .c { font-weight: 700; }
.claim .r { color: #3f3f46; margin-top: 2px; }
.claim.s1 { border-color: #d97706; background: #fffbeb; }

.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tile { background: #f4f7f5; border-radius: 10px; padding: 7px 6px; text-align: center; }
.tile b { display: block; font-size: 15px; font-weight: 800; }
.tile span { font-size: 10px; color: #5b6b64; }

.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: #f4f7f5; border: 1px solid #e5ece8; font-weight: 600; }
.chip.s3 { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
.chip.s2 { background: #ffedd5; border-color: #fed7aa; color: #9a3412; }
.chip.good { background: #dcfce7; border-color: #bbf7d0; color: #166534; }
.first { font-size: 12px; margin-bottom: 6px; }
details { margin-top: 6px; font-size: 11px; color: #3f3f46; }
summary { cursor: pointer; color: #0f766e; font-weight: 600; }

table.nut { width: 100%; border-collapse: collapse; font-size: 12px; }
table.nut td { padding: 4px 0; border-bottom: 1px solid #f0f3f1; }
table.nut td:last-child { text-align: right; font-weight: 700; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: #d1d5db; }
.dot.low { background: #22c55e; } .dot.medium { background: #f59e0b; } .dot.high { background: #ef4444; }

.warn { font-size: 11px; color: #92400e; }
.foot { padding: 10px 14px 14px; font-size: 10px; color: #6b7280; line-height: 1.4; }
.more { display: block; margin: 8px 14px 12px; text-align: center; font-size: 12px; font-weight: 700; color: #0f766e; text-decoration: none; }
`;
})(typeof globalThis !== 'undefined' ? globalThis : this);
