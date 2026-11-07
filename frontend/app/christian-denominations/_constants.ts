// --- CHART CONFIGURATION ---
export const AXIS_LABELS: Record<string, { left: string; right: string; desc: string; meta?: boolean; invert?: boolean }> = {
  theolconslib: { left: "Progressive", right: "Orthodox", desc: "View of scripture, tradition, and orthodoxy" },
  socialconslib: { left: "Liberal", right: "Conservative", desc: "Stance on ethics, gender, and society" },
  counterpromodern: { left: "Accommodating", right: "Counter-Cultural", desc: "Relationship to secular culture" },
  supernat: { left: "Naturalistic", right: "Supernatural", desc: "Expectation of miracles and spiritual forces" },
  cultsepeng: { left: "Engaged", right: "Separatist", desc: "Approach to worldly institutions and politics" },
  clericegal: { left: "Egalitarian", right: "Hierarchical", desc: "Church governance and ordination" },
  divhumagency: { left: "Human Agency", right: "Divine Sovereignty", desc: "The mechanics of salvation (Arminian/Calvinist)" },
  communindiv: { left: "Individualist", right: "Communitarian", desc: "Focus of faith and church life" },
  liturgspont: { left: "Spontaneous", right: "Liturgical", desc: "Style and structure of worship" },
  sacramfunct: { left: "Functional/Symbolic", right: "Sacramental", desc: "Efficacy of Baptism and Communion" },
  literalcrit: { left: "Critical", right: "Literal", desc: "Method of reading the Bible" },
  intellectexper: { left: "Experiential", right: "Intellectual", desc: "Primary mode of knowing God" },
  // Meta-axes: how a belief is held, not what is believed.
  tolerance: { left: "Accepting", right: "Dogmatic", desc: "Openness to other Christian traditions as valid expressions of faith", meta: true },
  // Every other axis stores its affirmative pole as a LOW value, which renders on
  // the RIGHT. Certainty is the inverse: 100 = maximally certain. `invert` keeps
  // "Certain" on the right (and the dot with it) without changing the API contract.
  certainty: { left: "Unsure", right: "Certain", desc: "How firmly a tradition asserts its doctrinal positions", meta: true, invert: true },
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
};

export const QUIZ_CATEGORY_COLORS: Record<
  string,
  { text: string; dot: string; border: string; bg: string; badge: string }
> = {
  GOD: { text: "text-indigo-600", dot: "bg-indigo-400", border: "border-l-indigo-400", bg: "bg-indigo-50/40", badge: "bg-indigo-100 text-indigo-700" },
  CHR: { text: "text-emerald-600", dot: "bg-emerald-400", border: "border-l-emerald-400", bg: "bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700" },
  SCR: { text: "text-sky-600", dot: "bg-sky-400", border: "border-l-sky-400", bg: "bg-sky-50/40", badge: "bg-sky-100 text-sky-700" },
  SAL: { text: "text-rose-600", dot: "bg-rose-400", border: "border-l-rose-400", bg: "bg-rose-50/40", badge: "bg-rose-100 text-rose-700" },
  SAC: { text: "text-violet-600", dot: "bg-violet-400", border: "border-l-violet-400", bg: "bg-violet-50/40", badge: "bg-violet-100 text-violet-700" },
  WOR: { text: "text-teal-600", dot: "bg-teal-400", border: "border-l-teal-400", bg: "bg-teal-50/40", badge: "bg-teal-100 text-teal-700" },
  ESC: { text: "text-amber-600", dot: "bg-amber-400", border: "border-l-amber-400", bg: "bg-amber-50/40", badge: "bg-amber-100 text-amber-700" },
  ETH: { text: "text-fuchsia-600", dot: "bg-fuchsia-400", border: "border-l-fuchsia-400", bg: "bg-fuchsia-50/40", badge: "bg-fuchsia-100 text-fuchsia-700" },
  MET: { text: "text-cyan-600", dot: "bg-cyan-400", border: "border-l-cyan-400", bg: "bg-cyan-50/40", badge: "bg-cyan-100 text-cyan-700" },
};

export const QUIZ_CATEGORY_COLORS_DEFAULT: {
  text: string;
  dot: string;
  border: string;
  bg: string;
  badge: string;
} = {
  text: "text-blue-600",
  dot: "bg-blue-400",
  border: "border-l-blue-400",
  bg: "bg-blue-50/40",
  badge: "bg-blue-100 text-blue-700",
};

// Certainty slider labels
export const CERTAINTY_LABELS = ["Not Sure", "Leaning", "Pretty Sure", "Certain"];
export const CERTAINTY_TEXT_COLORS = ["text-slate-400", "text-sky-500", "text-blue-600", "text-brand-dark"];

// Tolerance slider labels
export const TOLERANCE_LABELS = [
  "None Valid",
  "None Valid for Fellowship",
  "A Few Valid",
  "Most Valid",
  "All Valid",
];

export const TOLERANCE_DESCRIPTIONS = [
  "No other option is valid; this is required for the Christian faith.",
  "No other option is valid for church fellowship, but some alternatives are still Christian.",
  "A few other options are valid, but require theological discernment.",
  "Most other options are valid, representing faithful in-house debate.",
  "Every other option is valid; this is purely personal preference.",
];