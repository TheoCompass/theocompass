"use client";

import { useMemo } from "react";
import { CERTAINTY_TEXT, categoryTints } from "../../../lib/palette";
import { QUIZ_CATEGORY_SHORT_LABELS, TIER_DESCRIPTIONS, TIER_LABELS, tierPlate, tierWeight } from "../_constants";
import { modeLabel } from "../_helpers";
import { labelText, uniqueLabels, type Label } from "../TheologicalLabelCloud";
import { CertaintyMeter } from "./_CertaintyMeter";
import ExportFrame from "./_ExportFrame";
import { TierNumeral } from "./_TierNumeral";

/**
 * The quiz stores a label either as a bare object or wrapped one level down in
 * `{ label: {...} }`, and this export is the only place that has to accept
 * both. One small union beats `any[]` at a module boundary.
 */
type RawLabel = Omit<Partial<Label>, "label"> & {
  label?: string | Partial<Label>;
};



export default function ExportLabelsCard({
  userLabels,
  selectedMode,
  questionCount,
  onRef,
}: {
  userLabels: RawLabel[];
  selectedMode: "quick" | "standard" | "deep" | null;
  questionCount: number;
  onRef: (el: HTMLDivElement | null) => void;
}) {
  // Parse the two payload shapes into real labels first, then hand the
  // deduplication to the same helper the on-screen cloud uses, so this report
  // and the page can never disagree about how many beliefs the reader has. The
  // helper keeps the answer the reader was most sure of, which is the one whose
  // description belongs in the report.
  const labels = useMemo(() => {
    if (!userLabels || userLabels.length === 0) return [] as Label[];

    const parsed: Label[] = [];
    for (const raw of userLabels) {
      const wrapped = typeof raw.label === "object" ? raw.label : null;
      const labelKey = typeof raw.label === "string" ? raw.label : wrapped?.label;
      if (!labelKey) continue;
      parsed.push({
        label: labelKey,
        category: wrapped?.category ?? raw.category ?? "GEN",
        certainty: wrapped?.certainty ?? raw.certainty ?? 0,
        tolerance: wrapped?.tolerance ?? raw.tolerance ?? 2,
        questionId: wrapped?.questionId ?? raw.questionId ?? "",
        desc: wrapped?.desc ?? raw.desc,
      });
    }

    return uniqueLabels(parsed).sort(
      (a, b) => b.certainty - a.certainty || labelText(a).localeCompare(labelText(b))
    );
  }, [userLabels]);

  // Group by tolerance tier
  const groups = useMemo(() => {
    const tiered: Label[][] = [[], [], [], [], []];
    for (const l of labels) {
      const t = Math.min(4, Math.max(0, l.tolerance ?? 2));
      tiered[t].push(l);
    }
    return tiered.map((items, i) => ({
      tolerance: i,
      title: TIER_LABELS[i],
      items: items.sort((a, b) => b.certainty - a.certainty || labelText(a).localeCompare(labelText(b))),
    }));
  }, [labels]);

  const now = new Date();
  const timestamp = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <ExportFrame
      ref={onRef}
      artefact="Theological Identity Report"
      modeLabel={modeLabel(selectedMode)}
      questionCount={questionCount}
      timestamp={timestamp}
    >
      {/* ─── HERO ─── */}
      <div className="chart-grid border-b border-rule bg-paper-raised px-10 py-8 text-center">
        <p className="meta">Your theological labels</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          One line per conviction your answers carried, grouped by dogmatic weight from
          core doctrine to personal preference.
        </p>
        <p className="mx-auto mt-1 max-w-xl text-2xs text-ink-muted">
          Each line is outlined in its topic&apos;s colour and names that topic, so the
          grouping survives a greyscale photocopy.
        </p>

        <div className="mt-4 inline-flex items-baseline gap-2 border border-rule px-4 py-1.5">
          <span className="num font-mono text-2xl font-bold leading-none text-ink">
            {labels.length}
          </span>
          <span className="meta">{labels.length === 1 ? "label" : "labels"}</span>
        </div>
      </div>

      {/* ─── TIER SUMMARY ─── */}
      <div className="bg-paper-raised border-b border-rule px-10 py-5">
        <div className="space-y-1.5">
          {groups.map((g) => {
            const pct = labels.length > 0 ? Math.round((g.items.length / labels.length) * 100) : 0;
            return (
              <div key={g.tolerance} className="flex items-center gap-2">
                <span className="num w-7 shrink-0 font-mono text-3xs text-ink-muted">
                  {g.tolerance + 1}/5
                </span>
                <span className="w-32 shrink-0 text-xs font-bold text-ink">{g.title}</span>
                <div className="h-2 flex-1 bg-muted-soft">
                  <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                </div>
                <span className="num w-6 shrink-0 text-right font-mono text-3xs text-ink-muted">
                  {g.items.length}
                </span>
                <span className="num w-8 shrink-0 text-right font-mono text-3xs text-ink-muted">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── LABELS BY TIER ─── */}
      <div className="bg-paper-raised border-b border-rule px-8 py-8">
        <div className="space-y-3">
          {groups.filter((group) => group.items.length > 0).map((group) => (
            <div
              key={group.tolerance}
              className={`overflow-hidden border border-rule ${tierPlate(group.tolerance)} ${tierWeight(group.tolerance).rail}`}
            >
              {/* Tier header — its place in the scale, its name, its meaning.
                  Same rail, numeral and graded plate as the app: this is the
                  surface a reader prints, so it is the one that most needs the
                  rank to survive without colour - which is also why the ground
                  ranks here and not just the rail, since a tinted card still
                  separates from its neighbours on a bad photocopier, and the
                  ramp ends on white rather than on a pale tint so the `5/5`
                  card costs its whole ground to the printer. The strip is a
                  75% white veil over that ground (see globals.css), not a
                  colour of its own, so it stays lighter than the body and
                  holds the 11px line above AA on every step of the ramp. */}
              <div className="border-b border-rule bg-white/75 px-5 py-3">
                <div className="flex items-center gap-2">
                  <TierNumeral tolerance={group.tolerance} />
                  <span className="text-sm font-bold text-ink">{group.title}</span>
                  <span className="num ml-auto font-mono text-xs text-ink-muted">
                    {group.items.length} {group.items.length === 1 ? "label" : "labels"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{TIER_DESCRIPTIONS[group.tolerance]}</p>
              </div>

              {/* Same channels as the app: a border in the topic's hue with the
                  topic named inside it, ticks for the certainty, and the tier
                  from the group heading above - a chip does not repeat what its
                  container already says. A PNG cannot be hovered, so the chip
                  spells out the certainty too. The topic has to be written out
                  here rather than only tinted: this report is the one surface a
                  reader may print, photocopy or paste into a greyscale slide. */}
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {group.items.map((labelObj, idx) => {
                  const certainty = Math.max(0, Math.min(3, labelObj.certainty ?? 0));
                  const tints = categoryTints(labelObj.category);
                  const topic = QUIZ_CATEGORY_SHORT_LABELS[labelObj.category] || "General";
                  return (
                    <div
                      key={`${group.tolerance}-${idx}-${labelText(labelObj)}`}
                      className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border-2 py-1 pl-2 pr-1.5 text-sm text-ink"
                      style={{ borderColor: tints.hue, backgroundColor: tints.wash }}
                    >
                      <span className="shrink-0 text-3xs font-semibold uppercase tracking-wider text-ink-soft">
                        {topic}
                      </span>
                      <span className="min-w-0 leading-tight">{labelText(labelObj)}</span>
                      <CertaintyMeter value={certainty} size="sm" />
                      <span className="text-3xs text-ink-muted">{CERTAINTY_TEXT[certainty]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

    </ExportFrame>
  );
}