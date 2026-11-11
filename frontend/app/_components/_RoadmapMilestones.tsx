"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { fetchRoadmap } from "../../lib/api";
import {
  MILESTONE_STATE_LABEL,
  ROADMAP_MILESTONES,
  milestonePhaseRange,
  type MilestoneState,
  type RoadmapData,
  type RoadmapMilestone,
} from "../../lib/roadmap";

/**
 * The landing page's roadmap: three milestones, not eight phases.
 *
 * It replaced four hand-written "phases" that mapped to nothing in the real
 * plan - one of which promised creedal alignment under "Deep Dive" when the
 * spreadsheet schedules it for launch. The groups now come from
 * `ROADMAP_MILESTONES`, the same constant `/roadmap` groups by, so the two pages
 * cannot disagree again.
 *
 * The bullets are editorial on purpose: the essentials of each milestone, not
 * its task list. The one thing fetched is a count per milestone, and it renders
 * nothing if the request fails - the landing page never waits on the worker, and
 * never shows a number it cannot back up. Nothing here claims a future feature
 * is live: the beta card lists what exists today, and the beta's unfinished work
 * sits under its own "still in the beta" line.
 */

const MARKER: Record<MilestoneState, string> = {
  live: "border-punch-ink bg-paper text-punch-ink ring-2 ring-punch-500/25",
  next: "border-cerulean-600 bg-paper text-cerulean-800",
  later: "border-rule-strong bg-paper text-ink-muted",
};

const PILL: Record<MilestoneState, string> = {
  live: "bg-punch-ink text-paper",
  next: "bg-cerulean-50 text-cerulean-800",
  later: "bg-muted-soft text-ink-muted",
};

const BULLET: Record<MilestoneState, string> = {
  live: "bg-punch-ink/60",
  next: "bg-cerulean-600/60",
  later: "bg-rule-strong",
};

export function RoadmapMilestones() {
  const [data, setData] = useState<RoadmapData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRoadmap()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        /* the counts simply do not appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Per milestone: how many tasks exist, how many started, how many are live. */
  const countsFor = (phases: number[]) => {
    if (!data) return null;
    const tasks = data.phases
      .filter((phase) => phases.includes(phase.index))
      .flatMap((phase) => phase.tasks);
    if (tasks.length === 0) return null;
    let live = 0;
    let started = 0;
    for (const task of tasks) {
      if (task.status === "implemented_live") live += 1;
      if (task.status !== "not_started") started += 1;
    }
    return { tasks: tasks.length, started, live };
  };

  return (
    <section id="roadmap" className="w-full border-b border-rule bg-paper px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-serif text-2xl font-bold text-ink md:text-3xl">Roadmap</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft md:text-base">
          Beta first, then the full standard mode, then the deep end. The eight phases
          behind these three milestones are on the roadmap page, task by task.
        </p>

        <ol className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:mt-8 md:block md:overflow-visible md:px-0 md:pb-0">
          {ROADMAP_MILESTONES.map((milestone, index) => (
            <MilestoneItem
              key={milestone.key}
              milestone={milestone}
              index={index}
              counts={countsFor(milestone.phases)}
            />
          ))}
        </ol>

        <Link
          href="/roadmap"
          className="mt-6 flex w-full items-center justify-center gap-2 border border-cerulean-900 bg-cerulean-900 px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-cerulean-800 md:mt-4 md:inline-flex md:w-auto"
        >
          {data ? `See all ${data.totals.tasks} tasks` : "See the full roadmap"}
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}

interface MilestoneCounts {
  tasks: number;
  started: number;
  live: number;
}

/** One milestone: number, state, the essentials, and a count when we have one. */
function MilestoneItem({
  milestone,
  index,
  counts,
}: {
  milestone: RoadmapMilestone;
  index: number;
  counts: MilestoneCounts | null;
}) {
  const state = milestone.state;

  return (
    <li className="reveal-up relative w-[80%] shrink-0 snap-start border border-rule bg-paper-raised p-4 md:grid md:w-auto md:grid-cols-[1.75rem_1fr] md:gap-x-5 md:border-0 md:bg-transparent md:p-0 md:pb-9 md:last:pb-0">
      {/* Desktop rail: a numbered marker and a connector that keeps running
          between milestones, so the live stretch is visibly punch and the rest
          is rule. */}
      <div aria-hidden="true" className="hidden md:flex md:flex-col md:items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-2xs font-bold ${MARKER[state]}`}
        >
          {index + 1}
        </span>
        <span className={`mt-1 w-0.5 flex-1 ${state === "live" ? "bg-punch-ink/30" : "bg-rule"}`} />
      </div>

      <div className="md:pt-0.5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="meta">{milestonePhaseRange(milestone)}</span>
          <span
            className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${PILL[state]}`}
          >
            {state === "live" && (
              <span className="h-1 w-1 animate-pulse-slow rounded-full bg-paper" aria-hidden="true" />
            )}
            {MILESTONE_STATE_LABEL[state]}
          </span>
        </div>

        <h3 className="text-base font-bold text-ink md:text-lg">{milestone.label}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{milestone.blurb}</p>

        <ul className="mt-2 space-y-1 text-sm text-ink-muted">
          {milestone.highlights.map((highlight) => (
            <li key={highlight} className="flex gap-2">
              <span
                aria-hidden="true"
                className={`mt-[0.45rem] h-1 w-1 shrink-0 rounded-full ${BULLET[state]}`}
              />
              {highlight}
            </li>
          ))}
        </ul>

        {milestone.next && (
          <div className="mt-3 border-t border-dashed border-rule pt-2">
            <p className="meta">Still in the beta</p>
            <ul className="mt-1 space-y-1 text-2xs text-ink-muted">
              {milestone.next.map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-rule-strong"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {counts && (
          <p className="mt-3 text-3xs text-ink-muted">
            {counts.started === 0 ? (
              <>
                <span className="num font-mono font-semibold text-ink-soft">{counts.tasks}</span>{" "}
                tasks planned
              </>
            ) : (
              <>
                <span className="num font-mono font-semibold text-ink-soft">{counts.started}</span>{" "}
                of <span className="num font-mono font-semibold text-ink-soft">{counts.tasks}</span>{" "}
                tasks started
                {counts.live > 0 && (
                  <>
                    {" · "}
                    <span className="num font-mono font-semibold text-ink-soft">{counts.live}</span>{" "}
                    live
                  </>
                )}
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
