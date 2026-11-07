"use client";

import { useState } from "react";
import { getTraitTags, getTierStyle, formatMembers } from "../_helpers";

export function DenominationCard({
  denom,
  rank,
}: {
  denom: any;
  rank: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const tier = getTierStyle(denom.matchPercentage);
  const tags = getTraitTags(denom.dimCoords);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-3 overflow-hidden transition-all duration-200 hover:border-slate-300 hover:shadow-md border-l-4"
      style={{ borderLeftColor: tier.hex }}
    >
      <button
        type="button"
        className="w-full p-4 flex justify-between items-center cursor-pointer select-none hover:bg-slate-50/60 text-left transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
            rank === 1 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
          }`}>
            {rank}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h4 className={`font-bold text-sm transition-colors ${isOpen ? "text-blue-700" : "text-slate-800"}`}>
                {denom.name}
              </h4>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${tier.textColor} ${tier.bg} ${tier.borderColor}`}>
                {tier.badge}
              </span>
              {denom.isActive === false && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200"
                  title="Historical / no longer active tradition"
                >
                  Historical
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">{denom.family}</span>
              {typeof denom.estMembers === "number" && denom.estMembers > 0 && (
                <span className="text-xs text-slate-400" title="Estimated global members">
                  · ~{formatMembers(denom.estMembers)}
                </span>
              )}
              {tags.length > 0 && (
                <span className="flex gap-1">
                  {tags.map((tag, i) => (
                    <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tag.color}`}>
                      {tag.label}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`font-bold text-sm px-3 py-1 rounded-lg ${
            rank === 1 ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
          }`}>
            {denom.matchPercentage}%
          </div>
          <div className={`text-slate-400 transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50/80">
          <div className="flex flex-wrap gap-4 mt-3 mb-3 text-xs text-slate-500 font-mono">
            {denom.foundedyear && <span>Founded {denom.foundedyear}</span>}
            {denom.regionorigin && <span>Origin {denom.regionorigin}</span>}
          </div>

          <p className="text-sm text-slate-700 leading-relaxed mb-4">
            {denom.description || "No description available for this tradition."}
          </p>

        </div>
      )}
    </div>
  );
}