'use client';
import { useState, useEffect, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { FAMILY_COLORS, FAMILY_GROUPS, GROUP_COLORS, FAMILY_TO_GROUP } from '../../lib/taxonomy';

const AXIS_OPTIONS = [
    { key: 'theol_cons_lib_avg', label: 'Theology: Progressive ↔ Orthodox', minLabel: 'Progressive', maxLabel: 'Orthodox' },
    { key: 'social_cons_lib_avg', label: 'Society: Liberal ↔ Conservative', minLabel: 'Liberal', maxLabel: 'Conservative' },
    { key: 'counter_pro_modern_avg', label: 'Culture: Accommodating ↔ Counter-Cultural', minLabel: 'Accommodating', maxLabel: 'Counter-Cultural' },
    { key: 'super_nat_avg', label: 'Worldview: Naturalistic ↔ Supernatural', minLabel: 'Naturalistic', maxLabel: 'Supernatural' },
    { key: 'cult_sep_eng_avg', label: 'Politics: Engaged ↔ Separatist', minLabel: 'Engaged', maxLabel: 'Separatist' },
    { key: 'cleric_egal_avg', label: 'Authority: Egalitarian ↔ Hierarchical', minLabel: 'Egalitarian', maxLabel: 'Hierarchical' },
    { key: 'div_hum_agency_avg', label: 'Salvation: Human Agency ↔ Divine Sovereignty', minLabel: 'Human Agency', maxLabel: 'Sovereignty' },
    { key: 'commun_indiv_avg', label: 'Focus: Individualist ↔ Communitarian', minLabel: 'Individualist', maxLabel: 'Communitarian' },
    { key: 'liturg_spont_avg', label: 'Worship: Spontaneous ↔ Liturgical', minLabel: 'Spontaneous', maxLabel: 'Liturgical' },
    { key: 'sacram_funct_avg', label: 'Sacraments: Symbolic ↔ Sacramental', minLabel: 'Symbolic', maxLabel: 'Sacramental' },
    { key: 'literal_crit_avg', label: 'Scripture: Critical ↔ Literal', minLabel: 'Critical', maxLabel: 'Literal' },
    { key: 'intellect_exper_avg', label: 'Practice: Experiential ↔ Intellectual', minLabel: 'Experiential', maxLabel: 'Intellectual' },
    { key: 'tolerance_score', label: 'Posture: Accepting ↔ Dogmatic', minLabel: 'Accepting', maxLabel: 'Dogmatic' },
    { key: 'certainty_score', label: 'Conviction: Unsure ↔ Certain', minLabel: 'Unsure', maxLabel: 'Certain' },
];

// Transitional shim: maps old D1 family_name values → new taxonomy keys
// Remove this after the Beta D1 re-seed in Phase 2
const LEGACY_FAMILY_NAME_MAP: Record<string, string> = {
    'radical reformation & anabaptist': 'anabaptist',
    'eastern & regional catholicism':   'anti-sacerdotal primitivist',
    'independent sacramental & autocephalous': 'independent/liberal catholicism',
};

const getFamilyKey = (family: string): string | null => {
    if (!family) return null;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const normalizedInput = normalize(family);

    // Check legacy name shim first (transitional — remove after D1 re-seed)
    const legacyKey = LEGACY_FAMILY_NAME_MAP[family.toLowerCase().trim()];
    if (legacyKey) {
        const resolvedKey = Object.keys(FAMILY_COLORS).find(
            k => normalize(k) === normalize(legacyKey)
        );
        if (resolvedKey) return resolvedKey;
    }

    const key = Object.keys(FAMILY_COLORS).find(k => normalize(k) === normalizedInput);
    if (key) return key;

    const fallbackKey = Object.keys(FAMILY_COLORS).find(k => normalizedInput.includes(normalize(k.split(' ')[0])));
    return fallbackKey ?? null;
};

const getFamilyColor = (family: string, viewMode?: 'families' | 'denominations') => {
    const key = getFamilyKey(family);
    if (!key) return '#64748b';
    if (viewMode === 'families') {
        const group = FAMILY_TO_GROUP[key];
        return group ? (GROUP_COLORS[group] || '#64748b') : '#64748b';
    }
    return FAMILY_COLORS[key] || '#64748b';
};

// Family metadata now fetched live from /api/families instead of static FAMILY_METADATA
const useFamilyMeta = () => {
    const [metaMap, setMetaMap] = useState<Record<string, { century: string; region: string; members: string; desc: string }>>({});

    useEffect(() => {
        async function load() {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
                const res = await fetch(`${apiUrl}/api/families`);
                const rows: any[] = await res.json();
                const map: Record<string, { century: string; region: string; members: string; desc: string }> = {};
                rows.forEach((row: any) => {
                    map[row.family_name] = {
                        century: row.century || '',
                        region: row.region_origin || '',
                        members: row.approx_members || '',
                        desc: row.description || ''
                    };
                });
                setMetaMap(map);
            } catch {
                // silently fail; tooltip will just not show meta
            }
        }
        load();
    }, []);

    return metaMap;
};

const CustomDot = (props: any) => {
    const { cx, cy, payload, activeNodeName, isMobile, viewMode } = props;
    if (!cx || !cy) return null;

    const isUser = payload.isUser;
    const isActive = activeNodeName === payload.name;
    const scale = isMobile ? 0.65 : 1;
    
    let r = 5 * scale;
    if (isUser) r = (isActive ? 10 : 8) * scale;
    else if (payload.isFamily) r = (isActive ? 9 : 7) * scale;
    else r = (isActive ? 7 : 5) * scale;

    const fill = isUser ? '#ef4444' : getFamilyColor(payload.family, viewMode);
    const stroke = isUser ? '#7f1d1d' : (isActive ? '#0f172a' : '#ffffff');
    const strokeWidth = isUser ? 3 : (isActive ? 2 : 1);
    const opacity = isUser ? 1 : (isActive ? 1 : 0.7);

    return (
        <circle 
            cx={cx} cy={cy} r={r} 
            fill={fill} stroke={stroke} strokeWidth={strokeWidth} fillOpacity={opacity}
            className={isUser ? "drop-shadow-lg" : ""}
            style={{ cursor: payload.isFamily ? 'pointer' : 'default', transition: 'all 0.2s ease' }}
        />
    );
};

const CustomTooltip = ({ active, payload, familyMetaMap }: { active?: boolean; payload?: any[] | readonly any[]; familyMetaMap: Record<string, { century: string; region: string; members: string; desc: string }> }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        
        // Fetch family meta if it's a family node
        const meta = data.isFamily ? familyMetaMap[data.name] : null;

        return (
            <div className="bg-slate-900 text-white p-2.5 sm:p-3.5 rounded-xl shadow-2xl border border-slate-700 text-xs sm:text-sm max-w-[240px] sm:max-w-[320px] w-[240px] sm:w-[320px] z-50 relative pointer-events-none">
                <p className="font-bold text-base mb-1 text-blue-200 leading-tight">{data.name}</p>
                
                {data.isUser ? (
                    <p className="text-xs text-slate-300 italic mb-3 border-b border-slate-700 pb-3">This is your calculated position!</p>
                ) : data.isFamily ? (
                    <>
                        <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider font-bold">Family Average ({data.count} traditions)</p>
                        {meta && (
                            <div className="mb-3 border-b border-slate-700 pb-3">
                                <p className="text-xs text-slate-300 leading-relaxed mb-3">{meta.desc}</p>
                                <div className="grid grid-cols-2 gap-y-1.5 text-[10px] text-slate-400 font-mono">
                                    <span className="flex items-center gap-1.5 truncate">🗓 {meta.century}</span>
                                    <span className="flex items-center gap-1.5 truncate">🌍 {meta.region}</span>
                                    <span className="flex items-center gap-1.5 col-span-2">👥 {meta.members} est. members</span>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider font-bold">{data.family} Family</p>
                        
                        {(data.description || data.origin || data.year || data.members) && (
                            <div className="mb-3 border-b border-slate-700 pb-3">
                                {/* Optional description text */}
                                {data.description && (
                                    <p className="text-xs text-slate-300 leading-relaxed mb-3">{data.description}</p>
                                )}
                                
                                {/* Metadata Grid mirroring the family layout */}
                                <div className="grid grid-cols-2 gap-y-1.5 text-[10px] text-slate-400 font-mono">
                                    {data.year && (
                                        <span className="flex items-center gap-1.5 truncate">🗓 {data.year}</span>
                                    )}
                                    {data.origin && (
                                        <span className="flex items-center gap-1.5 truncate">🌍 {data.origin}</span>
                                    )}
                                    {data.members && (
                                        <span className="flex items-center gap-1.5 col-span-2">👥 {data.members} est. members</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50">
                    <span className="text-slate-400">X-Axis:</span>
                    <span className="text-right font-mono font-bold text-blue-100">{Number(payload[0].value).toFixed(1)}</span>
                    <span className="text-slate-400">Y-Axis:</span>
                    <span className="text-right font-mono font-bold text-blue-100">{Number(payload[1].value).toFixed(1)}</span>
                </div>
            </div>
        );
    }
    return null;
};

interface CompassProps {
    userCoords: Record<string, number>;
    userTolerance: number;
    userCertainty?: number;
    isExport?: boolean;
    selectedMode?: string | null;
    familyMatches?: any[];
    displayFamilies?: boolean;
    matches?: any[];
    showRings?: boolean;
    showTrails?: boolean;
    onToggleRings?: () => void;
    onToggleTrails?: () => void;
    hideInactive?: boolean;
}

export default function CompassChart({ userCoords, userTolerance, userCertainty = 50, isExport = false, selectedMode = 'quick', familyMatches = [], hideInactive = false }: CompassProps) {
    const rawFamilyMetaMap = useFamilyMeta();
    const familyMetaMap = useMemo(() => rawFamilyMetaMap, [rawFamilyMetaMap]);
    const [rawMapData, setRawMapData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'families' | 'denominations'>('families');
    
    const [xAxis, setXAxis] = useState('theol_cons_lib_avg');
    const [yAxis, setYAxis] = useState('liturg_spont_avg');

    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [lockedNode, setLockedNode] = useState<any>(null);
    const activeNode = lockedNode || hoveredNode;

    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        setHoveredNode(null);
        setLockedNode(null);
        setSelectedFamilies([]); 
    }, [viewMode]);

    useEffect(() => {
        async function fetchLandscape() {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
                const coordRes = await fetch(apiUrl + '/api/coordinates?mode=quick');
                const rawCoords = await coordRes.json();
                setRawMapData(rawCoords);
                if (process.env.NODE_ENV === 'development') {
                    const families = [...new Set((rawCoords as any[]).map((r: any) => r.family))].sort();
                    const nullCount = (rawCoords as any[]).filter((r: any) => !r.family || r.family === 'Unknown').length;
                    console.table({
                        'Total denomination rows': (rawCoords as any[]).length,
                        'Unique families found': families.length,
                        'Rows with null/Unknown family': nullCount,
                    });
                    console.log('[TheoCompass] Families from API:', families);
                }
            } catch (e) {
                console.error('Failed to load compass coordinates', e);
            } finally {
                setLoading(false);
            }
        }
        fetchLandscape();
    }, []);

    const chartData = useMemo(() => {
        if (!rawMapData.length) return [];

        // Step 1: Format raw API rows
        // Use denomination_id as the canonical identity key, name is display-only
        const formattedData = rawMapData.map((coordRow: any) => ({
            ...coordRow,
            // FIXED: use denomination_id as the unique key, not name
            id:     coordRow.denomination_id,
            name:   coordRow.name ?? coordRow.denomination_id,
            family: coordRow.family ?? 'Unknown',
            origin: coordRow.region_origin ?? coordRow.origin ?? '',
            year:   coordRow.founded_year  ?? coordRow.year   ?? '',
            isUser: false,
        }));

        // Step 2: Deduplicate by denomination_id (not name)
        // API should return 1 row per denom for the requested mode, but guard anyway
        const mergedMap = new Map<string, any>();
        formattedData.forEach((item: any) => {
            const key = item.id; // FIXED: was item.name
            if (mergedMap.has(key)) {
                // If duplicates exist, average their axis values
                const existing = mergedMap.get(key);
                existing.count += 1; // FIXED: count once per duplicate row, not per axis
                AXIS_OPTIONS.forEach(axis => {
                    if (item[axis.key] !== undefined && item[axis.key] !== null) {
                        existing.sums[axis.key] = (existing.sums[axis.key] ?? 0) + Number(item[axis.key]);
                    }
                });
            } else {
                const initialSums: Record<string, number> = {};
                AXIS_OPTIONS.forEach(axis => {
                    if (item[axis.key] !== undefined && item[axis.key] !== null) {
                        initialSums[axis.key] = Number(item[axis.key]);
                    }
                });
                mergedMap.set(key, { ...item, sums: initialSums, count: 1 });
            }
        });

        const cleanData = Array.from(mergedMap.values()).map((item: any) => {
            const averagedItem: any = { ...item };
            AXIS_OPTIONS.forEach(axis => {
                if (item.sums[axis.key] !== undefined) {
                    averagedItem[axis.key] = item.sums[axis.key] / item.count;
                }
            });
            delete averagedItem.sums;
            delete averagedItem.count;
            averagedItem.z = 100;
            return averagedItem;
        });

        // 0.5 Filter: optionally hide inactive / historical traditions from the map
        const visibleData = hideInactive
            ? cleanData.filter((d: any) => d.is_active === 1 || d.is_active === true)
            : cleanData;

        if (process.env.NODE_ENV === 'development') {
            console.log(`[TheoCompass] cleanData: ${cleanData.length} denominations across ${new Set(cleanData.map((d: any) => d.family)).size} families`);
        }

        // Step 3: Build family centroids OR use individual dots
        let finalBackgroundData = visibleData;

        if (viewMode === 'families') {
            const familyGroups = new Map<string, any>();

            visibleData.forEach((item: any) => {
                const fam = item.family ?? 'Unknown';
                if (!familyGroups.has(fam)) {
                    familyGroups.set(fam, {
                        ...item,
                        name: fam,
                        isFamily: true,
                        count: 0,
                        sums: {},
                        values: {},
                    });
                }
                const group = familyGroups.get(fam);
                group.count += 1;
                AXIS_OPTIONS.forEach(opt => {
                    if (item[opt.key] !== undefined && item[opt.key] !== null) {
                        const val = Number(item[opt.key]);
                        group.sums[opt.key] = (group.sums[opt.key] ?? 0) + val;
                        if (!group.values[opt.key]) group.values[opt.key] = [];
                        group.values[opt.key].push(val);
                    }
                });
            });

            finalBackgroundData = Array.from(familyGroups.values()).map((group: any) => {
                const averaged: any = { ...group };
                AXIS_OPTIONS.forEach(opt => {
                    if (group.sums[opt.key] !== undefined) {
                        averaged[opt.key] = group.sums[opt.key] / group.count;
                        const vals = group.values[opt.key];
                        averaged[`${opt.key}Min`] = Math.min(...vals);
                        averaged[`${opt.key}Max`] = Math.max(...vals);
                    }
                });
                delete averaged.sums;
                delete averaged.values;
                averaged.z = 150;
                return averaged;
            });
        }

        // Step 4: Add user point
        // Map from chart's underscore-separated keys (e.g. "theol_cons_lib") to API underscore-stripped keys (e.g. "theolconslib")
        const CHART_KEY_TO_API_KEY: Record<string, string> = {
            'theol_cons_lib':     'theolconslib',
            'social_cons_lib':    'socialconslib',
            'counter_pro_modern': 'counterpromodern',
            'super_nat':          'supernat',
            'cult_sep_eng':       'cultsepeng',
            'cleric_egal':        'clericegal',
            'div_hum_agency':     'divhumagency',
            'commun_indiv':       'communindiv',
            'liturg_spont':       'liturgspont',
            'sacram_funct':       'sacramfunct',
            'literal_crit':       'literalcrit',
            'intellect_exper':    'intellectexper',
        };
        const userPoint = {
            id: 'USER',
            name: 'You Are Here',
            family: 'Your Profile',
            isUser: true,
            z: 200,
            ...AXIS_OPTIONS.reduce((acc, opt) => {
                // Meta-axes (tolerance/certainty) are served as separate scalars and
                // are not part of userCoords.
                const metaAxisValues: Record<string, number> = {
                    tolerance_score: userTolerance,
                    certainty_score: userCertainty,
                };
                if (opt.key in metaAxisValues) {
                    acc[opt.key] = metaAxisValues[opt.key];
                    return acc;
                }
                const chartKey = opt.key.replace(/_avg$/, '');
                // Try chart key directly first, then the API underscore-stripped version
                const value = userCoords[chartKey] ?? userCoords[CHART_KEY_TO_API_KEY[chartKey]] ?? 50;
                acc[opt.key] = value;
                return acc;
            }, {} as Record<string, number>),
        };

        const compiledData = [...finalBackgroundData, userPoint];

        // Step 5: Apply family filter in denominations mode
        if (viewMode === 'denominations' && selectedFamilies.length > 0) {
            return compiledData.filter(d => d.isUser || selectedFamilies.includes(getFamilyKey(d.family) || ''));
        }
        return compiledData;

    }, [rawMapData, viewMode, userCoords, userTolerance, userCertainty, selectedFamilies, hideInactive]);

    const xObj = AXIS_OPTIONS.find(o => o.key === xAxis);
    const yObj = AXIS_OPTIONS.find(o => o.key === yAxis);

    const rawX = xAxis.replace('_avg', '');
    const rawY = yAxis.replace('_avg', '');
    const topFamily = familyMatches?.[0];
    
    const hasFamilyBounds = selectedMode === 'quick' && topFamily?.coordinates?.[rawX] && topFamily?.coordinates?.[rawY];
    const showDefaultBounds = hasFamilyBounds && !activeNode?.isFamily;

    const toggleLegendFilter = (familyName: string) => {
        if (viewMode !== 'denominations') return;
        setSelectedFamilies(prev => 
            prev.includes(familyName) ? prev.filter(f => f !== familyName) : [...prev, familyName]
        );
    };

    if (loading) {
        return <div className="p-10 text-center text-slate-500 animate-pulse">Loading Theological Landscape...</div>;
    }

    // Guard: if the coordinates API returned no rows, show an explicit message
    // instead of a blank chart (e.g. stale local D1 / API error).
    if (rawMapData.length === 0) {
        return (
            <div className="p-10 text-center text-slate-500">
                Could not load the theological landscape. Please check your connection and try again.
            </div>
        );
    }

    return (
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mt-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-6">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h3 className="font-serif text-2xl font-bold text-slate-800">Your Theological Compass</h3>
                        {!isExport && (
                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 ml-4">
                                <button 
                                    onClick={() => setViewMode('families')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'families' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Families
                                </button>
                                <button 
                                    onClick={() => setViewMode('denominations')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'denominations' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Specific Traditions
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="text-sm text-slate-500">
                        {viewMode === 'families' ? 'Hover or tap a family to view its theological range.' : 'A visual projection of specific theological coordinates.'}
                    </p>
                </div>

                {!isExport ? (
                    <div className="flex flex-col gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-700 w-12">Y-Axis:</span>
                            <select className="border border-slate-300 rounded p-1 text-slate-700 w-full md:w-72" value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                                {AXIS_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-700 w-12">X-Axis:</span>
                            <select className="border border-slate-300 rounded p-1 text-slate-700 w-full md:w-72" value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                                {AXIS_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 w-full md:w-auto">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-700 text-sm w-20">Y-Axis:</span>
                            <span className="font-semibold text-slate-900 px-4 py-2.5 bg-white border-2 border-slate-400 rounded-lg shadow-md text-sm max-w-[280px] truncate bg-gradient-to-r from-slate-50 to-white">
                                {yObj?.label || 'Loading...'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-700 text-sm w-20">X-Axis:</span>
                            <span className="font-semibold text-slate-900 px-4 py-2.5 bg-white border-2 border-slate-400 rounded-lg shadow-md text-sm max-w-[280px] truncate bg-gradient-to-r from-slate-50 to-white">
                                {xObj?.label || 'Loading...'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50 relative">
                <ResponsiveContainer width="100%" aspect={1} minHeight={0}>
                    <ScatterChart 
                        margin={isMobile ? { top: 14, right: 8, bottom: 14, left: 8 } : { top: 40, right: 30, bottom: 30, left: 40 }}
                        onClick={() => {
                            if (lockedNode) setLockedNode(null);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" dataKey={xAxis} domain={[0, 100]} reversed={true} hide />
                        <YAxis type="number" dataKey={yAxis} domain={[0, 100]} reversed={true} hide />
                        <ZAxis type="number" dataKey="z" range={[60, 400]} />
                        <Tooltip content={(props) => <CustomTooltip {...props} familyMetaMap={familyMetaMap} />} cursor={{ strokeDasharray: '3 3' }} />
                        
                        {showDefaultBounds && (
                            <ReferenceArea 
                                x1={topFamily.coordinates[rawX].min} x2={topFamily.coordinates[rawX].max}
                                y1={topFamily.coordinates[rawY].min} y2={topFamily.coordinates[rawY].max}
                                fillOpacity={0.10} fill="#3b82f6" stroke="#2563eb" strokeOpacity={0.3} strokeDasharray="3 3"
                            />
                        )}

                        {activeNode?.isFamily && activeNode[`${xAxis}Min`] !== undefined && (
                            <ReferenceArea 
                                x1={activeNode[`${xAxis}Min`]} x2={activeNode[`${xAxis}Max`]}
                                y1={activeNode[`${yAxis}Min`]} y2={activeNode[`${yAxis}Max`]}
                                fillOpacity={0.15} fill={getFamilyColor(activeNode.family, viewMode)} 
                                stroke={getFamilyColor(activeNode.family, viewMode)} strokeOpacity={0.6} strokeDasharray="3 3"
                            />
                        )}

                        <ReferenceLine x={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
                        <ReferenceLine y={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
                        
                        <Scatter 
                            data={chartData} 
                            shape={(props) => <CustomDot {...props} activeNodeName={activeNode?.name} isMobile={isMobile} viewMode={viewMode} />} 
                            isAnimationActive={true} 
                            animationDuration={600} 
                            animationEasing="ease-out"
                            onMouseEnter={(data: any) => {
                                if (data?.payload) setHoveredNode(data.payload);
                            }}
                            onMouseLeave={() => setHoveredNode(null)}
                            onClick={(data: any, index: number, event: any) => {
                                event.stopPropagation();
                                if (data?.payload) {
                                    setLockedNode(lockedNode?.name === data.payload.name ? null : data.payload);
                                }
                            }}
                        />
                    </ScatterChart>
                </ResponsiveContainer>

                <div className="absolute bottom-0.5 sm:bottom-2 left-1 sm:left-16 text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-0.5 sm:px-1 rounded pointer-events-none">{xObj?.minLabel}</div>
                <div className="absolute bottom-0.5 sm:bottom-2 right-0.5 sm:right-4 text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-0.5 sm:px-1 rounded pointer-events-none">{xObj?.maxLabel}</div>
                <div className="absolute top-1 sm:top-15 left-0.5 sm:left-4 text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-0.5 sm:px-1 rounded origin-top-left -rotate-90 translate-y-10 sm:translate-y-20 pointer-events-none">{yObj?.maxLabel}</div>
                <div className="absolute bottom-2 sm:bottom-16 left-0.5 sm:left-8 text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-0.5 sm:px-1 rounded origin-bottom-left -rotate-90 pointer-events-none">{yObj?.minLabel}</div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
                {viewMode === 'denominations' && !isExport && (
                    <p className="text-xs text-slate-500 mb-4 font-medium italic bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md border border-blue-100 text-center">
                        Click on the traditions below to isolate them on the chart.
                    </p>
                )}
                
                <div className="flex items-center gap-2 mb-4 justify-center">
                    <span className="flex items-center gap-1.5 font-bold text-[11px]">
                        <div className="w-4 h-4 rounded-full bg-[#ef4444] border-2 border-[#7f1d1d]"></div>You
                    </span>
                </div>

                {viewMode === 'families' || isExport ? (
                    <div className="flex items-center justify-center gap-x-5 gap-y-2 flex-wrap max-w-2xl mx-auto">
                        {FAMILY_GROUPS.map((group) => {
                            const groupColor = GROUP_COLORS[group.category] || '#64748b';
                            return (
                                <span key={group.category} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: groupColor }}></div>
                                    {group.category}
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-2 max-w-2xl mx-auto">
                        {FAMILY_GROUPS.map((group) => {
                            const groupKey = group.category;
                            const isExpanded = expandedGroups.includes(groupKey) || isExport;
                            const allFamiliesSelected = selectedFamilies.length === 0 || group.families.some(f => selectedFamilies.includes(f));
                            
                            return (
                                <div key={groupKey} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                    <button
                                        onClick={() => {
                                            if (!isExport) {
                                                setExpandedGroups(prev => prev.includes(groupKey) ? prev.filter(g => g !== groupKey) : [...prev, groupKey]);
                                            }
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors ${allFamiliesSelected ? 'text-slate-800 hover:bg-slate-50' : 'text-slate-400'} cursor-pointer`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                            </svg>
                                            {group.category}
                                            <span className="text-[10px] text-slate-400 font-normal ml-2">{group.families.length} traditions</span>
                                        </span>
                                    </button>
                                    
                                    {isExpanded && (
                                        <div className="px-3 pb-2.5 pt-1 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] bg-slate-50/50 border-t border-slate-100">
                                            {group.families.map(famName => {
                                                const famKey = getFamilyKey(famName) || famName;
                                                const color = getFamilyColor(famName);
                                                const isSelected = selectedFamilies.length === 0 || selectedFamilies.includes(famKey);
                                                
                                                return (
                                                    <span
                                                        key={famName}
                                                        onClick={() => toggleLegendFilter(famKey)}
                                                        className={`flex items-center gap-1.5 font-medium whitespace-nowrap transition-opacity duration-200 cursor-pointer hover:opacity-80 ${isSelected ? 'opacity-100' : 'opacity-30'}`}
                                                    >
                                                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                                                        {famName.replace(' / ', '/')}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}