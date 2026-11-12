/**
 * The roadmap's shape and its four statuses, in one place.
 *
 * The API (`GET /api/roadmap`) returns these strings; everything that renders a
 * status — the chip, the dot, the progress bar, the filter — reads its label and
 * colours from here, so a fifth status would fail to compile instead of
 * rendering as an unstyled chip.
 *
 * The wording matches the spreadsheet exactly ("Not started", "In progress",
 * "Implemented locally", "Implemented Live"), because that sheet is what the
 * project is actually tracked against.
 */

export const ROADMAP_STATUS_ORDER = [
  "not_started",
  "in_progress",
  "implemented_local",
  "implemented_live",
] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUS_ORDER)[number];

export interface RoadmapTask {
  id: string;
  /** Phase.task as shown to a reader ("7.5"), not the sheet's numbering. */
  displayId: string;
  index: number;
  sheetId: string | null;
  name: string;
  description: string;
  type: string | null;
  /** Column E of the sheet: how to verify the task, e.g. "Test URL generation." */
  role: string | null;
  status: RoadmapStatus;
  updatedAt: string | null;
}

export interface RoadmapPhase {
  index: number;
  title: string;
  label: string;
  goal: string;
  counts: Record<RoadmapStatus, number>;
  tasks: RoadmapTask[];
}

export interface RoadmapData {
  totals: { tasks: number; byStatus: Record<RoadmapStatus, number> };
  phases: RoadmapPhase[];
}

export interface RoadmapStatusMeta {
  label: string;
  /** Chip (badge) classes. */
  chip: string;
  /** Small filled dot, used in the chip and the legend. */
  dot: string;
  /** Progress-bar segment. */
  bar: string;
}

export const ROADMAP_STATUS_META: Record<RoadmapStatus, RoadmapStatusMeta> = {
  not_started: {
    label: "Not started",
    chip: "bg-muted-soft text-ink-muted",
    dot: "bg-rule-strong",
    bar: "bg-rule-strong",
  },
  in_progress: {
    label: "In progress",
    chip: "bg-cerulean-50 text-cerulean-800",
    dot: "bg-cerulean-600",
    bar: "bg-cerulean-600",
  },
  implemented_local: {
    label: "Implemented locally",
    chip: "bg-sage-soft text-ink-soft",
    dot: "bg-sage",
    bar: "bg-sage",
  },
  implemented_live: {
    label: "Implemented live",
    chip: "bg-punch-50 text-punch-ink",
    dot: "bg-punch-ink",
    bar: "bg-punch-ink",
  },
};

/**
 * The plan's three headline milestones.
 *
 * The workbook has eight phases, and eight phases is the right unit for the
 * people building them and the wrong unit for anyone reading a landing page.
 * These three are how the project actually talks about itself — Beta (phase 0),
 * the main launch (phases 1-5) and the extensions (phases 6-7) — and both the
 * landing page and /roadmap group by them, so the two pages cannot drift apart
 * the way the landing page's old hand-written "Phase 3" did.
 *
 * `phases` holds indexes from `data/roadmap.csv`, not titles: renumbering or
 * inserting a phase there means updating this list, which is the point — one
 * place to look instead of two pages to reconcile.
 *
 * `highlights` is editorial, not fetched: the essentials of the milestone, not
 * its task list. The counts shown next to each milestone come from the API.
 */
export type MilestoneState = "live" | "next" | "later";

export interface RoadmapMilestone {
  key: string;
  /** Headline for the group. */
  label: string;
  /** One line saying what the milestone is for. */
  blurb: string;
  /** Phase indexes from the CSV, in build order. */
  phases: number[];
  state: MilestoneState;
  /** What is true for a user today, or what the milestone delivers. */
  highlights: string[];
  /** Work inside this milestone that has not landed yet, stated as such. */
  next?: string[];
}

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  live: "Live now",
  next: "Next",
  later: "Planned",
};

export const ROADMAP_MILESTONES: RoadmapMilestone[] = [
  {
    key: "beta",
    label: "Beta",
    blurb:
      "Open to everyone today: the quick quiz, scored across the whole database.",
    phases: [0],
    state: "live",
    highlights: [
      "30-question quiz",
      "230+ denominations",
      "30 denomination families",
      "14 axes, certainty included",
    ],
    next: [
      "Multiple choice answers, including “none of the above”",
      "Report an issue from inside a question",
    ],
  },
  {
    key: "launch",
    label: "Official launch",
    blurb:
      "The standard experience finished: a longer quiz, and a results layer that measures doctrine rather than resemblance.",
    phases: [1, 2, 3, 4, 5],
    state: "next",
    highlights: [
      "Standard Mode: 60 questions",
      "Creedal alignment and historical timelines",
      "The Museum, label glossary and methodology",
      "Accounts, saved results and progress over time",
      "Premium analytics: heatmaps, Venn, dendrogram",
    ],
  },
  {
    key: "extensions",
    label: "Extensions",
    blurb:
      "For students and the theologically obsessed: more depth, more confessions, more tools.",
    phases: [6, 7],
    state: "later",
    highlights: [
      "Deep Dive Mode: 125 questions",
      "More creeds and confessions scored, not only Nicene and Apostles’",
      "Steelman pages and a tier-list maker",
      "Side-by-side denomination comparison",
      "A rotatable 3D cube of theological space",
    ],
  },
];

/** "Phase 0" or "Phases 1–5" — the ranges differ per milestone, so say them. */
export function milestonePhaseRange(milestone: RoadmapMilestone): string {
  const phases = [...milestone.phases].sort((a, b) => a - b);
  if (phases.length === 0) return "";
  if (phases.length === 1) return `Phase ${phases[0]}`;
  return `Phases ${phases[0]}–${phases[phases.length - 1]}`;
}

/** Everything except "not started" counts as started; "done" means live. */
export function startedOf(counts: Record<RoadmapStatus, number>): number {
  return counts.implemented_live + counts.implemented_local + counts.in_progress;
}

export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** "12 Mar 2026" — dates are only ever shown, never compared. */
export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function countStatuses(tasks: RoadmapTask[]): Record<RoadmapStatus, number> {
  const counts: Record<RoadmapStatus, number> = {
    not_started: 0,
    in_progress: 0,
    implemented_local: 0,
    implemented_live: 0,
  };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

/**
 * Applies a status change locally, before the write lands.
 *
 * A moderator changing five statuses should not watch five round trips to see
 * the numbers move, so the row, its phase bar and the overall bar update at
 * once; the caller rolls the whole object back if the PATCH fails.
 */
export function withTaskStatus(
  data: RoadmapData,
  taskId: string,
  status: RoadmapStatus
): RoadmapData {
  let changed = false;

  const phases = data.phases.map((phase) => {
    const index = phase.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return phase;

    const tasks = phase.tasks.map((task, i) => (i === index ? { ...task, status } : task));
    if (tasks[index].status === phase.tasks[index].status) return phase;

    changed = true;
    return { ...phase, tasks, counts: countStatuses(tasks) };
  });

  if (!changed) return data;

  return {
    totals: {
      tasks: data.totals.tasks,
      byStatus: countStatuses(phases.flatMap((phase) => phase.tasks)),
    },
    phases,
  };
}
