"use client";

import CompassChart from "../../CompassChart";

export function CompassPanel({
  userCoords,
  userTolerance,
  userCertainty,
  activeOnly,
}: {
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  activeOnly: boolean;
}) {
  return (
    <div className="animate-fade-in">
      <div className="border-b border-rule pb-2">
        <h2 className="font-display text-xl text-ink">Theological compass</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          Traditions projected onto two axes of your choosing. Hover or tap a
          family to see its theological range.
        </p>
      </div>

      <div className="mt-4">
        <CompassChart
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          hideInactive={activeOnly}
          embedded
        />
      </div>
    </div>
  );
}
