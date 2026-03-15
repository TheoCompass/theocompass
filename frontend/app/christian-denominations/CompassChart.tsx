"use client";

import { useState, useEffect } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

// Map our internal database columns to readable axis names AND extremity labels
// We define whether the axis naturally needs reversing.
// By default in Recharts, 0 is Left/Bottom, 100 is Right/Top.
// If 100 means "Conservative", we leave it. If 0 means "Conservative", we reverse it.
const AXIS_OPTIONS = [
  { key: "theol_cons_lib_avg", label: "Theology: Progressive ↔ Orthodox", minLabel: "Progressive", maxLabel: "Orthodox" },
  { key: "social_cons_lib_avg", label: "Society: Liberal ↔ Conservative", minLabel: "Liberal", maxLabel: "Conservative" },
  { key: "counter_pro_modern_avg", label: "Culture: Accommodating ↔ Counter-Cultural", minLabel: "Accommodating", maxLabel: "Counter-Cultural" },
  { key: "super_nat_avg", label: "Worldview: Naturalistic ↔ Supernatural", minLabel: "Naturalistic", maxLabel: "Supernatural" },
  { key: "cult_sep_eng_avg", label: "Politics: Engaged ↔ Separatist", minLabel: "Engaged", maxLabel: "Separatist" },
  { key: "cleric_egal_avg", label: "Authority: Egalitarian ↔ Hierarchical", minLabel: "Egalitarian", maxLabel: "Hierarchical" },
  { key: "div_hum_agency_avg", label: "Salvation: Human Agency ↔ Divine Sovereignty", minLabel: "Human Agency", maxLabel: "Sovereignty" },
  { key: "commun_indiv_avg", label: "Focus: Individualist ↔ Communitarian", minLabel: "Individualist", maxLabel: "Communitarian" },
  { key: "liturg_spont_avg", label: "Worship: Spontaneous ↔ Liturgical", minLabel: "Spontaneous", maxLabel: "Liturgical" },
  { key: "sacram_funct_avg", label: "Sacraments: Symbolic ↔ Sacramental", minLabel: "Symbolic", maxLabel: "Sacramental" },
  { key: "literal_crit_avg", label: "Scripture: Critical ↔ Literal", minLabel: "Critical", maxLabel: "Literal" },
  { key: "intellect_exper_avg", label: "Practice: Experiential ↔ Intellectual", minLabel: "Experiential", maxLabel: "Intellectual" },
  { key: "tolerance_score", label: "Posture: Accepting ↔ Dogmatic", minLabel: "Accepting", maxLabel: "Dogmatic" },
];

const getFamilyColor = (family: string) => {
  if (!family) return "#94a3b8"; 
  const lower = family.toLowerCase();
  if (lower.includes("catholic") || lower.includes("orthodox")) return "#eab308"; // Gold
  if (lower.includes("reformed") || lower.includes("presbyterian") || lower.includes("calvinist")) return "#3b82f6"; // Blue
  if (lower.includes("baptist") || lower.includes("evangelical")) return "#10b981"; // Green
  if (lower.includes("methodist") || lower.includes("wesleyan") || lower.includes("holiness")) return "#f97316"; // Orange
  if (lower.includes("pentecostal") || lower.includes("charismatic")) return "#ef4444"; // Red
  if (lower.includes("anglican") || lower.includes("episcopal")) return "#8b5cf6"; // Indigo
  if (lower.includes("anabaptist") || lower.includes("mennonite")) return "#14b8a6"; // Teal
  if (lower.includes("lutheran")) return "#6366f1"; // Violet
  if (lower.includes("restoration") || lower.includes("adventist") || lower.includes("lds")) return "#ec4899"; // Pink
  return "#64748b"; 
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-sm max-w-xs z-50 relative">
        <p className="font-bold text-base mb-1 text-blue-200">{data.name}</p>
        
        {data.isUser ? (
          <p className="text-xs text-slate-300 italic mb-2">This is your calculated position!</p>
        ) : (
          <>
            <p className="text-xs text-slate-300 mb-2 font-bold">{data.family}</p>
            {/* Display Origin and Year if they exist in the DB */}
            {(data.origin || data.year) && (
              <div className="flex flex-col gap-0.5 text-xs text-slate-400 mb-3 font-mono border-b border-slate-700 pb-2">
                {data.year && <span>🗓 {data.year}</span>}
                {data.origin && <span>🌍 {data.origin}</span>}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-400">X-Axis:</span>
          <span className="text-right font-mono">{Number(payload[0].value).toFixed(1)}</span>
          <span className="text-slate-400">Y-Axis:</span>
          <span className="text-right font-mono">{Number(payload[1].value).toFixed(1)}</span>
        </div>
      </div>
    );
  }
  return null;
};

interface CompassProps {
  userCoords: Record<string, number>;
  userTolerance: number;
  isExport?: boolean;  // NEW: detect PNG mode
}

export default function CompassChart({ userCoords, userTolerance, isExport = false }: CompassProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [xAxis, setXAxis] = useState("theol_cons_lib_avg"); 
  const [yAxis, setYAxis] = useState("liturg_spont_avg");

  useEffect(() => {
    async function fetchLandscape() {
      try {
        // 1. Fetch coordinates + joined metadata directly from your Cloudflare Worker SQL
        const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
        const coordRes = await fetch(`${apiUrl}/api/coordinates`);

        const rawCoords = await coordRes.json();
        
        // 2. Map the DB results into Recharts format
        const formattedData = rawCoords.map((coordRow: any) => ({
          ...coordRow,
          name: coordRow.name || coordRow.denomination_id, // Fallback if name is somehow null
          family: coordRow.family || "Tradition",
          origin: coordRow.origin || "",
          year: coordRow.year || "",
          isUser: false
        }));

        // 3. MERGE LOGIC: Group duplicate denominations and average their axes
        const mergedMap = new Map();

        formattedData.forEach((item: any) => {
          if (mergedMap.has(item.name)) {
            const existing = mergedMap.get(item.name);
            // Add all 13 possible axes to a running sum
            AXIS_OPTIONS.forEach(axis => {
              if (item[axis.key] !== undefined && item[axis.key] !== null) {
                existing.sums[axis.key] = (existing.sums[axis.key] || 0) + Number(item[axis.key]);
              }
            });
            existing.count += 1;
          } else {
            // First time seeing this denomination, initialize its sums
            const initialSums: Record<string, number> = {};
            AXIS_OPTIONS.forEach(axis => {
              if (item[axis.key] !== undefined && item[axis.key] !== null) {
                initialSums[axis.key] = Number(item[axis.key]);
              }
            });
            
            mergedMap.set(item.name, {
              ...item,
              sums: initialSums,
              count: 1
            });
          }
        });

        // Calculate the final averages to create the clean dataset
        const cleanData = Array.from(mergedMap.values()).map((item: any) => {
          const averagedItem: any = { ...item };
          AXIS_OPTIONS.forEach(axis => {
            if (item.sums[axis.key] !== undefined) {
              averagedItem[axis.key] = item.sums[axis.key] / item.count;
            }
          });
          // Cleanup temporary grouping properties
          delete averagedItem.sums;
          delete averagedItem.count;
          return averagedItem;
        });

        // 4. Build the User Point (Your exact original logic)
        const userPoint = {
          id: "USER",
          name: "You Are Here",
          family: "Your Profile",
          isUser: true,
          ...AXIS_OPTIONS.reduce((acc, opt) => {
            const rawKey = opt.key.replace(/_avg/g, "").replace(/_/g, "");
            acc[opt.key] = rawKey === "tolerancescore" ? userTolerance : (userCoords[rawKey] || 50);
            return acc;
          }, {} as Record<string, number>)
        };

        // Combine the merged DB points with the User point
        setChartData([...cleanData, userPoint]);
      } catch (e) {
        console.error("Failed to load compass coordinates", e);
      } finally {
        setLoading(false);
      }
    }
    fetchLandscape();
  }, [userCoords, userTolerance]);


  // Find the selected axis objects to get their extremity labels
  const xObj = AXIS_OPTIONS.find(o => o.key === xAxis);
  const yObj = AXIS_OPTIONS.find(o => o.key === yAxis);

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">Loading Theological Landscape...</div>;

return (
  <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mt-8">
    {/* HEADER + CONTROLS — Dual mode for live/export */}
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h3 className="font-serif text-2xl font-bold text-slate-800">Your Theological Compass</h3>
        <p className="text-sm text-slate-500">A visual projection of your theological coordinates relative to major traditions, across different dimensions.</p>
      </div>
      
      {/* AXIS CONTROLS */}
      {!isExport ? (
        // LIVE PAGE: Interactive dropdowns (your current code)
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-slate-700 w-12">Y-Axis</span>
            <select 
              className="border border-slate-300 rounded p-1 text-slate-700 w-full md:w-72"
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
            >
              {AXIS_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-slate-700 w-12">X-Axis</span>
            <select 
              className="border border-slate-300 rounded p-1 text-slate-700 w-full md:w-72"
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
            >
              {AXIS_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        // PNG EXPORT: Static text (no cutoff, perfect rendering)
        <div className="flex flex-col gap-3 w-full md:w-auto">
          <div className="flex items-center">
            <span className="font-bold text-slate-700 text-sm w-20">Y-Axis:</span>
            <span className="w-full font-semibold text-slate-900 px-4 py-2.5 bg-white border-2 border-slate-400 rounded-lg shadow-md text-sm max-w-[280px] truncate bg-gradient-to-r from-slate-50 to-white">
              {AXIS_OPTIONS.find(o => o.key === yAxis)?.label || 'Loading...'}
            </span>
          </div>
          <div className="flex items-center">
            <span className="font-bold text-slate-700 text-sm w-20">X-Axis:</span>
            <span className="w-full font-semibold text-slate-900 px-4 py-2.5 bg-white border-2 border-slate-400 rounded-lg shadow-md text-sm max-w-[280px] truncate bg-gradient-to-r from-slate-50 to-white">
              {AXIS_OPTIONS.find(o => o.key === xAxis)?.label || 'Loading...'}
            </span>
          </div>
        </div>
      )}
    </div>

      <div className=" border border-slate-100 rounded-lg overflow-hidden bg-slate-50 relative">
        <ResponsiveContainer width="100%" aspect={1} minHeight={0}>
          <ScatterChart margin={{ top: 40, right: 30, bottom: 30, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            
            {/* Note: reversed={true} is kept per your previous request to match standard mental models */}
            <XAxis type="number" dataKey={xAxis} domain={[0, 100]} reversed={true} hide />
            <YAxis type="number" dataKey={yAxis} domain={[0, 100]} reversed={true} hide />
            <ZAxis type="number" range={[100, 300]} /> 
            
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            
            <ReferenceLine x={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
            <ReferenceLine y={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />

            <Scatter data={chartData} shape="circle">
              {chartData.map((entry, index) => {
                if (entry.isUser) {
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill="#ef4444" 
                      stroke="#7f1d1d" 
                      strokeWidth={3} 
                    />
                  );
                }
                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getFamilyColor(entry.family)} 
                    stroke="#ffffff"
                    strokeWidth={1}
                    fillOpacity={0.7}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* DYNAMIC AXIS LABELS */}
        {xObj && yObj && (
          <>
            {/* X-Axis labels */}
            <div className="absolute bottom-2 left-16 text-xs font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded">
              ← {xObj.minLabel}
            </div>
            <div className="absolute bottom-2 right-4 text-xs font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded">
              {xObj.maxLabel} →
            </div>

            {/* Y-Axis labels */}
            <div className="absolute top-15 left-4 text-xs font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded origin-top-left -rotate-90 translate-y-20">
              {yObj.maxLabel} →
            </div>
            <div className="absolute bottom-16 left-8 text-xs font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded origin-bottom-left -rotate-90">
              ← {yObj.minLabel}
            </div>
          </>
        )}
      </div>
      
      {/* Legend below chart */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs justify-center text-slate-600">
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#ef4444] border border-[#7f1d1d]"></div> You</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#eab308]"></div> Catholic/Orthodox</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div> Reformed</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#10b981]"></div> Baptist/Evang.</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#8b5cf6]"></div> Anglican</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#14b8a6]"></div> Anabaptist</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#ec4899]"></div> Restorationist</span>
      </div>
    </div>
  );
}
