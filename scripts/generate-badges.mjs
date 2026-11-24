#!/usr/bin/env node
/**
 * Generates the profile badge stickers in src/assets/badges/.
 *
 * Usage: node scripts/generate-badges.mjs
 *
 * Every badge is one category glyph on one level sticker, so all files come
 * from 4 glyphs and 5 level styles. The level shows three ways at once:
 *
 *   Level  Wear     Cut                Print
 *   1      Beaten   circle             faded category colour
 *   2      Scuffed  rounded square     category colour
 *   3      Used     shield             category colour + halftone
 *   4      Clean    7 soft prongs      gold foil
 *   5      Mint     10-point star      holo foil with a moving shine
 *
 * Wear (folded corner, chipped edge, scratches, sun fade, dirt) uses a seeded
 * random generator, so the output is the same on every run.
 *
 * To add a category, add a glyph to GLYPHS and colours to CATEGORIES, then
 * run the script. The file names follow `${iconPrefix}${tier}.svg` from
 * src/app/shared/badge-definitions.ts.
 *
 * The files only use plain SVG features (clip paths, masks, gradients,
 * patterns and a small embedded CSS animation), so they work in <img>.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "badges");

/** Category colours and sticker tilt, keyed by the iconPrefix without "_". */
const CATEGORIES = {
  early: { fill: "#b98cff", ink: "#24123d", tilt: -6, fold: -38 },
  spot: { fill: "#5b7cff", ink: "#0b1440", tilt: 4, fold: -142 },
  update: { fill: "#ffb347", ink: "#3d2200", tilt: -3, fold: 36 },
  media: { fill: "#ff8fb1", ink: "#3d0f1f", tilt: 6, fold: 140 },
};

/**
 * Glyphs on a 24 x 24 grid. `details` are printed on top of the main shape:
 * tone "bg" uses the sticker colour, "fg" the glyph colour, and "bgStroke"
 * draws a line in the sticker colour.
 */
const GLYPHS = {
  // Crown with a jewel.
  early: {
    main: "M3 17.5 4.6 7.2 9 11.2 12 4 15 11.2 19.4 7.2 21 17.5ZM3.4 19h17.2v2.2H3.4Z",
    details: [{ el: "circle", a: { cx: 12, cy: 14, r: 1.6 }, tone: "bg" }],
  },
  // Map pin with a plus.
  spot: {
    main: "M12 1.8c-4.5 0-8.1 3.6-8.1 8.1 0 5.4 6.5 11.4 7.4 12.2.4.3 1 .3 1.4 0 .9-.8 7.4-6.8 7.4-12.2 0-4.5-3.6-8.1-8.1-8.1Z",
    details: [{ el: "path", a: { d: "M10.9 5.6h2.2v3.2h3.2V11h-3.2v3.2h-2.2V11H7.7V8.8h3.2Z" }, tone: "bg" }],
  },
  // Pencil.
  update: {
    main: "M2.6 21.4 3.7 16 15.4 4.3a2.3 2.3 0 0 1 3.3 0l1 1a2.3 2.3 0 0 1 0 3.3L8 20.3Z",
    details: [
      { el: "path", a: { d: "M13.6 6.1 17.9 10.4", fill: "none", "stroke-width": 1.5 }, tone: "bgStroke" },
      { el: "path", a: { d: "M3.9 15.8 8.2 20.1", fill: "none", "stroke-width": 1.3 }, tone: "bgStroke" },
    ],
  },
  // Camera.
  media: {
    main: "M4 6.8h3.3l1.6-2.3h6.2l1.6 2.3H20a2.2 2.2 0 0 1 2.2 2.2v9.2a2.2 2.2 0 0 1-2.2 2.2H4a2.2 2.2 0 0 1-2.2-2.2V9A2.2 2.2 0 0 1 4 6.8Z",
    details: [
      { el: "circle", a: { cx: 12, cy: 13.4, r: 4.6 }, tone: "bg" },
      { el: "circle", a: { cx: 12, cy: 13.4, r: 2.5 }, tone: "fg" },
      { el: "circle", a: { cx: 18.6, cy: 9.4, r: 1 }, tone: "bg" },
    ],
  },
};

/** Wear per level. `fold` is how far the corner folds in, in badge units (64 = full width). */
const WEAR = {
  1: { fold: 6, nicks: 5, scratches: 8, fade: 0.34, grime: 24 },
  2: { fold: 3, nicks: 2, scratches: 5, fade: 0.17, grime: 11 },
  3: { fold: 0, nicks: 0, scratches: 3, fade: 0.06, grime: 4 },
  4: { fold: 0, nicks: 0, scratches: 0, fade: 0, grime: 0 },
  5: { fold: 0, nicks: 0, scratches: 0, fade: 0, grime: 0 },
};

/* ---------------------------------------------------------------------- */
/* Geometry                                                                */
/* ---------------------------------------------------------------------- */

const r2 = (n) => +n.toFixed(2);
const ptsToPath = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${r2(p[0])} ${r2(p[1])}`).join("") + "Z";

function circlePts(cx, cy, r, n = 72) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function roundRectPts(x, y, w, h, r, seg = 6) {
  const pts = [];
  const corners = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (i / seg) * 90) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function cubicPts(p0, p1, p2, p3, n = 10) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

function shieldPts() {
  return [
    [32, 7], [53, 14], [53, 31],
    ...cubicPts([53, 31], [53, 44], [44, 53], [32, 58]),
    ...cubicPts([32, 58], [20, 53], [11, 44], [11, 31]),
    [11, 14],
  ];
}

/** Rounded prongs: a sine wave around a circle with one prong pointing up. */
function softPts(cx, cy, prongs, r, amp, n = 180) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r + amp * Math.cos(prongs * (a + Math.PI / 2));
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
}

function starPts(cx, cy, points, rOut, rIn) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? rIn : rOut;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

const LEVEL_SHAPES = {
  1: () => circlePts(32, 32, 23),
  2: () => roundRectPts(10, 10, 44, 44, 7),
  3: () => shieldPts(),
  4: () => softPts(32, 32, 7, 24.4, 1.5),
  5: () => starPts(32, 32, 10, 27, 20.5),
};

/* ---------------------------------------------------------------------- */
/* Seeded randomness                                                       */
/* ---------------------------------------------------------------------- */

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------------------------------------------------------------------- */
/* Rendering                                                               */
/* ---------------------------------------------------------------------- */

const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");

function glyphMarkup(cat, fg, bg) {
  const g = GLYPHS[cat];
  const details = g.details
    .map((d) => {
      const a = { ...d.a };
      if (d.tone === "bgStroke") {
        a.stroke = bg;
        a["stroke-linecap"] = "round";
      } else {
        a.fill = d.tone === "bg" ? bg : fg;
      }
      return `<${d.el} ${attrs(a)}/>`;
    })
    .join("");
  return `<g transform="translate(17 17) scale(1.25)"><path d="${g.main}" fill="${fg}"/>${details}</g>`;
}

/** Fill, glyph colours and gradient/pattern definitions for one level. */
function finish(cat, tier, id) {
  const c = CATEGORIES[cat];
  if (tier <= 2) return { defs: "", fill: c.fill, fg: c.ink, bg: c.fill, ink: c.ink };
  if (tier === 3) {
    return {
      defs: `<pattern id="${id}h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2" cy="2" r="0.9" fill="${c.ink}" fill-opacity=".24"/></pattern>`,
      fill: c.fill, fg: "#ffffff", bg: c.fill, ink: c.ink, halftone: true,
    };
  }
  if (tier === 4) {
    return {
      defs: `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#f5c542"/><stop offset=".55" stop-color="#fff0a0"/><stop offset=".8" stop-color="#d99a1c"/><stop offset="1" stop-color="#f5c542"/></linearGradient>`,
      fill: `url(#${id}g)`, fg: "#3b2600", bg: "#f5c542", ink: "#3b2600",
    };
  }
  return {
    defs:
      `<linearGradient id="${id}o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8f0ff"/><stop offset=".25" stop-color="#d8c4ff"/><stop offset=".5" stop-color="#ffc6ec"/><stop offset=".75" stop-color="#fff2b8"/><stop offset="1" stop-color="#b8c4ff"/></linearGradient>` +
      `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    fill: `url(#${id}o)`, fg: "#1b1640", bg: "#e6dcff", ink: "#1b1640", sheen: true,
  };
}

/** Shine that sweeps across the holo foil. Embedded so it also runs inside <img>. */
const SHEEN_STYLE =
  "<style>.sheen{animation:sheen 3.6s ease-in-out infinite}" +
  "@keyframes sheen{0%{transform:translateX(0)}55%,100%{transform:translateX(120px)}}" +
  "@media (prefers-reduced-motion:reduce){.sheen{animation:none}}</style>";

function badge(cat, tier) {
  const id = `${cat}${tier}-`;
  const rand = rng(hash(`worn${cat}${tier}`));
  const wear = WEAR[tier];
  const pts = LEVEL_SHAPES[tier]();
  const d = ptsToPath(pts);
  const c = [32, 32];
  const fin = finish(cat, tier, id);
  const { ink } = fin;
  const path = (a) => `<path d="${d}" ${a}/>`;
  const stroke = (w, color, extra = "") => path(`fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" ${extra}`);

  let defs = fin.defs + `<clipPath id="${id}sh"><path d="${d}"/></clipPath>`;

  // Sticker face: drop shadow, outline, white die-cut border, print.
  let face = `<g transform="translate(1.2 2.2)">${path(`fill="#000" fill-opacity=".28" stroke="#000" stroke-opacity=".28" stroke-width="7" stroke-linejoin="round"`)}</g>`;
  face += stroke(8.5, ink) + stroke(6, "#ffffff");
  if (wear.fade) face += stroke(6, "#d6c59c", `stroke-opacity="${r2(wear.fade * 1.5)}"`);
  face += path(`fill="${fin.fill}"`);
  if (fin.halftone) face += path(`fill="url(#${id}h)"`);
  if (fin.sheen) {
    face += `<g clip-path="url(#${id}sh)"><g transform="rotate(20 32 32)"><rect class="sheen" x="-30" y="-20" width="22" height="104" fill="url(#${id}s)"/></g></g>`;
  }
  face += glyphMarkup(cat, fin.fg, fin.bg);
  if (wear.fade) face += path(`fill="#f3ecdc" fill-opacity="${wear.fade}"`);

  // Dirt specks and scratches, clipped to the sticker.
  let dirt = "";
  for (let i = 0; i < wear.grime; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 26;
    dirt += `<circle cx="${r2(c[0] + Math.cos(a) * r)}" cy="${r2(c[1] + Math.sin(a) * r)}" r="${r2(0.25 + rand() * 0.9)}" fill="#3a2e20" fill-opacity="${r2(0.1 + rand() * 0.25)}"/>`;
  }
  const scratchAngle = rand() * 180;
  for (let i = 0; i < wear.scratches; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 20;
    const x = c[0] + Math.cos(a) * r;
    const y = c[1] + Math.sin(a) * r;
    const ang = ((scratchAngle + (rand() - 0.5) * 50) * Math.PI) / 180;
    const len = 5 + rand() * 13;
    const dx = (Math.cos(ang) * len) / 2;
    const dy = (Math.sin(ang) * len) / 2;
    dirt += `<path d="M${r2(x - dx)} ${r2(y - dy)}Q${r2(x + dy * 0.15)} ${r2(y - dx * 0.15)} ${r2(x + dx)} ${r2(y + dy)}" stroke="#fff" stroke-opacity="${r2(0.45 + rand() * 0.35)}" stroke-width="${r2(0.45 + rand() * 0.6)}" fill="none" stroke-linecap="round"/>`;
  }
  if (dirt) face += `<g clip-path="url(#${id}sh)">${dirt}</g>`;

  // Folded corner: the part past the fold line is mirrored onto the sticker
  // and drawn as the white backing paper. A faint glue mark stays behind.
  let group = face;
  let foldR = Infinity;
  const foldAngle = (CATEGORIES[cat].fold * Math.PI) / 180;
  const dir = [Math.cos(foldAngle), Math.sin(foldAngle)];
  if (wear.fold) {
    const t = [-dir[1], dir[0]];
    const ext = Math.max(...pts.map((p) => (p[0] - c[0]) * dir[0] + (p[1] - c[1]) * dir[1])) + 4.25;
    foldR = ext - wear.fold;
    const P = [c[0] + dir[0] * foldR, c[1] + dir[1] * foldR];
    const L = 300;
    const side = (s) =>
      ptsToPath([
        [P[0] + t[0] * L, P[1] + t[1] * L],
        [P[0] - t[0] * L, P[1] - t[1] * L],
        [P[0] - t[0] * L + s * dir[0] * L, P[1] - t[1] * L + s * dir[1] * L],
        [P[0] + t[0] * L + s * dir[0] * L, P[1] + t[1] * L + s * dir[1] * L],
      ]);
    const th = (Math.atan2(t[1], t[0]) * 180) / Math.PI;
    const reflect = `translate(${r2(P[0])} ${r2(P[1])}) rotate(${r2(th)}) scale(1 -1) rotate(${r2(-th)}) translate(${r2(-P[0])} ${r2(-P[1])})`;
    const tip = [P[0] + dir[0] * wear.fold, P[1] + dir[1] * wear.fold];
    defs +=
      `<clipPath id="${id}kp"><path d="${side(-1)}"/></clipPath><clipPath id="${id}bz"><path d="${side(1)}"/></clipPath>` +
      `<linearGradient id="${id}bk" gradientUnits="userSpaceOnUse" x1="${r2(P[0])}" y1="${r2(P[1])}" x2="${r2(tip[0])}" y2="${r2(tip[1])}"><stop offset="0" stop-color="#b9b2a2"/><stop offset=".35" stop-color="#e6e0d3"/><stop offset="1" stop-color="#fbf8f1"/></linearGradient>`;
    const flap = (a) => `<g transform="${reflect}"><g clip-path="url(#${id}bz)">${path(a)}</g></g>`;
    group =
      `<g clip-path="url(#${id}bz)">${path(`fill="#8a8070" fill-opacity=".09" stroke="#8a8070" stroke-opacity=".09" stroke-width="8.5" stroke-linejoin="round"`)}</g>` +
      `<g clip-path="url(#${id}kp)">${face}</g>` +
      `<g transform="translate(1.3 1.9)">${flap(`fill="#000" fill-opacity=".3" stroke="#000" stroke-opacity=".3" stroke-width="8.5" stroke-linejoin="round"`)}</g>` +
      flap(`fill="url(#${id}bk)" stroke="${ink}" stroke-width="8.5" stroke-linejoin="round"`) +
      flap(`fill="url(#${id}bk)" stroke="url(#${id}bk)" stroke-width="6" stroke-linejoin="round"`);
  }

  // Chipped edge: small bites out of the border, away from the fold.
  if (wear.nicks) {
    const candidates = pts.filter((p) => (p[0] - c[0]) * dir[0] + (p[1] - c[1]) * dir[1] < foldR - 3);
    let holes = "";
    for (let i = 0; i < wear.nicks && candidates.length; i++) {
      const p = candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
      const vx = p[0] - c[0];
      const vy = p[1] - c[1];
      const n = Math.hypot(vx, vy) || 1;
      holes += `<circle cx="${r2(p[0] + (vx / n) * 4)}" cy="${r2(p[1] + (vy / n) * 4)}" r="${r2(1.5 + rand() * 1.4)}" fill="#000"/>`;
    }
    defs += `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-40" y="-40" width="150" height="150"><rect x="-40" y="-40" width="150" height="150" fill="#fff"/>${holes}</mask>`;
    group = `<g mask="url(#${id}m)">${group}</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72" width="72" height="72">` +
    (fin.sheen ? SHEEN_STYLE : "") +
    `<defs>${defs}</defs><g transform="rotate(${CATEGORIES[cat].tilt} 32 32)">${group}</g></svg>\n`
  );
}

mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const cat of Object.keys(CATEGORIES)) {
  for (let tier = 1; tier <= 5; tier++) {
    writeFileSync(join(OUT_DIR, `${cat}_${tier}.svg`), badge(cat, tier));
    count++;
  }
}
console.log(`Wrote ${count} badges to ${OUT_DIR}`);
