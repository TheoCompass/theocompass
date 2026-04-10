'use client';
import { useState, useEffect, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';

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
];

const FAMILY_COLORS: Record<string, string> = {
    'African Independent Churches': '#84cc16', 
    'Alternative Esoteric Movements': '#c084fc', 
    'Anabaptism': '#14b8a6', 
    'Anglicanism': '#8b5cf6', 
    'Baptist': '#10b981', 
    'Catholicism': '#eab308', 
    'Early Christianity Sects': '#b45309', 
    'Eastern Oriental Orthodoxy': '#d97706', 
    'Evangelicalism': '#059669', 
    'Gnosticism Early Heresies': '#9333ea', 
    'Independent Modern Movements': '#0ea5e9', 
    'Lutheranism': '#6366f1', 
    'Methodism Holiness': '#f97316', 
    'Nontrinitarian Universalist': '#f472b6', 
    'Pentecostalism Charismatic': '#ef4444', 
    'Proto-Protestant Radical Reform': '#ea580c', 
    'Quakerism': '#a8a29e', 
    'Reformed Presbyterian': '#3b82f6', 
    'Restorationist Primitivist': '#ec4899', 
};

const FAMILY_METADATA: Record<string, { century: string, region: string, members: string, desc: string }> = {
    'African Independent Churches': { century: '19th-20th Century', region: 'Sub-Saharan Africa', members: '60-80 million', desc: 'Indigenous African Christian movements operating independently of Western missionary churches, emphasizing cultural integration and charismatic worship.' },
    'Alternative Esoteric Movements': { century: '19th-20th Century', region: 'North America / Europe', members: '10 million+', desc: 'Syncretic groups drawing on Christian themes but significantly departing from orthodox theology, sometimes incorporating New Age concepts.' },
    'Anabaptism': { century: '16th Century', region: 'Switzerland / Germany', members: '4 million', desc: 'Radical Reformation movements emphasizing believer\'s baptism, non-violence, and strict separation of church and state.' },
    'Anglicanism': { century: '16th Century', region: 'England', members: '85 million', desc: 'Western tradition evolving from the English Reformation, historically seeking a via media (middle way) between Protestant theology and Catholic liturgy.' },
    'Baptist': { century: '17th Century', region: 'England / N. America', members: '100 million+', desc: 'Protestant tradition emphasizing believer\'s baptism by immersion, congregational autonomy, and the ultimate authority of Scripture.' },
    'Catholicism': { century: '1st Century', region: 'Middle East / Rome', members: '1.3 billion', desc: 'The largest Christian tradition, tracing origins to the apostles, characterized by papal primacy, sacramental theology, and episcopal succession.' },
    'Early Christianity Sects': { century: '1st-5th Century', region: 'Mediterranean', members: 'Historic', desc: 'The foundational centuries of the Christian church, encompassing the proto-orthodox mainstream and various early sectarian groups.' },
    'Eastern Oriental Orthodoxy': { century: '1st Century', region: 'Eastern Europe / Mid East', members: '260 million', desc: 'Ancient traditions emphasizing holy tradition, conciliarity, mysteries (sacraments), and maintaining unbroken apostolic succession.' },
    'Evangelicalism': { century: '18th Century', region: 'UK / North America', members: '300-400 million', desc: 'Trans-denominational Protestant movement emphasizing the authority of the Bible, the necessity of personal conversion, and active evangelism.' },
    'Gnosticism Early Heresies': { century: '1st-4th Century', region: 'Mediterranean', members: 'Historic', desc: 'Early esoteric movements emphasizing secret knowledge (gnosis) for salvation, definitively rejected by early orthodox Christianity.' },
    'Independent Modern Movements': { century: '20th-21st Century', region: 'Global', members: '50-100 million', desc: 'Non-denominational or regionally specific modern churches operating outside traditional historical categories and governance.' },
    'Lutheranism': { century: '16th Century', region: 'Germany', members: '75 million', desc: 'A major branch of Western Christianity identifying with the theology of Martin Luther, emphasizing justification by grace alone through faith alone.' },
    'Methodism Holiness': { century: '18th Century', region: 'England', members: '80 million', desc: 'Protestant movement originating with John Wesley, known for its emphasis on personal sanctification, Arminian theology, and methodical living.' },
    'Nontrinitarian Universalist': { century: '16th-19th Century', region: 'Europe / N. America', members: '5 million+', desc: 'Groups rejecting the orthodox doctrine of the Trinity or embracing eventual salvation of all souls, prioritizing progressive theology.' },
    'Pentecostalism Charismatic': { century: '20th Century', region: 'North America', members: '600 million+', desc: 'Highly dynamic movements emphasizing the direct, personal experience of God through baptism in the Holy Spirit and spiritual gifts.' },
    'Proto-Protestant Radical Reform': { century: '12th-15th Century', region: 'Europe', members: '5 million+', desc: 'Pre-Reformation movements and medieval radical groups that challenged centralized Catholic authority, doctrines, and wealth.' },
    'Quakerism': { century: '17th Century', region: 'England', members: '400,000', desc: 'A movement emphasizing the Inner Light or direct inward experience of God, traditionally practicing unprogrammed worship and pacifism.' },
    'Reformed Presbyterian': { century: '16th Century', region: 'Switzerland / Scotland', members: '80-100 million', desc: 'Protestant traditions rooted in the theology of John Calvin, emphasizing God\'s sovereignty and covenant theology.' },
    'Restorationist Primitivist': { century: '19th Century', region: 'North America', members: '35-40 million', desc: 'Movements seeking to bypass historical traditions to restore original, first-century Christianity, sometimes producing new scriptures.' }
};

const getFamilyKey = (family: string) => {
    if (!family) return null;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const normalizedInput = normalize(family);
    
    const key = Object.keys(FAMILY_COLORS).find(k => normalize(k) === normalizedInput);
    if (key) return key;

    const fallbackKey = Object.keys(FAMILY_COLORS).find(k => normalizedInput.includes(normalize(k.split(' ')[0])));
    return fallbackKey || null;
};

const getFamilyColor = (family: string) => {
    const key = getFamilyKey(family);
    return key ? FAMILY_COLORS[key] : '#64748b';
};

const getFamilyMeta = (family: string) => {
    const key = getFamilyKey(family);
    return key ? FAMILY_METADATA[key] : null;
};

const CustomDot = (props: any) => {
    const { cx, cy, payload, activeNodeName } = props;
    if (!cx || !cy) return null;

    const isUser = payload.isUser;
    const isActive = activeNodeName === payload.name;
    
    let r = 5;
    if (isUser) r = isActive ? 10 : 8;
    else if (payload.isFamily) r = isActive ? 9 : 7;
    else r = isActive ? 7 : 5;

    const fill = isUser ? '#ef4444' : getFamilyColor(payload.family);
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

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        
        // Fetch family meta if it's a family node
        const meta = data.isFamily ? getFamilyMeta(data.name) : null;

        return (
            <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700 text-sm max-w-[320px] w-[320px] z-50 relative pointer-events-none">
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
    isExport?: boolean;
    selectedMode?: string | null;
    familyMatches?: any[];
}

export default function CompassChart({ userCoords, userTolerance, isExport = false, selectedMode = 'quick', familyMatches = [] }: CompassProps) {
    const [rawMapData, setRawMapData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'families' | 'denominations'>('families');
    
    const [xAxis, setXAxis] = useState('theol_cons_lib_avg');
    const [yAxis, setYAxis] = useState('liturg_spont_avg');

    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [lockedNode, setLockedNode] = useState<any>(null);
    const activeNode = lockedNode || hoveredNode;

    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);

    useEffect(() => {
        setHoveredNode(null);
        setLockedNode(null);
        setSelectedFamilies([]); 
    }, [viewMode]);

    useEffect(() => {
        async function fetchLandscape() {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
                const coordRes = await fetch(apiUrl + '/api/coordinates');
                const rawCoords = await coordRes.json();
                setRawMapData(rawCoords);
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

        const formattedData = rawMapData.map((coordRow: any) => ({
            ...coordRow,
            name: coordRow.name || coordRow.denomination_id,
            family: coordRow.family || 'Tradition',
            origin: coordRow.origin || '',
            year: coordRow.year || '',
            isUser: false
        }));

        const mergedMap = new Map();
        formattedData.forEach((item: any) => {
            if (mergedMap.has(item.name)) {
                const existing = mergedMap.get(item.name);
                AXIS_OPTIONS.forEach(axis => {
                    if (item[axis.key] !== undefined && item[axis.key] !== null) {
                        existing.sums[axis.key] = (existing.sums[axis.key] || 0) + Number(item[axis.key]);
                    }
                });
                existing.count += 1;
            } else {
                const initialSums: Record<string, number> = {};
                AXIS_OPTIONS.forEach(axis => {
                    if (item[axis.key] !== undefined && item[axis.key] !== null) {
                        initialSums[axis.key] = Number(item[axis.key]);
                    }
                });
                mergedMap.set(item.name, { ...item, sums: initialSums, count: 1 });
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

        let finalBackgroundData = cleanData;

        if (viewMode === 'families') {
            const familyGroups = new Map();
            cleanData.forEach((item: any) => {
                const fam = item.family || 'Unknown';
                if (!familyGroups.has(fam)) {
                    familyGroups.set(fam, { ...item, name: fam, isFamily: true, count: 0, sums: {}, values: {} });
                }
                const group = familyGroups.get(fam);
                group.count += 1;
                
                AXIS_OPTIONS.forEach(opt => {
                    if (item[opt.key] !== undefined && item[opt.key] !== null) {
                        const val = Number(item[opt.key]);
                        group.sums[opt.key] = (group.sums[opt.key] || 0) + val;
                        if (!group.values[opt.key]) group.values[opt.key] = [];
                        group.values[opt.key].push(val);
                    }
                });
            });

            finalBackgroundData = Array.from(familyGroups.values()).map((group: any) => {
                const averaged = { ...group };
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

        const userPoint = {
            id: 'USER',
            name: 'You Are Here',
            family: 'Your Profile',
            isUser: true,
            z: 200,
            ...AXIS_OPTIONS.reduce((acc, opt) => {
                const rawKey = opt.key.replace('_avg', '').replace(/_/g, '');
                acc[opt.key] = rawKey === 'tolerancescore' ? userTolerance : (userCoords[rawKey] || 50);
                return acc;
            }, {} as Record<string, number>)
        };

        const compiledData = [...finalBackgroundData, userPoint];
        if (viewMode === 'denominations' && selectedFamilies.length > 0) {
            return compiledData.filter(d => d.isUser || selectedFamilies.includes(getFamilyKey(d.family) || ''));
        }
        return compiledData;

    }, [rawMapData, viewMode, userCoords, userTolerance, selectedFamilies]);

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

    return (
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mt-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-6">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h3 className="font-serif text-2xl font-bold text-slate-800">Your Theological Compass</h3>
                        {!isExport && (
                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 ml-4 hidden sm:flex">
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
                        margin={{ top: 40, right: 30, bottom: 30, left: 40 }}
                        onClick={() => {
                            if (lockedNode) setLockedNode(null);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" dataKey={xAxis} domain={[0, 100]} reversed={true} hide />
                        <YAxis type="number" dataKey={yAxis} domain={[0, 100]} reversed={true} hide />
                        <ZAxis type="number" dataKey="z" range={[60, 400]} />
                        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                        
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
                                fillOpacity={0.15} fill={getFamilyColor(activeNode.family)} 
                                stroke={getFamilyColor(activeNode.family)} strokeOpacity={0.6} strokeDasharray="3 3"
                            />
                        )}

                        <ReferenceLine x={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
                        <ReferenceLine y={50} stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
                        
                        <Scatter 
                            data={chartData} 
                            shape={(props) => <CustomDot {...props} activeNodeName={activeNode?.name} />} 
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

                <div className="absolute bottom-2 left-16 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded pointer-events-none">{xObj?.minLabel}</div>
                <div className="absolute bottom-2 right-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded pointer-events-none">{xObj?.maxLabel}</div>
                <div className="absolute top-15 left-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded origin-top-left -rotate-90 translate-y-20 pointer-events-none">{yObj?.maxLabel}</div>
                <div className="absolute bottom-16 left-8 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-white/70 px-1 rounded origin-bottom-left -rotate-90 pointer-events-none">{yObj?.minLabel}</div>
            </div>

            <div className="mt-8 flex flex-col items-center border-t border-slate-100 pt-6">
                {viewMode === 'denominations' && !isExport && (
                    <p className="text-xs text-slate-500 mb-4 font-medium italic bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md border border-blue-100">
                        Click on the traditions below to isolate them on the chart.
                    </p>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-3 text-[11px] justify-center text-slate-700 max-w-4xl mx-auto">
                    <span className="flex items-center gap-1.5 font-bold">
                        <div className="w-4 h-4 rounded-full bg-[#ef4444] border-2 border-[#7f1d1d]"></div>You
                    </span>
                    {Object.entries(FAMILY_COLORS).map(([name, color]) => {
                        const isSelected = selectedFamilies.length === 0 || selectedFamilies.includes(name);
                        return (
                            <span 
                                key={name} 
                                onClick={() => toggleLegendFilter(name)}
                                className={`flex items-center gap-1.5 font-medium whitespace-nowrap transition-opacity duration-200 ${viewMode === 'denominations' && !isExport ? 'cursor-pointer hover:opacity-80' : ''} ${isSelected ? 'opacity-100' : 'opacity-30'}`}
                            >
                                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                                {name.replace(' / ', '/')}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}