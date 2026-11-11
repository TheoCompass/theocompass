'use client';
import { useState, useEffect, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { FAMILY_COLORS, FAMILY_GROUPS, GROUP_COLORS, FAMILY_TO_GROUP, USER_MARKER_COLOR, USER_MARKER_RING } from '../../lib/taxonomy';
import { INK } from '../../lib/palette';

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
    { key: 'certainty_score', label: 'Conviction: Unsure ↔ Certain', minLabel: 'Unsure', maxLabel: 'Certain', invert: true },
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
    if (!key) return '#556a7e';
    if (viewMode === 'families') {
        const group = FAMILY_TO_GROUP[key];
        return group ? (GROUP_COLORS[group] || '#556a7e') : '#556a7e';
    }
    return FAMILY_COLORS[key] || '#556a7e';
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

    // The user is the only Punch Red mark on the chart, ringed in navy so it
    // stays legible even where a Charismatic family is also red.
    const fill = isUser ? USER_MARKER_COLOR : getFamilyColor(payload.family, viewMode);
    const stroke = isUser ? USER_MARKER_RING : (isActive ? INK.base : '#ffffff');
    const strokeWidth = isUser ? 2.5 : (isActive ? 2 : 1);
    const opacity = isUser ? 1 : (isActive ? 1 : 0.75);

    return (
        <g style={{ cursor: payload.isFamily ? 'pointer' : 'default' }}>
            {isUser && (
                <circle
                    cx={cx} cy={cy} r={r + 4}
                    className="halo-breathe"
                    fill="none" stroke={USER_MARKER_COLOR} strokeWidth={1.5} opacity={0.35}
                />
            )}
            <circle
                cx={cx} cy={cy} r={r}
                fill={fill} stroke={stroke} strokeWidth={strokeWidth} fillOpacity={opacity}
                style={{ transition: 'fill-opacity 0.2s ease' }}
            />
        </g>
    );
};

/**
 * There is no hover tooltip any more.
 *
 * It used to be a 300px panel floating over the plot: on a phone that was most
 * of the chart, and on a desktop it hid the node you were trying to look at.
 * Every node's details now land in one detail card under the plot — hovering
 * previews it, tapping pins it — so the same information arrives at every
 * screen size, in the same place, without covering the data.
 */

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
    /** When true the component drops its own outer card (the panel supplies it). */
    embedded?: boolean;
}

export default function CompassChart({ userCoords, userTolerance, userCertainty = 50, isExport = false, selectedMode = 'quick', familyMatches = [], hideInactive = false, embedded = false }: CompassProps) {
    const rawFamilyMetaMap = useFamilyMeta();
    const familyMetaMap = useMemo(() => rawFamilyMetaMap, [rawFamilyMetaMap]);
    const [rawMapData, setRawMapData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'families' | 'denominations'>('denominations');
    
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

    // Every axis is reversed so that a high value plots on the left, which is where
    // minLabel is drawn (e.g. Theol 95 = Unitarian = "Progressive" on the left).
    // Certainty is the exception: its affirmative pole ("Certain") is a HIGH value,
    // so reversing it would strand the dots opposite their label. Axes flagged
    // `invert` therefore plot unreversed, putting "Certain" and its dots on the right.
    const xReversed = !xObj?.invert;
    const yReversed = !yObj?.invert;

    const rawX = xAxis.replace('_avg', '');
    const rawY = yAxis.replace('_avg', '');
    const topFamily = familyMatches?.[0];
    
    const hasFamilyBounds = selectedMode === 'quick' && topFamily?.coordinates?.[rawX] && topFamily?.coordinates?.[rawY];
    // The box is context, not a selection: it used to disappear the moment a
    // family was hovered (which is also what made an orange square flicker on
    // top of the plot). It stays put now.
    const showDefaultBounds = Boolean(hasFamilyBounds);

    const toggleLegendFilter = (familyName: string) => {
        if (viewMode !== 'denominations') return;
        setSelectedFamilies(prev => 
            prev.includes(familyName) ? prev.filter(f => f !== familyName) : [...prev, familyName]
        );
    };

    if (loading) {
        return <div className="p-10 text-center text-ink-muted animate-pulse">Loading Theological Landscape...</div>;
    }

    // Guard: if the coordinates API returned no rows, show an explicit message
    // instead of a blank chart (e.g. stale local D1 / API error).
    if (rawMapData.length === 0) {
        return (
            <div className="p-10 text-center text-ink-muted">
                Could not load the theological landscape. Please check your connection and try again.
            </div>
        );
    }

    return (
        <div className={`card p-4 md:p-6 ${embedded ? "" : "mt-8"}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-rule pb-6">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h3 className="font-display text-lg text-ink">Theological compass</h3>
                        {!isExport && (
                            <div className="flex border border-rule-strong">
                                <button 
                                    onClick={() => setViewMode('families')}
                                    aria-pressed={viewMode === 'families'}
                                    className={`px-2.5 py-1 text-2xs font-medium transition-colors ${viewMode === 'families' ? 'bg-cerulean-900 text-white' : 'text-ink-muted hover:bg-cerulean-50 hover:text-ink'}`}
                                >
                                    Families
                                </button>
                                <button 
                                    onClick={() => setViewMode('denominations')}
                                    aria-pressed={viewMode === 'denominations'}
                                    className={`px-2.5 py-1 text-2xs font-medium transition-colors ${viewMode === 'denominations' ? 'bg-cerulean-900 text-white' : 'text-ink-muted hover:bg-cerulean-50 hover:text-ink'}`}
                                >
                                    Traditions
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                        {viewMode === 'families'
                            ? 'Hover or tap a cluster to see its theological range.'
                            : 'Every dot is a tradition. The red marker with the halo is you.'}
                    </p>
                </div>

                {!isExport ? (
                    <div className="flex w-full flex-col gap-2 md:w-auto">
                        <label className="flex items-center gap-2">
                            <span className="meta w-12 shrink-0">Y-axis</span>
                            <select className="w-full border border-rule-strong bg-paper-raised px-2 py-1.5 text-xs text-ink md:w-64" value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                                {AXIS_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                            </select>
                        </label>
                        <label className="flex items-center gap-2">
                            <span className="meta w-12 shrink-0">X-axis</span>
                            <select className="w-full border border-rule-strong bg-paper-raised px-2 py-1.5 text-xs text-ink md:w-64" value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                                {AXIS_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                            </select>
                        </label>
                    </div>
                ) : (
                    <div className="flex w-full flex-col gap-2 md:w-auto">
                        <div className="flex items-center justify-between gap-3">
                            <span className="meta w-14 shrink-0">Y-axis</span>
                            <span className="max-w-[280px] truncate border border-rule bg-paper-raised px-3 py-2 text-mini font-semibold text-ink">
                                {yObj?.label || 'Loading...'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="meta w-14 shrink-0">X-axis</span>
                            <span className="max-w-[280px] truncate border border-rule bg-paper-raised px-3 py-2 text-mini font-semibold text-ink">
                                {xObj?.label || 'Loading...'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className={isExport
                ? 'chart-grid relative w-full border border-rule bg-paper'
                : 'chart-grid relative mx-auto h-[18rem] w-full max-w-[54rem] border border-rule bg-paper sm:h-[22rem] md:h-[26rem]'}>
                {/* Adaptive, not square. A fixed square wasted the width of a wide
                    panel and forced a tall, thin window on a phone; the height
                    now steps with the breakpoint. The detail card below is given
                    the identical max-width, so the two always line up. */}
                <ResponsiveContainer width="100%" height={isExport ? 440 : '100%'}>
                    <ScatterChart 
                        margin={isMobile ? { top: 14, right: 8, bottom: 14, left: 8 } : { top: 22, right: 16, bottom: 16, left: 16 }}
                        onClick={() => {
                            if (lockedNode) setLockedNode(null);
                        }}
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#d7e3e0" />
                        <XAxis type="number" dataKey={xAxis} domain={[0, 100]} reversed={xReversed} hide />
                        <YAxis type="number" dataKey={yAxis} domain={[0, 100]} reversed={yReversed} hide />
                        <ZAxis type="number" dataKey="z" range={[60, 400]} />
                        {showDefaultBounds && (
                            <ReferenceArea 
                                x1={topFamily.coordinates[rawX].min} x2={topFamily.coordinates[rawX].max}
                                y1={topFamily.coordinates[rawY].min} y2={topFamily.coordinates[rawY].max}
                                fillOpacity={0.10} fill="#457b9d" stroke="#457b9d" strokeOpacity={0.3} strokeDasharray="3 3"
                            />
                        )}

                        <ReferenceLine x={50} stroke="#b6c9cb" strokeWidth={1.5} strokeDasharray="4 4" />
                        <ReferenceLine y={50} stroke="#b6c9cb" strokeWidth={1.5} strokeDasharray="4 4" />
                        
                        <Scatter 
                            data={chartData} 
                            shape={(props) => <CustomDot {...props} activeNodeName={activeNode?.name} isMobile={isMobile} viewMode={viewMode} />} 
                            isAnimationActive={false}
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

                <div className="absolute bottom-0.5 sm:bottom-1 left-1 sm:left-2 text-4xs sm:text-3xs font-bold uppercase tracking-wide text-ink-muted bg-paper-raised/70 px-0.5 sm:px-1 pointer-events-none">{xObj?.minLabel}</div>
                <div className="absolute bottom-0.5 sm:bottom-1 right-1 sm:right-2 text-4xs sm:text-3xs font-bold uppercase tracking-wide text-ink-muted bg-paper-raised/70 px-0.5 sm:px-1 pointer-events-none">{xObj?.maxLabel}</div>
                <div className="absolute left-2 top-1/4 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-4xs sm:text-3xs font-bold text-ink-muted uppercase tracking-wide bg-paper-raised/70 px-0.5 sm:px-1 pointer-events-none">{yObj?.maxLabel}</div>
                <div className="absolute left-2 top-3/4 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-4xs sm:text-3xs font-bold text-ink-muted uppercase tracking-wide bg-paper-raised/70 px-0.5 sm:px-1 pointer-events-none">{yObj?.minLabel}</div>
            </div>

            {/* One card, every screen size, and always exactly as wide as the
                plot above it. Touch has no hover, and a floating panel covered
                the plot on a desktop; hovering previews here and tapping pins
                it. The height is a floor, not a cap: a long tradition
                description used to be clamped to three lines on a phone. */}
            {!isExport && (
                <div
                    key={activeNode?.name ?? 'empty'}
                    className="mx-auto min-h-[5.5rem] w-full max-w-[54rem] animate-fade-in border-x border-b border-rule bg-paper-raised p-3 sm:min-h-[7rem] sm:p-3.5"
                >
                    {activeNode ? (
                        <>
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 break-words text-mini font-semibold leading-tight text-ink">
                                    {activeNode.name}
                                    {lockedNode && (
                                        <span className="ml-1.5 align-middle text-3xs font-medium uppercase tracking-wide text-ink-muted">
                                            pinned
                                        </span>
                                    )}
                                </p>
                                {lockedNode && (
                                    <button
                                        type="button"
                                        onClick={() => setLockedNode(null)}
                                        aria-label="Close details"
                                        className="shrink-0 border border-rule px-2 py-1 text-2xs text-ink-muted"
                                    >
                                        Close
                                    </button>
                                )}
                            </div>
                            <p className="mt-0.5 text-2xs text-ink-muted">
                                {activeNode.isUser
                                    ? 'Your calculated position'
                                    : activeNode.isFamily
                                    ? `Family average of ${activeNode.count} traditions`
                                    : `${activeNode.family} family`}
                            </p>
                            {(activeNode.isFamily ? familyMetaMap[activeNode.name]?.desc : activeNode.description) && (
                                <p className="mt-1.5 break-words text-2xs leading-relaxed text-ink-soft sm:text-mini">
                                    {activeNode.isFamily ? familyMetaMap[activeNode.name]?.desc : activeNode.description}
                                </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-2 font-mono text-2xs text-ink-muted">
                                <span>{Number(activeNode[xAxis] ?? 0).toFixed(0)} / {Number(activeNode[yAxis] ?? 0).toFixed(0)}</span>
                                {(activeNode.isFamily ? familyMetaMap[activeNode.name]?.region : activeNode.origin) && (
                                    <span>{activeNode.isFamily ? familyMetaMap[activeNode.name]?.region : activeNode.origin}</span>
                                )}
                                {(activeNode.isFamily ? familyMetaMap[activeNode.name]?.century : activeNode.year) && (
                                    <span>{activeNode.isFamily ? familyMetaMap[activeNode.name]?.century : activeNode.year}</span>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-2xs leading-relaxed text-ink-muted">
                            <span className="hidden sm:inline">
                                Hover a tradition to preview it here; click to pin its details.
                            </span>
                            <span className="sm:hidden">Tap a tradition to see its details here.</span>
                        </p>
                    )}
                </div>
            )}

            <div className="mt-8 border-t border-rule pt-6">
                {viewMode === 'denominations' && !isExport && (
                    <p className="mb-3 border border-cerulean-200 bg-cerulean-50 px-3 py-1.5 text-center text-2xs font-medium text-cerulean-800">
                        Click on the traditions below to isolate them on the chart.
                    </p>
                )}
                
                <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
                    <span className="flex items-center gap-1.5 text-2xs font-semibold text-ink">
                        <span aria-hidden="true" className="h-2.5 w-2.5 border-2 border-ink bg-punch" />
                        You
                    </span>
                </div>

                {viewMode === 'families' || isExport ? (
                    <div className="flex items-center justify-center gap-x-5 gap-y-2 flex-wrap max-w-2xl mx-auto">
                        {FAMILY_GROUPS.map((group) => {
                            const groupColor = GROUP_COLORS[group.category] || '#556a7e';
                            return (
                                <span key={group.category} className="flex items-center gap-1.5 text-xs font-medium text-ink-soft whitespace-nowrap">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: groupColor }}></div>
                                    {group.category}
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mx-auto max-w-2xl space-y-1">
                        {FAMILY_GROUPS.map((group) => {
                            const groupKey = group.category;
                            const groupColor = GROUP_COLORS[group.category] || '#556a7e';
                            const isExpanded = expandedGroups.includes(groupKey) || isExport;
                            const allFamiliesSelected = selectedFamilies.length === 0 || group.families.some(f => selectedFamilies.includes(f));
                            
                            return (
                                <div key={groupKey} className="border border-rule overflow-hidden bg-paper-raised">
                                    <button
                                        onClick={() => {
                                            if (!isExport) {
                                                setExpandedGroups(prev => prev.includes(groupKey) ? prev.filter(g => g !== groupKey) : [...prev, groupKey]);
                                            }
                                        }}
                                        className={`flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-xs font-semibold transition-colors ${allFamiliesSelected ? 'text-ink hover:bg-muted-soft' : 'text-ink-muted'} `}
                                    >
                                        <span className="flex items-center gap-2">
                                            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                            </svg>
                                            <span
                                                className="h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: groupColor }}
                                            />
                                            {group.category}
                                            <span className="text-3xs text-ink-muted font-normal ml-2">{group.families.length} traditions</span>
                                        </span>
                                    </button>
                                    
                                    {isExpanded && (
                                        <div className="px-3 pb-2.5 pt-1 flex flex-wrap gap-x-3 gap-y-1.5 text-2xs bg-paper/50 border-t border-rule">
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
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
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
