"use client";

import Image from "next/image";
import { FINGERPRINT_CATEGORIES, AXIS_LABELS } from "../_constants";
import { getConvictionStyle } from "../_helpers";

export interface ExportFingerprintCardProps {
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  selectedMode: "quick" | "standard" | "deep" | null;
  questionCount: number;
  onRef: (el: HTMLDivElement | null) => void;
}

export default function ExportFingerprintCard({
  userCoords,
  userTolerance,
  userCertainty,
  selectedMode,
  questionCount,
  onRef,
}: ExportFingerprintCardProps) {
  const exportCoords: Record<string, number> = {
    ...userCoords,
    tolerance: userTolerance,
    certainty: userCertainty,
  };

  const modeLabel =
    selectedMode === "quick"
      ? "Quick Mode"
      : selectedMode === "standard"
        ? "Standard Mode"
        : "Deep Dive";

  const now = new Date();
  const timestamp = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      ref={onRef}
      className="absolute w-[960px] bg-white text-slate-900 overflow-hidden shadow-2xl ring-1 ring-slate-200 font-sans"
      style={{ left: "-9999px", top: "0" }}
    >
      {/* ─── HEADER ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-10 py-6 flex justify-between items-center border-b-4 border-purple-500/40">
        <div>
          <div className="text-3xl font-bold font-serif tracking-tight">
            TheoCompass <span className="text-purple-300 text-lg font-sans tracking-widest ml-2">Open Beta</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-purple-300 text-sm font-bold uppercase tracking-widest">
              Theological Fingerprint Report
            </span>
            <span className="bg-purple-600/30 text-purple-100 text-xs font-bold px-3 py-0.5 rounded-full border border-purple-400/30">
              {modeLabel} • {questionCount} questions
            </span>
          </div>
        </div>
        <div className="w-16 h-16 bg-white rounded-full flex-shrink-0 flex items-center justify-center shadow-lg border-2 border-slate-700 overflow-hidden">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain p-1" />
        </div>
      </div>

      {/* ─── INTRO ─── */}
      <div className="relative bg-white text-center py-8 px-10 border-b border-slate-200 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-50/50 via-white to-white pointer-events-none" />
        <div className="relative z-10">
          <div className="text-base font-bold text-slate-400 uppercase tracking-widest mb-2">
            Your 14-Axis Theological Fingerprint
          </div>
          <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
            Your positions on 14 bipolar dimensions of Christian theology. Dots are colored by conviction strength.
          </p>
          {/* Conviction legend */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 mt-4 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-purple-500 ring-1 ring-purple-300" />
              <span className="text-slate-500">Extreme</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500 ring-1 ring-red-300" />
              <span className="text-slate-500">Strong</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-500 ring-1 ring-amber-300" />
              <span className="text-slate-500">Moderate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-slate-500 ring-1 ring-slate-300" />
              <span className="text-slate-500">Neutral</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── FINGERPRINT CATEGORIES ─── */}
      <div className="bg-white border-b border-slate-200 px-10 py-8">
        <div className="space-y-10">
          {Object.entries(FINGERPRINT_CATEGORIES).map(([catKey, catData]) => (
            <div key={catKey}>
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-2">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                  {catData.label}
                </span>
                <span className="text-xs text-slate-400">{catData.desc}</span>
              </div>
              <div className="space-y-5">
                {catData.axes.map((axis) => {
                  const labels = AXIS_LABELS[axis];
                  const score = exportCoords[axis];
                  if (score === undefined || score === null) return null;
                  const isInverted = labels.invert === true;
                  // `invert` axes keep their affirmative pole on the right.
                  const isLeft = isInverted ? score < 50 : score > 50;
                  const conviction = getConvictionStyle(score);
                  const dotPercent = isInverted ? score : 100 - score;
                  return (
                    <div key={axis}>
                      {/* Pole labels */}
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 px-1">
                        <span className={isLeft ? "text-slate-800" : ""}>{labels.left}</span>
                        <span className={!isLeft ? "text-slate-800" : ""}>{labels.right}</span>
                      </div>

                      {/* Bar + Dot */}
                      <div className="relative h-12 flex items-center">
                        {/* Track */}
                        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                          <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-slate-300 via-slate-200 to-blue-400">
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-6 bg-slate-400" />
                          </div>
                        </div>

                        {/* Conviction dot */}
                        <div
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm z-10 ${conviction.dotColor} ${conviction.animate ? conviction.animate : ""} ring-2 ${conviction.ringColor} ring-offset-1`}
                          style={{ left: `${dotPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div className="bg-slate-900 px-10 py-8 text-center border-t-4 border-slate-800">
        <p className="font-serif italic text-base text-slate-300 mb-3">
          &ldquo;He is before all things, and in him all things hold together.&rdquo; — Colossians 1:17
        </p>
        <div className="w-12 h-px bg-slate-700 mx-auto my-3" />
        <p className="text-xs text-slate-400 mb-1">Built for informed decision, not persuasion.</p>
        <p className="text-xs text-slate-500 font-mono mt-2">
          theocompass.com • Generated {timestamp}
        </p>
      </div>
    </div>
  );
}