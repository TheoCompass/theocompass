"use client";

import CompassChart from "../../CompassChart";

export function CompassPanel({
  userCoords,
  userTolerance,
  userCertainty,
  activeOnly,
  xAxis,
  yAxis,
  onSetXAxis,
  onSetYAxis,
}: {
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  activeOnly: boolean;
  /**
   * Axes are owned by the results page, not by the chart: the exported report
   * renders its own copy of the chart and has to be printed with the same pair.
   */
  xAxis: string;
  yAxis: string;
  onSetXAxis: (key: string) => void;
  onSetYAxis: (key: string) => void;
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
          xAxis={xAxis}
          yAxis={yAxis}
          onSetXAxis={onSetXAxis}
          onSetYAxis={onSetYAxis}
          embedded
        />
      </div>
    </div>
  );
}
