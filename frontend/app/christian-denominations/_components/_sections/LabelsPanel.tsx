"use client";

import TheologicalLabelCloud, { Label } from "../../TheologicalLabelCloud";

export function LabelsPanel({ userLabels }: { userLabels: Label[] }) {
  return (
    <div className="animate-fade-in">
      <div className="border-b border-rule pb-2">
        <h2 className="font-display text-xl text-ink">Theological labels</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          The beliefs behind your answers, weighted by importance — one label per
          position you affirmed.
        </p>
      </div>

      <div className="mt-4">
        <TheologicalLabelCloud userLabels={userLabels} embedded />
      </div>
    </div>
  );
}
