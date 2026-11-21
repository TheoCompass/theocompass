// --- CHART CONFIGURATION ---
// One entry per axis, and the only place the pole vocabulary is written down.
//
// `desc` is the plain-language topic, now printed on every fingerprint row.
// `hints` are the two-to-five word answer to "what does that word mean here",
// printed under each pole label so nobody has to open anything: "Orthodox" on
// these rails means doctrine settled by the creeds, not Eastern Orthodoxy.
// `poles` are the full sentences behind those hints, shown when a row is opened.
// Both are optional so the chart, the helpers and the export card keep compiling
// against the same map, with or without them.
export const AXIS_LABELS: Record<
  string,
  {
    left: string;
    right: string;
    desc: string;
    hints?: { left: string; right: string };
    poles?: { left: string; right: string };
    meta?: boolean;
    invert?: boolean;
  }
> = {
  theolconslib: {
    left: "Progressive",
    right: "Orthodox",
    desc: "How scripture and doctrine are treated",
    hints: { left: "doctrine can be revised", right: "creeds are settled authority" },
    poles: {
      left: "Scripture is read alongside modern scholarship and experience, and doctrine may be revised in light of them.",
      right: "Scripture and the historic creeds are received as settled authority; doctrine is preserved, not rewritten.",
    },
  },
  socialconslib: {
    left: "Liberal",
    right: "Conservative",
    desc: "Stance on ethics, gender, and society",
    hints: { left: "justice and inclusion", right: "traditional family norms" },
    poles: {
      left: "Ethics centre on justice, inclusion, and personal autonomy.",
      right: "Ethics centre on traditional sexual and family norms, treated as binding teaching.",
    },
  },
  counterpromodern: {
    left: "Accommodating",
    right: "Counter-Cultural",
    desc: "Relationship to secular culture",
    hints: { left: "adapt to the culture", right: "resist the culture" },
    poles: {
      left: "The church should restate its faith in the culture's language and forms.",
      right: "The church should stand against secular culture's assumptions rather than adapt to them.",
    },
  },
  supernat: {
    left: "Naturalistic",
    right: "Supernatural",
    desc: "Expectation of miracles and spiritual forces",
    hints: { left: "ordinary natural processes", right: "miracles expected today" },
    poles: {
      left: "God works through ordinary natural processes; miracle accounts are read as symbol or history.",
      right: "Miracles, healing, and spiritual forces are expected to be active today.",
    },
  },
  cultsepeng: {
    left: "Engaged",
    right: "Separatist",
    desc: "Approach to worldly institutions and politics",
    hints: { left: "work inside institutions", right: "keep your distance" },
    poles: {
      left: "Christians should work inside political and social institutions to shape them.",
      right: "Christians should keep their distance from worldly institutions, politics included.",
    },
  },
  clericegal: {
    left: "Congregational",
    right: "Hierarchical",
    desc: "Where church authority sits",
    hints: { left: "the local church decides", right: "bishops in a chain" },
    poles: {
      left: "Final authority sits with the congregation or the individual believer.",
      right: "Authority flows through an ordered chain of bishops or elders.",
    },
  },
  divhumagency: {
    left: "Human Agency",
    right: "Divine Sovereignty",
    desc: "Who decides salvation",
    hints: { left: "your response decides", right: "God's choice decides" },
    poles: {
      left: "Grace can be resisted; the person's response decides whether salvation takes effect.",
      right: "God's choice is decisive; salvation is God's work from start to finish.",
    },
  },
  communindiv: {
    left: "Individualist",
    right: "Communitarian",
    desc: "Focus of faith and church life",
    hints: { left: "personal relationship", right: "shaped by the church" },
    poles: {
      left: "Faith is primarily the individual's own relationship with God.",
      right: "Faith is lived in a covenant community that shapes the believer.",
    },
  },
  liturgspont: {
    left: "Spontaneous",
    right: "Liturgical",
    desc: "Style and structure of worship",
    hints: { left: "informal, Spirit-led", right: "fixed historic order" },
    poles: {
      left: "Worship is informal and led in the moment, with little fixed order.",
      right: "Worship follows a fixed historic order, set prayers, and a calendar.",
    },
  },
  sacramfunct: {
    left: "Functional/Symbolic",
    right: "Sacramental",
    desc: "What Baptism and Communion do",
    hints: { left: "signs of grace", right: "conveys the grace" },
    poles: {
      left: "Baptism and Communion are signs of a grace received elsewhere.",
      right: "Baptism and Communion convey the grace they signify.",
    },
  },
  literalcrit: {
    left: "Critical",
    right: "Literal",
    desc: "How the Bible is read",
    hints: { left: "genre and history matter", right: "plainly factual" },
    poles: {
      left: "Scripture is read with attention to genre, historical setting, and its human authors.",
      right: "Scripture's factual claims are read as plainly true as written.",
    },
  },
  intellectexper: {
    left: "Experiential",
    right: "Intellectual",
    desc: "How God is known",
    hints: { left: "encounter and feeling", right: "doctrine and study" },
    poles: {
      left: "God is known primarily through experience, feeling, and encounter.",
      right: "God is known primarily through doctrine, study, and reasoned teaching.",
    },
  },
  // Meta-axes: how a belief is held, not what is believed.
  tolerance: {
    left: "Accepting",
    right: "Dogmatic",
    desc: "Openness to other Christian traditions",
    hints: { left: "other views are valid", right: "only this view is faithful" },
    poles: {
      left: "Other Christian traditions are valid expressions of the faith.",
      right: "Only this tradition's position is the faithful one.",
    },
    meta: true,
  },
  // Every other axis stores its affirmative pole as a LOW value, which renders on
  // the RIGHT. Certainty is the inverse: 100 = maximally certain. `invert` keeps
  // "Certain" on the right (and the dot with it) without changing the API contract.
  // It governs the printed sign too: `axisPosition` (in _helpers) turns position
  // into -100 (left pole) .. +100 (right pole), so both kinds of axis read the
  // same way and a "80" can no longer mean either end.
  certainty: {
    left: "Unsure",
    right: "Certain",
    desc: "How firmly you hold your beliefs",
    hints: { left: "held provisionally", right: "held firmly" },
    poles: {
      left: "Your answers are held provisionally, open to being wrong.",
      right: "Your answers are held with confidence.",
    },
    meta: true,
    invert: true,
  },
};

// --- FINGERPRINT CATEGORY GROUPING ---
// 14 axes total: Theology 4 + Practice 3 + Posture 5 + Conviction 2.
export const FINGERPRINT_CATEGORIES: Record<
  string,
  { axes: string[]; label: string; desc: string }
> = {
  Theology: {
    axes: ["theolconslib", "supernat", "literalcrit", "divhumagency"] as string[],
    label: "Theology",
    desc: "Core beliefs about God, scripture, and salvation",
  },
  Practice: {
    axes: ["liturgspont", "sacramfunct", "intellectexper"] as string[],
    label: "Practice",
    desc: "Worship style, sacraments, and spiritual life",
  },
  Posture: {
    axes: ["socialconslib", "counterpromodern", "cultsepeng", "clericegal", "communindiv"] as string[],
    label: "Posture",
    desc: "Social ethics, culture, and church governance",
  },
  Conviction: {
    axes: ["tolerance", "certainty"] as string[],
    label: "Conviction",
    desc: "How beliefs are held: openness to others, and confidence in one's own",
  },
};

// The only place the axis total is written down. The landing page, its SEO
// description and the roadmap all said "13" long after the certainty axis
// landed, because each of them typed the number by hand and nothing tied it to
// the list above. Derived, so adding an axis moves every sentence with it.
export const FINGERPRINT_AXIS_COUNT = Object.values(FINGERPRINT_CATEGORIES).reduce(
  (total, category) => total + category.axes.length,
  0,
);

// --- QUIZ CATEGORY LABELS ---
export const QUIZ_CATEGORY_LABELS: Record<string, string> = {
  GOD: "The Nature of God, Christ, & the Holy Spirit",
  CHR: "The Church: Its Nature and Structure",
  SCR: "Scripture and Authority",
  SAL: "Humanity, Sin, and Salvation",
  SAC: "Sacraments and Rites",
  WOR: "Worship and Spiritual Life",
  ESC: "The Last Things (Eschatology)",
  ETH: "Christian Ethics and Life in the World",
  MET: "Overarching Theological Approaches",
  GEN: "General",
};

/**
 * The one- or two-word form, for anywhere a full title would not fit: the
 * accordion headers, the filter chips and the belief chips themselves.
 *
 * Lives beside `QUIZ_CATEGORY_LABELS` rather than in the label cloud because the
 * exported report needs the same words — the same reason `TIER_LABELS` sits here
 * instead of being copied into each surface that prints it.
 */
export const QUIZ_CATEGORY_SHORT_LABELS: Record<string, string> = {
  GOD: "God & Christ",
  CHR: "Church",
  SCR: "Scripture",
  SAL: "Salvation",
  SAC: "Sacraments",
  WOR: "Worship",
  ESC: "Eschatology",
  ETH: "Ethics",
  MET: "Approaches",
  GEN: "General",
};

export const QUIZ_CATEGORY_COLORS: Record<
  string,
  { text: string; dot: string; border: string; bg: string; badge: string }
> = {
  // Nine muted earth tones from the shared `--color-cat-*` ramp. Desaturated on
  // purpose: sections stay distinguishable without turning the page into a
  // rainbow (the single strongest "generated by an LLM" tell in the old build).
  GOD: { text: "text-cat-god", dot: "bg-cat-god", border: "border-l-cat-god", bg: "bg-cat-god/8", badge: "bg-cat-god/12 text-cat-god" },
  CHR: { text: "text-cat-chr", dot: "bg-cat-chr", border: "border-l-cat-chr", bg: "bg-cat-chr/8", badge: "bg-cat-chr/12 text-cat-chr" },
  SCR: { text: "text-cat-scr", dot: "bg-cat-scr", border: "border-l-cat-scr", bg: "bg-cat-scr/8", badge: "bg-cat-scr/12 text-cat-scr" },
  SAL: { text: "text-cat-sal", dot: "bg-cat-sal", border: "border-l-cat-sal", bg: "bg-cat-sal/8", badge: "bg-cat-sal/12 text-cat-sal" },
  SAC: { text: "text-cat-sac", dot: "bg-cat-sac", border: "border-l-cat-sac", bg: "bg-cat-sac/8", badge: "bg-cat-sac/12 text-cat-sac" },
  WOR: { text: "text-cat-wor", dot: "bg-cat-wor", border: "border-l-cat-wor", bg: "bg-cat-wor/8", badge: "bg-cat-wor/12 text-cat-wor" },
  ESC: { text: "text-cat-esc", dot: "bg-cat-esc", border: "border-l-cat-esc", bg: "bg-cat-esc/8", badge: "bg-cat-esc/12 text-cat-esc" },
  ETH: { text: "text-cat-eth", dot: "bg-cat-eth", border: "border-l-cat-eth", bg: "bg-cat-eth/8", badge: "bg-cat-eth/12 text-cat-eth" },
  MET: { text: "text-cat-met", dot: "bg-cat-met", border: "border-l-cat-met", bg: "bg-cat-met/8", badge: "bg-cat-met/12 text-cat-met" },
};

export const QUIZ_CATEGORY_COLORS_DEFAULT: {
  text: string;
  dot: string;
  border: string;
  bg: string;
  badge: string;
} = {
  text: "text-ink-muted",
  dot: "bg-ink-muted",
  border: "border-l-rule-strong",
  bg: "bg-paper",
  badge: "bg-muted-soft text-ink-muted",
};


// Certainty slider labels
export const CERTAINTY_LABELS = ["Not Sure", "Leaning", "Pretty Sure", "Certain"];

// --- ESSENTIALITY TIERS (labels view + export card) ---
// One vocabulary, imported by every surface that names a tier. It used to be
// copied into the label cloud, the export card and this file, so a wording fix
// in one place silently left the others wrong.
export const TIER_LABELS = [
  "Core Dogma",
  "Primary",
  "Secondary",
  "Tertiary",
  "Non-Essential",
] as const;

export const TIER_DESCRIPTIONS = [
  "Non-negotiable beliefs central to Christian orthodoxy",
  "Doctrines that define theological traditions",
  "Important beliefs that distinguish denominations",
  "Positions debated within denominations",
  "Matters of personal conviction or preference",
] as const;

// --- TIER WEIGHT (labels view + export card) ---
// How loudly a tier's card is allowed to frame itself. Five steps of importance
// get three steps of weight, because readers reliably rank about three levels of
// any visual ordering; asking a numeral to carry five turns them into a puzzle.
// (The ground does carry five - see `TIER_PLATE` below, and why a tint may.)
//
// The weight lives on the CONTAINER, never on the chip. A chip already spends
// three channels - topic (hue border + word), certainty (ticks) and, outside its
// own card, tier (word) - and it sits around 24px tall. The frame is the one
// place left that can say "this group matters more" at no cost to the belief's
// own legibility, and it says it the way an edited page has always said it: a
// rule down the margin.
//
// Two channels carry the same three steps so that neither has to be read
// precisely: the rail (4px ink -> 2px ink-soft -> nothing, where the card's own
// hairline is the third step) and the numeral block (filled 11px -> filled 10px
// -> outlined 10px). That block is pinned to one height in `_TierNumeral` and
// every variant carries a 1px border, so the three hold identical vertical
// metrics - an outline or a fill that changed the box would nudge the header of
// every card at that weight and break the rhythm the rail is meant to create.
// The outlined numeral is filled with `transparent`, not `bg-paper`: the card
// ground is the blue plate, so a honeydew block would read as a hole on the
// palest card and as a bright patch on the darkest.
//
// Motion was considered for this job first, and rejected on four grounds. It
// cannot be ordinal - nothing makes 0.35s read as "more essential" than 0.55s,
// only as "different". It cannot be compared - the reader must watch two chips
// at different moments, and the first has finished before the second starts,
// while a rail is compared in a glance. It does not survive the export: the
// report is rasterised by html2canvas at whatever frame it catches. And the
// global `prefers-reduced-motion` guard in globals.css deletes it outright,
// taking the encoding away from exactly the readers who need the redundancy.
// A rail and a numeral fail none of those four tests, so the only motion left
// near these chips is the hover lift, which encodes nothing.
const TIER_WEIGHT_STRONG = {
  rail: "border-l-4 border-l-ink",
  numeral: "border-ink bg-ink text-2xs text-paper",
};
const TIER_WEIGHT_NEUTRAL = {
  rail: "border-l-2 border-l-ink-soft",
  numeral: "border-ink bg-ink text-3xs text-paper",
};
const TIER_WEIGHT_QUIET = {
  rail: "",
  numeral: "border-rule-strong bg-transparent text-3xs text-ink",
};

export type TierWeight = typeof TIER_WEIGHT_STRONG;

// Steps 1-2 (core, primary) and 4-5 (tertiary, non-essential) share a weight by
// design: the point is to make the two ENDS of the scale feel different from
// each other, not to make five fine distinctions nobody can hold.
const TIER_WEIGHT: Record<number, TierWeight> = {
  0: TIER_WEIGHT_STRONG,
  1: TIER_WEIGHT_STRONG,
  2: TIER_WEIGHT_NEUTRAL,
  3: TIER_WEIGHT_QUIET,
  4: TIER_WEIGHT_QUIET,
};

/**
 * Weight for a tier, with a fallback. A missing or out-of-range tolerance comes
 * from imported quiz data rather than from this app, and an unstyled numeral
 * block would be a silent hole in the frame - so it reads as neutral instead.
 */
export function tierWeight(tolerance: number | undefined): TierWeight {
  return (tolerance !== undefined && TIER_WEIGHT[tolerance]) || TIER_WEIGHT_NEUTRAL;
}

// --- TIER PLATE (the ground each card stands on) ---
// The one channel allowed five steps while the rail keeps three, because a
// ground is read differently from a mark. A rail or a numeral is compared until
// it has been ranked; a tint is only glanced at, and a reader who cannot tell
// plate-2 from plate-3 has lost nothing - the rail still says core / middle /
// preference in three, pointing the same way. Division of labour, not a second
// scale: five steps to feel, three steps to read.
//
// The ramp runs light to dark as the tier runs non-essential to core, i.e. more
// ink means more central, which is the same direction as the rail and the
// numeral. It is one blue mixed into white at 0 / 25 / 50 / 75 / 100%, so the
// ordering is in lightness only - 21.6 L* of span in four even steps, wide
// enough that five cards read as one scale rather than five panels: it survives
// greyscale, a photocopier and the html2canvas rasterisation of the report, and
// it never claims to be categorical. The pale end is paper white, so a
// non-essential card makes no claim at all. See the ramp note in globals.css for
// the measured floor and the header strip that ignores it.
//
// Keys are the tolerance value, values are the printed rank (`plate-1` is the
// `1/5` card) - they agree by construction, so the class can be read off the
// numeral without a second table.
const TIER_PLATE: Record<number, string> = {
  0: "bg-plate-1",
  1: "bg-plate-2",
  2: "bg-plate-3",
  3: "bg-plate-4",
  4: "bg-plate-5",
};

/**
 * Plate for a tier, with a fallback. A missing or out-of-range tolerance comes
 * from imported quiz data rather than from this app, and a ground is a claim
 * about rank - so unknown data takes `plate-5`, which is paper white: the one
 * step that claims nothing, rather than a guess at the middle.
 */
export function tierPlate(tolerance: number | undefined): string {
  return (tolerance !== undefined && TIER_PLATE[tolerance]) || "bg-plate-5";
}

// Tolerance slider labels.
// Step 2 is "one or a few", not "a few": tolerance is a stance (0-4), not a
// count of options, so accepting a single alternative that you do not hold
// already lands here. "A few" implied a floor of two and made the step up from
// "no fellowship" read as a bigger jump than the scale (and the engine) has.
export const TOLERANCE_LABELS = [
  "None Valid",
  "None Valid for Fellowship",
  "One or a Few Valid",
  "Most Valid",
  "All Valid",
];

// Compact tick labels — the full label is shown above the rail.
// The numeral is deliberate: the row gives each of the five stops ~54px at
// text-3xs on a 360px phone, where "One or a few" wraps to two lines and leaves
// stop 2 ragged beside "Most"/"All".
export const TOLERANCE_SHORT = ["None", "No fellowship", "1 or a few", "Most", "All"];

export const TOLERANCE_DESCRIPTIONS = [
  "No other option is valid; this is required for the Christian faith.",
  "No other option is valid for church fellowship, but some alternatives are still Christian.",
  "One or a few other options are valid, but require theological discernment.",
  "Most other options are valid, representing faithful in-house debate.",
  "Every other option is valid; this is purely personal preference.",
];

// --- MULTI-SELECT LIMIT ---
// Multi-select is opt-in per question, and deliberately narrow: it exists for
// positions a reader genuinely holds at once, not to let them tick everything.
// One number, because the question view (counter, cap styling) and the
// controller (the toggle guard) must never disagree. The Worker caps at 8 as a
// defence against junk payloads; three is the product rule.
export const MAX_MULTI_SELECT = 3;