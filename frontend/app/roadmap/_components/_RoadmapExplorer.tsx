"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { fetchRoadmap, updateRoadmapTask } from "../../../lib/api";
import { D1_LIMIT_HEADING, d1LimitMessage, isD1LimitError } from "../../../lib/d1-limit";
import {
  ROADMAP_MILESTONES,
  ROADMAP_STATUS_META,
  ROADMAP_STATUS_ORDER,
  milestonePhaseRange,
  percentOf,
  startedOf,
  withTaskStatus,
  type RoadmapData,
  type RoadmapStatus,
} from "../../../lib/roadmap";
import { ModUnlockDialog } from "./_ModUnlockDialog";
import { PhaseCard, StatusBar } from "./_PhaseCard";
import { RoadmapHeader } from "./_RoadmapHeader";

/**
 * The roadmap page's one client component.
 *
 * It fetches `GET /api/roadmap` on mount rather than rendering on the server,
 * because the page is also the editor: a moderator changes a status in place and
 * every count on the page has to move with it. Everything below the header is
 * the same data — the summary, the filters, the phase cards and their tasks are
 * all derived from one `RoadmapData`, so they cannot disagree.
 */

type Filter = "all" | RoadmapStatus;

/** Where the unlocked code lives for the rest of the tab, so a reload keeps it. */
const MOD_CODE_KEY = "theocompass_mod_code";

function Summary({
  data,
  filter,
  onFilterChange,
}: {
  data: RoadmapData;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}) {
  const { totals } = data;
  const byStatus = totals.byStatus;
  const live = byStatus.implemented_live;
  const started = startedOf(byStatus);

  const options: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: "All", count: totals.tasks },
    ...ROADMAP_STATUS_ORDER.map((status) => ({
      value: status,
      label: ROADMAP_STATUS_META[status].label,
      count: byStatus[status],
    })),
  ];

  return (
    <section aria-label="Roadmap summary" className="mt-6 border border-rule bg-paper-raised p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="meta">Implemented live</p>
          <p className="num mt-1 font-mono text-2xl font-semibold leading-none text-ink">
            {live}
            <span className="text-base text-ink-muted">/{totals.tasks}</span>
          </p>
        </div>
        <p className="text-2xs text-ink-muted">
          <span className="num font-mono font-semibold text-ink">{percentOf(live, totals.tasks)}%</span> of the
          plan shipped &middot;{" "}
          <span className="num font-mono font-semibold text-ink">{started}</span> started
        </p>
      </div>

      <StatusBar counts={byStatus} total={totals.tasks} className="mt-4" />

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {ROADMAP_STATUS_ORDER.map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROADMAP_STATUS_META[status].dot}`} aria-hidden="true" />
            <dt className="text-2xs text-ink-muted">{ROADMAP_STATUS_META[status].label}</dt>
            <dd className="num font-mono text-2xs font-semibold text-ink">{byStatus[status]}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-rule pt-3">
        {options.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(option.value)}
              className={`flex items-center gap-1.5 border px-2 py-1 text-3xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "border-cerulean-900 bg-cerulean-900 text-paper"
                  : "border-rule text-ink-soft hover:bg-muted-soft hover:text-ink"
              }`}
            >
              {option.value !== "all" && (
                <span
                  className={`h-1 w-1 shrink-0 rounded-full ${ROADMAP_STATUS_META[option.value].dot}`}
                  aria-hidden="true"
                />
              )}
              {option.label}
              <span
                className={`num font-mono font-semibold ${active ? "text-paper/70" : "text-ink-muted"}`}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function RoadmapExplorer() {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * A heading and a body rather than one string: the free-tier quota outage is
   * a whole-site pause, not a broken roadmap, and it deserves to say so.
   */
  const [error, setError] = useState<{ heading: string; message: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [modCode, setModCode] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchRoadmap());
    } catch (err) {
      // The API already turned a depleted allowance into a D1LimitError; saying
      // "could not load the roadmap" would blame the wrong thing entirely.
      setError(
        isD1LimitError(err)
          ? { heading: D1_LIMIT_HEADING, message: d1LimitMessage(err) }
          : {
              heading: "Could not load the roadmap",
              message: err instanceof Error ? err.message : "Could not load the roadmap.",
            }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // sessionStorage, not localStorage: the code survives a reload but not the tab.
  // It is a speed bump for shared statuses, so it is not worth keeping longer.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(MOD_CODE_KEY);
      if (stored) setModCode(stored);
    } catch {
      /* private mode / storage disabled — editing stays locked */
    }
  }, []);

  const lock = useCallback(() => {
    setModCode(null);
    setNotice(null);
    try {
      window.sessionStorage.removeItem(MOD_CODE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }, []);

  const applyCode = useCallback((code: string) => {
    setModCode(code);
    setNotice(null);
    try {
      window.sessionStorage.setItem(MOD_CODE_KEY, code);
    } catch {
      /* the in-memory code still works for this page view */
    }
  }, []);

  const changeStatus = async (taskId: string, status: RoadmapStatus) => {
    if (!data || !modCode) return;

    const previous = data;
    setData(withTaskStatus(data, taskId, status));
    setSavingId(taskId);
    setNotice(null);

    try {
      await updateRoadmapTask(taskId, status, modCode);
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "Could not save that change.";
      setNotice(message);
      if (message.includes("no longer accepted")) lock();
    } finally {
      setSavingId(null);
    }
  };

  const visiblePhases = data
    ? data.phases.filter((phase) =>
        filter === "all"
          ? phase.tasks.length > 0
          : phase.tasks.some((task) => task.status === filter)
      )
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <RoadmapHeader
        unlocked={Boolean(modCode)}
        onLock={lock}
        onUnlock={() => setUnlockOpen(true)}
      />

      <main
        id="main-content"
        className="mx-auto w-full max-w-[64rem] flex-1 px-5 pb-16 pt-8 md:px-8 md:pt-10"
      >
        <p className="meta">Build plan</p>
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-ink md:text-4xl">
          The full roadmap
        </h1>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-soft md:text-base">
          {data
            ? `${data.totals.tasks} tasks across ${data.phases.length} phases, in build order. `
            : ""}
          The landing page shows the three milestones — Beta, Official launch and
          Extensions; this is the whole plan, phase by phase, with the status of every
          task — including the ones that are months away.
        </p>

        {loading && (
          <p className="mt-8 text-sm text-ink-muted" role="status">
            Loading the roadmap…
          </p>
        )}

        {error && !loading && (
          <div className="mt-6 border border-punch-500/40 bg-punch-50 p-4">
            <p className="flex items-center gap-2 text-mini font-semibold text-punch-ink">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              {error.heading}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-soft">{error.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 flex items-center gap-1.5 border border-rule-strong bg-paper-raised px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
              Try again
            </button>
          </div>
        )}
        {data && (
          <>
            <Summary data={data} filter={filter} onFilterChange={setFilter} />

            {notice && (
              <p
                role="alert"
                className="mt-4 border border-punch-500/40 bg-punch-50 px-3 py-2 text-2xs leading-snug text-punch-ink"
              >
                {notice} The list has been put back the way it was.
              </p>
            )}

            <div className="mt-6 space-y-8">
              {ROADMAP_MILESTONES.map((milestone) => {
                const cards = visiblePhases.filter((phase) =>
                  milestone.phases.includes(phase.index)
                );
                if (cards.length === 0) return null;

                return (
                  <section key={milestone.key} aria-label={milestone.label}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule pb-2">
                      <h2 className="font-serif text-xl font-bold text-ink">{milestone.label}</h2>
                      <span className="meta">{milestonePhaseRange(milestone)}</span>
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">
                      {milestone.blurb}
                    </p>
                    <div className="mt-4 space-y-4">
                      {cards.map((phase) => (
                        <PhaseCard
                          key={phase.index}
                          phase={phase}
                          filter={filter}
                          editable={Boolean(modCode)}
                          savingId={savingId}
                          onChange={changeStatus}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {visiblePhases.length === 0 && (
              <div className="mt-6 border border-rule bg-paper-raised p-4">
                <p className="text-mini text-ink-soft">Nothing matches that filter right now.</p>
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="mt-2 text-2xs font-semibold text-cerulean-900 underline decoration-cerulean-300 underline-offset-2 hover:decoration-cerulean-900"
                >
                  Show every task
                </button>
              </div>
            )}

            <p className="mt-8 border-t border-rule pt-4 text-3xs leading-relaxed text-ink-muted">
              Statuses are maintained by hand as work lands. Found something that has shipped
              and is still marked as planned?{" "}
              <a
                href="mailto:theocompass.project@gmail.com"
                className="underline decoration-rule-strong underline-offset-2 hover:text-ink"
              >
                Send a correction
              </a>
              .
            </p>
          </>
        )}
      </main>

      <ModUnlockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={applyCode}
      />
    </div>
  );
}
