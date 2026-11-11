"use client";

import {
  ROADMAP_STATUS_META,
  ROADMAP_STATUS_ORDER,
  percentOf,
  startedOf,
  type RoadmapPhase,
  type RoadmapStatus,
} from "../../../lib/roadmap";
import { TaskRow } from "./_TaskRow";

/** A stacked bar of the four statuses, in status order, over a muted track. */
export function StatusBar({
  counts,
  total,
  className = "",
}: {
  counts: Record<RoadmapStatus, number>;
  total: number;
  className?: string;
}) {
  const summary = ROADMAP_STATUS_ORDER.map(
    (status) => `${counts[status]} ${ROADMAP_STATUS_META[status].label.toLowerCase()}`
  ).join(", ");

  return (
    <div
      className={`flex h-1.5 w-full overflow-hidden bg-muted-soft ${className}`}
      role="img"
      aria-label={summary}
    >
      {ROADMAP_STATUS_ORDER.map((status) =>
        counts[status] > 0 ? (
          <span
            key={status}
            className={ROADMAP_STATUS_META[status].bar}
            style={{ width: `${(counts[status] / Math.max(total, 1)) * 100}%` }}
          />
        ) : null
      )}
    </div>
  );
}

/**
 * One phase: a header with the goal, a progress bar, and its tasks.
 *
 * The filter is applied here rather than upstream so the phase's own totals
 * stay visible while a status filter is active — filtering to "In progress"
 * should not pretend the other nine tasks do not exist.
 */
export function PhaseCard({
  phase,
  filter,
  editable,
  savingId,
  onChange,
}: {
  phase: RoadmapPhase;
  filter: "all" | RoadmapStatus;
  editable: boolean;
  savingId: string | null;
  onChange: (taskId: string, status: RoadmapStatus) => void;
}) {
  const total = phase.tasks.length;
  const tasks = filter === "all" ? phase.tasks : phase.tasks.filter((task) => task.status === filter);
  if (tasks.length === 0) return null;

  const live = phase.counts.implemented_live;
  const started = startedOf(phase.counts);
  const done = percentOf(live, total);

  return (
    <section
      id={`phase-${phase.index}`}
      aria-labelledby={`phase-${phase.index}-heading`}
      className="border border-rule bg-paper-raised"
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-rule px-4 py-4 md:px-5">
        <span
          aria-hidden="true"
          className="num flex h-8 w-8 shrink-0 items-center justify-center border border-rule-strong font-mono text-mini font-semibold text-ink"
        >
          {phase.index}
        </span>

        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2
              id={`phase-${phase.index}-heading`}
              className="text-base font-bold leading-snug text-ink md:text-lg"
            >
              {phase.label}
            </h2>
            <span className="meta">{started} of {total} started</span>
          </div>
          {phase.goal && (
            <p className="mt-1 max-w-[62ch] text-2xs leading-relaxed text-ink-soft">{phase.goal}</p>
          )}
        </div>

        <div className="text-right">
          <p className="num font-mono text-sm font-semibold leading-none text-ink">
            {live}
            <span className="text-ink-muted">/{total}</span>
          </p>
          <p className="meta mt-1">live &middot; {done}%</p>
        </div>
      </header>

      <div className="px-4 py-4 md:px-5">
        <StatusBar counts={phase.counts} total={total} />

        <ul className="mt-3 divide-y divide-rule border-t border-rule">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              editable={editable}
              saving={savingId === task.id}
              onChange={(status) => onChange(task.id, status)}
            />
          ))}
        </ul>

        {filter !== "all" && tasks.length < total && (
          <p className="mt-3 text-3xs text-ink-muted">
            Showing {tasks.length} of {total} tasks in this phase.
          </p>
        )}
      </div>
    </section>
  );
}
