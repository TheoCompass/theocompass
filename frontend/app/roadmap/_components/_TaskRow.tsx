"use client";

import {
  ROADMAP_STATUS_META,
  ROADMAP_STATUS_ORDER,
  type RoadmapStatus,
  type RoadmapTask,
} from "../../../lib/roadmap";

/** The status as a chip: a coloured dot plus the sheet's own wording. */
export function StatusChip({ status }: { status: RoadmapStatus }) {
  const meta = ROADMAP_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${meta.chip}`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/**
 * One task.
 *
 * The sheet has four useful columns per task and one of them (the verification
 * note) reads as noise unless it is labelled, so the type becomes a small chip
 * and the check gets a "Verify" label. A reader scanning 62 rows needs the name
 * first and the status second; everything else is supporting detail.
 *
 * When a moderator is unlocked the chip is replaced by a select in the same
 * place, so the list does not reflow as editing is turned on and off.
 */
export function TaskRow({
  task,
  editable,
  saving,
  onChange,
}: {
  task: RoadmapTask;
  editable: boolean;
  saving: boolean;
  onChange: (status: RoadmapStatus) => void;
}) {
  return (
    <li
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 py-3 transition-opacity ${
        saving ? "opacity-60" : ""
      }`}
    >
      <span className="num mt-0.5 shrink-0 font-mono text-3xs text-ink-muted">{task.displayId}</span>

      <div className="min-w-[13rem] flex-1">
        <p className="text-mini font-semibold leading-snug text-ink">{task.name}</p>
        {task.description && (
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-soft">{task.description}</p>
        )}

        {(task.type || task.role) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {task.type && (
              <span className="meta border border-rule px-1.5 py-[0.05rem]">{task.type}</span>
            )}
            {task.role && (
              <span className="text-3xs leading-snug text-ink-muted">
                <span className="meta">Verify</span> {task.role}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto shrink-0">
        {editable ? (
          <label className="block">
            <span className="sr-only">Status of {task.name}</span>
            <select
              value={task.status}
              disabled={saving}
              onChange={(event) => onChange(event.target.value as RoadmapStatus)}
              className="num border border-rule-strong bg-paper-raised px-1.5 py-1 font-mono text-3xs uppercase tracking-[0.1em] text-ink transition-colors hover:bg-muted-soft disabled:cursor-wait"
            >
              {ROADMAP_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {ROADMAP_STATUS_META[status].label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <StatusChip status={task.status} />
        )}
      </div>
    </li>
  );
}
