/**
 * The single source of colour for anything that cannot use a CSS variable:
 * recharts marks, canvas exports (html2canvas), and generated family palettes.
 *
 * These values mirror `app/globals.css` exactly. If you change one, change both.
 *
 * Contrast on Honeydew (#f1faee) — measured, not estimated:
 *   navy 11.6:1 · ink-soft 7.2:1 · ink-muted 5.2:1 · cerulean-ink 6.0:1
 *   punch-ink 5.9:1 · cerulean fill + white 4.6:1 · punch fill + white 4.2:1
 * The last two are fill-only colours: never set them as small text on paper.
 */

export const PALETTE = {
  punch: "#e63946",
  honeydew: "#f1faee",
  frosted: "#a8dadc",
  cerulean: "#457b9d",
  navy: "#1d3557",
} as const;

export const SURFACE = {
  paper: "#f1faee",
  raised: "#ffffff",
  muted: "#e6efec",
  rule: "#d7e3e0",
  ruleStrong: "#b6c9cb",
} as const;

export const INK = {
  base: "#1d3557",
  soft: "#3c5570",
  muted: "#556a7e",
} as const;

export const CERULEAN = {
  50: "#f2f8f7",
  100: "#e0eeed",
  200: "#c6e2e0",
  300: "#a8dadc",
  400: "#7fb3bd",
  500: "#5d95a8",
  600: "#457b9d",
  800: "#2c5175",
  900: "#1d3557",
} as const;

export const PUNCH = {
  50: "#fdeced",
  100: "#fad2d5",
  300: "#f08a92",
  500: "#e63946",
  700: "#c1121f",
  900: "#8c0d17",
} as const;

/* ─── Data ramps ─────────────────────────────────────────────────────────── */

/**
 * Match quality, best -> weakest.
 *
 * The five steps now differ in HUE as well as weight: red, green, blue, violet,
 * slate. Five shades of one blue forced everyone to read the numbers; the
 * legend could not be matched back to a row at a glance. Red stays reserved for
 * 90+, so the top step still reads as an event rather than a category.
 */
export const TIER_STEPS = [
  { min: 90, hex: PUNCH[500], label: "Near perfect", range: "90+" },
  { min: 75, hex: "#1f7a5f", label: "Strong", range: "75-89" },
  { min: 60, hex: CERULEAN[600], label: "Overlap", range: "60-74" },
  { min: 40, hex: "#7d5ba6", label: "Moderate", range: "40-59" },
  { min: 0, hex: INK.muted, label: "Light", range: "0-39" },
] as const;

/**
 * Conviction strength along an axis (neutral → extreme), used as bar/dot fill.
 *
 * These were four tints of one blue whose weakest step was #c6e2e0 drawn on a
 * #e0eeed track: about 1.1:1, i.e. a neutral axis looked empty, and moderate
 * and strong were hard to tell apart. The ramp now spans hue as well as
 * lightness - slate, teal, blue, deep navy - so every step clears 3:1 against
 * the track (neutral 3.4:1, extreme 11:1) and "strong" is visibly not
 * "extreme".
 */
export const CONVICTION_RAMP = [
  "#6f808f", /* neutral  */
  "#4f8fa0", /* moderate */
  "#2f5f9e", /* strong   */
  "#12324f", /* extreme  */
] as const;

/**
 * Index-aligned with `CONVICTION_RAMP`, and the same words
 * `getConvictionStyle` returns as `level`.
 *
 * The fingerprint export used to draw its legend from four `purple-*` classes
 * while the dots used this ramp: the key named colours that appeared nowhere on
 * the chart, in an order that did not match either. A legend that cannot be
 * matched back to the marks is worse than no legend, so it now reads the ramp.
 */
export const CONVICTION_LEVELS = ["Neutral", "Moderate", "Strong", "Extreme"] as const;

/* ─── Colour maths (for generated family palettes) ───────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Linear RGB mix. `t` = 0 returns `a`, `t` = 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Lighten toward Honeydew (keeps generated tints warm instead of grey). */
export function tintHex(hex: string, t: number): string {
  return mixHex(hex, SURFACE.raised, t);
}

/** Darken toward Oxford Navy (keeps generated shades cool and in-family). */
export function shadeHex(hex: string, t: number): string {
  return mixHex(hex, PALETTE.navy, t);
}

/**
 * Seven tradition clusters, seven rainbow hues.
 *
 * The compass previously ran on four hue families, so five of the seven
 * clusters were shades of the same blue and the legend was useless. These are
 * mid-tone pastels: distinct from each other at 4px dot size, quiet enough to
 * sit on Honeydew without turning the chart into a toy.
 */
export const GROUP_BASE: Record<string, string> = {
  Catholic: "#b56576",                        /* rose       */
  "Orthodox & High Church": "#8e7ab5",         /* violet     */
  "Magisterial Protestant": "#5b7fb5",         /* periwinkle */
  "Esoteric & Progressive": "#4f9d9b",         /* teal       */
  "Ancient, Dualist & Restorationist": "#6b9a58", /* green    */
  Charismatic: "#cf7a45",                      /* coral      */
  "Evangelical & Primitivist": "#c8963e",      /* ochre      */
};

export const FALLBACK_GROUP_BASE = "#556a7e";

/**
 * Quiz-section / belief-label hues. Mirrors `--color-cat-*` in globals.css.
 * Mark colours: they are used for dots and for chip fills tinted toward white,
 * never for small type.
 */
export const HUE_BASE: Record<string, string> = {
  GOD: "#5b7fb5",
  CHR: "#b56576",
  SCR: "#4f9d9b",
  SAL: "#8e7ab5",
  SAC: "#c8963e",
  WOR: "#6b9a58",
  ESC: "#7c5f9e",
  ETH: "#cf7a45",
  MET: "#556a7e",
  GEN: "#556a7e",
};

/**
 * Certainty 0-3, as words. The magnitude is a count of filled ticks, not a
 * tint (see `CERTAINTY_SLOTS` and `_CertaintyMeter`).
 *
 * Three attempts at encoding sureness with colour all failed the same way. A
 * per-section tint meant "certain" was green in Scripture and violet in
 * Worship, i.e. it carried nothing. Four near-white tints were one shape at
 * 11px. Four saturated fills (grey/yellow/orange/green) collided with the tier
 * border around them, so a chip read as "coloured rectangle" before it read as
 * "belief", and the reader still needed a nine-swatch legend.
 *
 * A count needs no legend: more filled means surer, and it reads the same at
 * 10px, in greyscale, and through any colour-vision deficiency.
 */
export const CERTAINTY_TEXT = ["Not Sure", "Leaning", "Pretty Sure", "Certain"] as const;

/**
 * Three slots, because there are four states (0-3) and the count IS the value.
 *
 * There used to be four, which made the top state unrepresentable: "Certain"
 * is 3, so the most confident answer anyone could give still left one slot
 * grey. The meter looked like it was missing a tick — or like it was quietly
 * telling the reader they were never quite certain. Three slots map 1:1
 * (none / one / two / three filled), so the fullest bar is reachable and the
 * empty one is honest about being empty.
 */
export const CERTAINTY_SLOTS = 3;

/**
 * The one colour a filled slot ever uses: the interaction cerulean, not the ink
 * the label is set in.
 *
 * Deliberately not a scale — every filled tick is this colour, so there is
 * nothing to rank. It is lighter than the ink (4.6:1 on white; a filled span is
 * a graphical object, not text) and far higher in chroma than the pale track it
 * sits on, which is what lets a filled slot read at 4px wide even though its
 * luminance is not far from the track's.
 */
export const CERTAINTY_MARK = CERULEAN[600];

/**
 * Essentiality 0-4 has no colour, and should not get one back.
 *
 * Four encodings failed in a row. Five hues had no perceptible order, so the
 * reader could only answer "how essential?" by memorising the legend. Four
 * saturated fills fought the border around them, so a chip read as a coloured
 * rectangle before it read as a belief. A monotone navy ramp was ordered by
 * construction but could not be *resolved*: at L* 20 / 33 / 49 / 58 / 72 the
 * steps sit 13 L* apart, which is a smudge, not a step, across a 3px tab — and
 * it still left "is Primary darker or lighter than Secondary?" needing a key.
 *
 * There was also nowhere left to put hue. The nine `cat-*` colours are the
 * panel's category scale and sit one row above the chips, so a second five-hue
 * scale would make the same teal mean "Scripture" in the accordion header and
 * "Secondary" on the chip beneath it.
 *
 * The tier is therefore a *word* (`TIER_LABELS`, printed on the chip) and its
 * place in the order is a *numeral* in the heading that owns the group
 * ("1/5 Core Dogma" … "5/5 Non-Essential"). Both are ordinal at zero cost, both
 * survive greyscale printing, and neither can be mistaken for a category.
 * Certainty keeps its filled-slot count — see `CERTAINTY_SLOTS`.
 */

/** Per-index variation inside a cluster: visible at dot size, never a new hue. */
const FAMILY_VARIATION = [0, -0.14, 0.12, -0.22, 0.2, 0.08];

/**
 * Deterministic colour for the n-th family of a cluster.
 * `group === null` is used for families that belong to no cluster.
 */
export function familyColor(group: string | null, index: number): string {
  const base = (group && GROUP_BASE[group]) || FALLBACK_GROUP_BASE;
  const amount = FAMILY_VARIATION[index % FAMILY_VARIATION.length];
  return amount < 0 ? shadeHex(base, -amount) : tintHex(base, amount);
}
