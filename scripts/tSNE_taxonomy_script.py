import pandas as pd
import numpy as np
from sklearn.manifold import TSNE
import json, base64, os, re
from pathlib import Path
import io

# Create output dir
Path('output').mkdir(exist_ok=True)

# File paths
SCRIPT_DIR = Path(__file__).parent
MATRIX_PATH = SCRIPT_DIR / '../precomputed/pairwise_overall_quick.csv'
EXPORT_PATH = SCRIPT_DIR / '../data/TheoCompass (v2.0) - Denominations & Doctrines_EXPORT.tsv'


# Robust loading of families
try:
    fams = pd.read_csv(SCRIPT_DIR / '../data/TheoCompass (v2.0) - FAMILIES.csv')
except FileNotFoundError:
    fams_csv = """Family_ID,Family_Name,Founded_Century,Region_Origin,Est_Members_Global,Description
FAM_001,African Independent Churches,19th-20th Century,Sub-Saharan Africa,~60-80 million,""
FAM_002,Alternative & Esoteric Movements,19th-20th Century,North America & Europe,<10 million,""
FAM_003,Anabaptism,16th Century,Europe (Switzerland/Germany),~4 million,""
FAM_004,Anglicanism,16th Century,England,~85 million,""
FAM_005,Baptist,17th Century,England & North America,~100 million,""
FAM_006,Catholicism,1st Century,Middle East & Europe (Rome),~1.3 billion,""
FAM_007,Early Christianity & Sects,1st-5th Century,Middle East & Mediterranean,N/A (Historic),""
FAM_008,Eastern & Oriental Orthodoxy,1st Century,Middle East & Eastern Europe,~260 million,""
FAM_009,Evangelicalism,18th Century,Europe (UK) & North America,~300-400 million,""
FAM_010,Gnosticism & Early Heresies,1st-4th Century,Mediterranean & Middle East,N/A (Historic),""
FAM_011,Independent & Modern Movements,20th-21st Century,Global,~50-100 million,""
FAM_012,Lutheranism,16th Century,Germany,~75 million,""
FAM_013,Methodism & Holiness,18th Century,England,~80 million,""
FAM_014,Nontrinitarian & Universalist,16th-19th Century,Europe & North America,<5 million,""
FAM_015,Pentecostalism & Charismatic,20th Century,North America,~600 million,""
FAM_016,Proto-Protestant & Radical Reform,12th-15th Century,Europe,<5 million,""
FAM_017,Quakerism,17th Century,England,~400,000,""
FAM_018,Reformed & Presbyterian,16th Century,Switzerland & Scotland,~80-100 million,""
FAM_019,Restorationist & Primitivist,19th Century,North America,~35-40 million,""
"""
    fams = pd.read_csv(io.StringIO(fams_csv))

# 1. Load Data
sim = pd.read_csv(MATRIX_PATH, index_col=0)
expo = pd.read_csv(EXPORT_PATH, sep='\t')

# 2. t-SNE Coordinates
mat = 100 - sim.values
np.fill_diagonal(mat, 0)
mat = (mat + mat.T) / 2

# We precompute t-SNE here rather than browser because an editor needs a STABLE map.
# If it generated randomly every time, you couldn't rely on spatial memory to edit.
print("Calculating t-SNE coordinates...")
tsne = TSNE(n_components=2, metric='precomputed', init='random', perplexity=15, random_state=42)
coords = tsne.fit_transform(mat)

# 3. Name normalization for robust matching
def norm(s):
    if pd.isna(s): return ''
    s = str(s).lower()
    s = re.sub(r'&', 'and', s)
    s = re.sub(r'[^a-z0-9]+', '', s)
    return s

fam_dict = {norm(row['Family_Name']): row['Family_ID'] for _, row in fams.iterrows()}

# 4. Build Points Array
points = []
for i, denom_id in enumerate(sim.index):
    row = expo[expo['Denomination_ID'] == denom_id]
    if len(row) > 0:
        name = row.iloc[0]['Denomination_Name']
        fam_name = row.iloc[0]['Denomination_Family']
    else:
        name = denom_id
        fam_name = ''
        
    cid = fam_dict.get(norm(fam_name), 'UNASSIGNED')
    
    points.append({
        'id': denom_id,
        'name': str(name).replace('"', "'"),
        'orig_family': str(fam_name).replace('"', "'"),
        'cid': cid,
        'x': float(coords[i, 0]),
        'y': float(coords[i, 1])
    })

# 5. Build Clusters Dictionary
palette = [
    '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#bcbd22','#17becf',
    '#3366cc','#dc3912','#ff9900','#109618','#990099','#0099c6','#dd4477','#66aa00','#b82e2e', '#316395'
]
clusters = {}
for i, row in fams.iterrows():
    clusters[row['Family_ID']] = {
        'id': row['Family_ID'],
        'name': row['Family_Name'],
        'color': palette[i % len(palette)]
    }
clusters['OUTLIER'] = {'id': 'OUTLIER', 'name': 'Standalone Outlier', 'color': '#9ca3af'}
clusters['UNASSIGNED'] = {'id': 'UNASSIGNED', 'name': 'Unassigned', 'color': '#111827'}

# 6. Encode to Base64 to avoid HTML parsing breaks
points_b64 = base64.b64encode(json.dumps(points).encode('utf-8')).decode('utf-8')
clusters_b64 = base64.b64encode(json.dumps(clusters).encode('utf-8')).decode('utf-8')

# 7. Generate HTML
html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TheoCompass Taxonomy Editor (t-SNE)</title>
<script src="https://cdn.plot.ly/plotly-2.32.0.min.js"></script>
<style>
    :root {{ --bg: #f8fafc; --panel: #ffffff; --border: #e2e8f0; --text: #0f172a; --text-muted: #64748b; --primary: #10b981; --primary-hover: #059669; --active-bg: #ecfdf5; }}
    * {{ box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
    body, html {{ margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: var(--bg); color: var(--text); }}
    
    /* Layout */
    .app-container {{ display: flex; width: 100%; height: 100%; }}
    .sidebar-left {{ width: 340px; background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 10; }}
    .main-content {{ flex-grow: 1; position: relative; display: flex; flex-direction: column; }}
    .sidebar-right {{ width: 300px; background: var(--panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; z-index: 10; }}
    
    /* Scrollable areas */
    .scrollable {{ flex-grow: 1; overflow-y: auto; padding: 16px; }}
    .section-title {{ font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-muted); letter-spacing: 0.05em; margin: 16px 0 8px 0; }}
    .section-title:first-child {{ margin-top: 0; }}
    
    /* Typography & Inputs */
    h1 {{ font-size: 18px; margin: 0 0 4px 0; }}
    p.subtitle {{ font-size: 13px; color: var(--text-muted); margin: 0 0 16px 0; line-height: 1.4; }}
    input[type="text"], input[type="search"] {{ width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; }}
    input[type="text"]:focus, input[type="search"]:focus {{ border-color: var(--primary); }}
    
    /* Buttons */
    .btn {{ display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; border: 1px solid var(--border); background: #fff; color: var(--text); transition: all 0.15s; }}
    .btn:hover {{ background: #f1f5f9; }}
    .btn-primary {{ background: var(--primary); color: #fff; border-color: var(--primary); }}
    .btn-primary:hover {{ background: var(--primary-hover); border-color: var(--primary-hover); }}
    .btn-sm {{ padding: 4px 8px; font-size: 12px; }}
    .btn-block {{ width: 100%; margin-bottom: 8px; }}
    .button-row {{ display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }}
    
    /* Cluster Items */
    .cluster-item {{ padding: 10px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s; }}
    .cluster-item.active {{ border-color: var(--primary); background: var(--active-bg); box-shadow: 0 0 0 1px var(--primary); }}
    .cluster-header {{ display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }}
    .color-picker {{ width: 24px; height: 24px; padding: 0; border: none; border-radius: 4px; cursor: pointer; overflow: hidden; }}
    .color-picker::-webkit-color-swatch-wrapper {{ padding: 0; }}
    .color-picker::-webkit-color-swatch {{ border: none; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1); }}
    .cluster-name-input {{ flex-grow: 1; padding: 4px 8px !important; }}
    .cluster-count {{ font-size: 12px; color: var(--text-muted); font-weight: 600; min-width: 24px; text-align: right; }}
    
    /* Toggles & Checkboxes */
    .control-row {{ display: flex; align-items: center; justify-content: space-between; font-size: 13px; padding: 6px 0; }}
    .control-row label {{ display: flex; align-items: center; gap: 8px; cursor: pointer; }}
    
    /* Selection Lists */
    .list-item {{ padding: 8px 10px; font-size: 13px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; }}
    .list-item:hover {{ background: #f1f5f9; }}
    .list-item .item-meta {{ font-size: 11px; color: var(--text-muted); text-align: right; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .list-empty {{ padding: 16px; text-align: center; font-size: 13px; color: var(--text-muted); font-style: italic; }}
    
    /* Plot Area */
    #plotDiv {{ width: 100%; height: 100%; }}
    .plot-tools {{ position: absolute; top: 16px; left: 16px; z-index: 20; display: flex; gap: 8px; background: rgba(255,255,255,0.9); padding: 8px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid var(--border); backdrop-filter: blur(4px); }}
    
    /* Toast */
    #toast {{ position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: #1e293b; color: white; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); opacity: 0; z-index: 1000; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); pointer-events: none; }}
    #toast.show {{ transform: translateX(-50%) translateY(0); opacity: 1; }}
</style>
</head>
<body>

<div class="app-container">
    <!-- LEFT SIDEBAR: Clusters & Tools -->
    <div class="sidebar-left">
        <div style="padding: 16px; border-bottom: 1px solid var(--border); background: #fff;">
            <h1>Taxonomy Editor</h1>
            <p class="subtitle">Powered by <b>t-SNE</b> algorithm.<br>Seeded from <code>TheoCompass-v2.0-FAMILIES.csv</code></p>
            
            <div class="button-row" style="margin-bottom: 0;">
                <button class="btn btn-sm" onclick="undo()" title="Undo (Ctrl+Z)">↶ Undo</button>
                <button class="btn btn-sm" onclick="redo()" title="Redo (Ctrl+Y)">↷ Redo</button>
                <button class="btn btn-sm" onclick="saveStateLocal()">💾 Save Local</button>
                <button class="btn btn-sm" onclick="loadStateLocal()">📂 Load</button>
            </div>
        </div>
        
        <div class="scrollable" id="cluster-container">
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Families / Clusters</span>
                <button class="btn btn-sm" onclick="addNewCluster()">+ New</button>
            </div>
            <div id="cluster-list"></div>
        </div>
        
        <div style="padding: 16px; border-top: 1px solid var(--border); background: #f8fafc;">
            <button class="btn btn-primary btn-block" onclick="exportData('csv')">⬇ Export CSV</button>
            <button class="btn btn-block" onclick="exportData('json')">⬇ Export JSON State</button>
        </div>
    </div>
    
    <!-- MAIN PLOT AREA -->
    <div class="main-content">
        <div class="plot-tools">
            <button class="btn btn-sm" onclick="resetZoom()">⌂ Reset View</button>
            <button class="btn btn-sm" onclick="fitToActive()">⚲ Fit Active</button>
            <div style="width: 1px; background: var(--border); margin: 0 4px;"></div>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="show-labels-chk" onchange="toggleLabels()"> Labels
            </label>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="checkbox" id="dim-others-chk" onchange="renderPlot()"> Dim Inactive
            </label>
        </div>
        <div id="plotDiv"></div>
    </div>
    
    <!-- RIGHT SIDEBAR: Selection & Search -->
    <div class="sidebar-right">
        <div style="padding: 16px; border-bottom: 1px solid var(--border); background: #fff;">
            <div class="section-title" style="margin-top: 0;">Search Denomination</div>
            <div style="display: flex; gap: 8px;">
                <input type="search" id="search-input" placeholder="Type name or ID..." onkeypress="if(event.key === 'Enter') executeSearch()">
                <button class="btn btn-primary" onclick="executeSearch()">Go</button>
            </div>
        </div>
        
        <div class="scrollable">
            <div class="section-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Selected (<span id="sel-count">0</span>)</span>
                <button class="btn btn-sm" onclick="clearSelection()" style="padding: 2px 6px; font-size: 11px;">Clear</button>
            </div>
            
            <div class="button-row">
                <button class="btn btn-primary btn-block" style="margin-bottom: 4px;" onclick="assignSelectedToActive()">
                    Assign to Active
                </button>
                <button class="btn btn-block" style="margin-bottom: 0;" onclick="isolateSelectedToNew()">
                    Move to New Cluster
                </button>
            </div>
            
            <div style="border: 1px solid var(--border); border-radius: 6px; background: #fff; overflow: hidden;">
                <div id="selection-list">
                    <div class="list-empty">Use Lasso tool or click points to select denominations.</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 24px;">Stats</div>
            <div style="font-size: 13px; line-height: 1.6; color: var(--text-muted);">
                <div>Total Points: <b id="stat-total" style="color: var(--text)"></b></div>
                <div>Unassigned: <b id="stat-unassigned" style="color: var(--text)"></b></div>
                <div>Outliers: <b id="stat-outliers" style="color: var(--text)"></b></div>
            </div>
        </div>
    </div>
</div>

<div id="toast">Message</div>

<script>
    // 1. Data Initialization (Base64 decoded)
    const pointsRaw = JSON.parse(decodeURIComponent(escape(atob("{points_b64}"))));
    const clustersRaw = JSON.parse(decodeURIComponent(escape(atob("{clusters_b64}"))));
    
    // State Application
    let points = pointsRaw.map(p => ({{...p}}));
    let clusters = JSON.parse(JSON.stringify(clustersRaw));
    
    // State Control
    let activeCid = 'FAM_001'; // Default active
    if(!clusters[activeCid]) activeCid = Object.keys(clusters)[0];
    
    let selectedIds = new Set();
    let history = [];
    let future = [];
    let showLabels = false;

    // Toast Notification
    let toastTimeout;
    function showToast(msg) {{
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => el.classList.remove('show'), 2500);
    }}

    // State History for Undo/Redo
    function saveHistory() {{
        history.push({{
            points: points.map(p => ({{...p}})),
            clusters: JSON.parse(JSON.stringify(clusters)),
            activeCid: activeCid
        }});
        if(history.length > 50) history.shift();
        future = []; // Clear redo stack on new action
    }}

    function undo() {{
        if(history.length === 0) return showToast("Nothing to undo.");
        future.push({{
            points: points.map(p => ({{...p}})),
            clusters: JSON.parse(JSON.stringify(clusters)),
            activeCid: activeCid
        }});
        restoreState(history.pop());
        showToast("Undo applied");
    }}

    function redo() {{
        if(future.length === 0) return showToast("Nothing to redo.");
        history.push({{
            points: points.map(p => ({{...p}})),
            clusters: JSON.parse(JSON.stringify(clusters)),
            activeCid: activeCid
        }});
        restoreState(future.pop());
        showToast("Redo applied");
    }}

    function restoreState(state) {{
        points = state.points.map(p => ({{...p}}));
        clusters = JSON.parse(JSON.stringify(state.clusters));
        activeCid = state.activeCid;
        updateUI(false); // Update without resetting zoom
    }}

    // Local Storage (Using a different key so it doesn't overwrite the MDS save)
    function saveStateLocal() {{
        const payload = JSON.stringify({{ points, clusters, activeCid }});
        localStorage.setItem('theo_tax_tsne_state', payload);
        showToast("State saved to browser storage.");
    }}

    function loadStateLocal() {{
        const payload = localStorage.getItem('theo_tax_tsne_state');
        if(!payload) return showToast("No saved state found.");
        saveHistory();
        restoreState(JSON.parse(payload));
        showToast("State loaded from browser.");
    }}

    // Rendering UI
    function updateUI(resetZoom = false) {{
        renderSidebar();
        renderSelection();
        renderStats();
        renderPlot(resetZoom);
    }}

    function renderSidebar() {{
        const container = document.getElementById('cluster-list');
        container.innerHTML = '';
        
        // Calculate counts
        const counts = {{}};
        points.forEach(p => counts[p.cid] = (counts[p.cid] || 0) + 1);
        
        // Sort clusters (Outlier/Unassigned at bottom)
        const sortedKeys = Object.keys(clusters).sort((a, b) => {{
            if(a === 'OUTLIER' || a === 'UNASSIGNED') return 1;
            if(b === 'OUTLIER' || b === 'UNASSIGNED') return -1;
            return clusters[a].name.localeCompare(clusters[b].name);
        }});
        
        sortedKeys.forEach(cid => {{
            const c = clusters[cid];
            const isActive = activeCid === cid;
            
            const div = document.createElement('div');
            div.className = `cluster-item ${{isActive ? 'active' : ''}}`;
            
            div.innerHTML = `
                <div class="cluster-header">
                    <input type="color" class="color-picker" value="${{c.color}}" onchange="updateClusterColor('${{cid}}', this.value)">
                    <button class="btn btn-sm ${{isActive ? 'btn-primary' : ''}}" style="flex-grow:0; padding: 4px 6px;" onclick="setActiveCluster('${{cid}}')">
                        ${{isActive ? '✓ Active' : 'Select'}}
                    </button>
                    <div class="cluster-count">${{counts[cid] || 0}}</div>
                </div>
                <div>
                    <input type="text" class="cluster-name-input" value="${{c.name}}" onchange="updateClusterName('${{cid}}', this.value)" placeholder="Cluster Name">
                </div>
            `;
            container.appendChild(div);
        }});
    }}

    function renderStats() {{
        document.getElementById('stat-total').innerText = points.length;
        document.getElementById('stat-unassigned').innerText = points.filter(p => p.cid === 'UNASSIGNED').length;
        document.getElementById('stat-outliers').innerText = points.filter(p => p.cid === 'OUTLIER').length;
    }}

    function renderSelection() {{
        document.getElementById('sel-count').innerText = selectedIds.size;
        const container = document.getElementById('selection-list');
        
        if(selectedIds.size === 0) {{
            container.innerHTML = '<div class="list-empty">Use Lasso tool or click points to select denominations.</div>';
            return;
        }}
        
        container.innerHTML = '';
        // Render max 100 items to avoid DOM lag
        const selArray = Array.from(selectedIds).slice(0, 100);
        
        selArray.forEach(id => {{
            const p = points.find(pt => pt.id === id);
            if(!p) return;
            const cName = clusters[p.cid] ? clusters[p.cid].name : p.cid;
            
            const div = document.createElement('div');
            div.className = 'list-item';
            div.onclick = () => focusPoint(p.id);
            div.innerHTML = `
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">${{p.name}}</div>
                <div class="item-meta">${{cName}}</div>
            `;
            container.appendChild(div);
        }});
        
        if(selectedIds.size > 100) {{
            const div = document.createElement('div');
            div.className = 'list-empty';
            div.innerText = `...and ${{selectedIds.size - 100}} more`;
            container.appendChild(div);
        }}
    }}

    // Interaction Functions
    function setActiveCluster(cid) {{
        activeCid = cid;
        updateUI(false);
    }}

    function updateClusterColor(cid, color) {{
        saveHistory();
        clusters[cid].color = color;
        renderPlot(false);
    }}

    function updateClusterName(cid, name) {{
        saveHistory();
        clusters[cid].name = name;
        renderPlot(false);
        renderSelection();
    }}

    function addNewCluster() {{
        saveHistory();
        const newId = 'CUSTOM_' + Math.random().toString(36).substr(2, 6).toUpperCase();
        clusters[newId] = {{
            id: newId,
            name: 'New Custom Cluster',
            color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
        }};
        activeCid = newId;
        updateUI(false);
        // Scroll sidebar to bottom
        const container = document.getElementById('cluster-container');
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }}

    function assignSelectedToActive() {{
        if(selectedIds.size === 0) return showToast("No points selected.");
        saveHistory();
        
        points.forEach(p => {{
            if(selectedIds.has(p.id)) {{
                p.cid = activeCid;
            }}
        }});
        
        selectedIds.clear();
        Plotly.restyle('plotDiv', {{selectedpoints: [null]}}); // clear plotly selection
        updateUI(false);
        showToast(`Assigned to ${{clusters[activeCid].name}}`);
    }}

    function isolateSelectedToNew() {{
        if(selectedIds.size === 0) return showToast("No points selected.");
        saveHistory();
        
        const newId = 'CUSTOM_' + Math.random().toString(36).substr(2, 6).toUpperCase();
        clusters[newId] = {{
            id: newId,
            name: 'Extracted Cluster',
            color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
        }};
        activeCid = newId;
        
        points.forEach(p => {{
            if(selectedIds.has(p.id)) {{
                p.cid = newId;
            }}
        }});
        
        selectedIds.clear();
        Plotly.restyle('plotDiv', {{selectedpoints: [null]}});
        updateUI(false);
        showToast("Created new cluster with selection.");
    }}

    function clearSelection() {{
        selectedIds.clear();
        Plotly.restyle('plotDiv', {{selectedpoints: [null]}});
        renderSelection();
    }}

    function toggleLabels() {{
        showLabels = document.getElementById('show-labels-chk').checked;
        renderPlot(false);
    }}

    // Plotly Rendering
    function renderPlot(resetZoom = false) {{
        const dimOthers = document.getElementById('dim-others-chk').checked;
        const traces = [];
        
        // Group points by cluster
        const grouped = {{}};
        points.forEach(p => {{
            if(!grouped[p.cid]) grouped[p.cid] = [];
            grouped[p.cid].push(p);
        }});
        
        // Build traces ensuring consistent order for colors
        Object.keys(clusters).forEach(cid => {{
            const group = grouped[cid] || [];
            if(group.length === 0 && cid !== activeCid) return; // Keep active even if empty for legend logic if needed
            
            const isDimmed = dimOthers && cid !== activeCid;
            
            traces.push({{
                x: group.map(p => p.x),
                y: group.map(p => p.y),
                text: group.map(p => p.name),
                customdata: group.map(p => p.id),
                mode: showLabels ? 'markers+text' : 'markers',
                textposition: 'top center',
                name: clusters[cid].name,
                marker: {{
                    size: cid === 'OUTLIER' ? 10 : 14,
                    symbol: cid === 'OUTLIER' ? 'x' : 'circle',
                    color: clusters[cid].color,
                    opacity: isDimmed ? 0.2 : 0.9,
                    line: {{ color: '#fff', width: 1 }}
                }},
                textfont: {{ size: 10, color: '#475569' }},
                hovertemplate: '<b>%{{text}}</b><br>ID: %{{customdata}}<extra></extra>'
            }});
        }});
        
        const layout = {{
            margin: {{t: 30, r: 30, b: 30, l: 30}},
            hovermode: 'closest',
            dragmode: 'lasso',
            showlegend: false,
            plot_bgcolor: 'transparent',
            paper_bgcolor: 'transparent',
            xaxis: {{ visible: false }},
            yaxis: {{ visible: false, scaleanchor: 'x', scaleratio: 1 }},
            uirevision: resetZoom ? Math.random().toString() : 'persistent-zoom' // MAGIC: Keeps zoom stable unless forced
        }};
        
        const config = {{
            displayModeBar: true,
            modeBarButtonsToRemove: ['autoScale2d'],
            displaylogo: false,
            responsive: true
        }};
        
        Plotly.react('plotDiv', traces, layout, config).then(() => {{
            // Attach events only once
            const plotDiv = document.getElementById('plotDiv');
            if(!plotDiv._hasEvents) {{
                plotDiv.on('plotly_click', (data) => {{
                    if(data.points.length > 0) {{
                        const ptId = data.points[0].customdata;
                        // Single click auto-assigns to active
                        saveHistory();
                        points.find(p => p.id === ptId).cid = activeCid;
                        updateUI(false);
                        showToast(`Point assigned to ${{clusters[activeCid].name}}`);
                    }}
                }});
                
                plotDiv.on('plotly_selected', (data) => {{
                    selectedIds.clear();
                    if(data && data.points) {{
                        data.points.forEach(pt => selectedIds.add(pt.customdata));
                    }}
                    renderSelection();
                }});
                
                plotDiv._hasEvents = true;
            }}
        }});
    }}

    // Navigation & View
    function resetZoom() {{
        renderPlot(true);
    }}

    function fitToActive() {{
        const activePts = points.filter(p => p.cid === activeCid);
        if(activePts.length === 0) return showToast("Active cluster is empty.");
        
        const xs = activePts.map(p => p.x);
        const ys = activePts.map(p => p.y);
        
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        
        const padX = (xMax - xMin) * 0.1 || 5;
        const padY = (yMax - yMin) * 0.1 || 5;
        
        Plotly.relayout('plotDiv', {{
            'xaxis.range': [xMin - padX, xMax + padX],
            'yaxis.range': [yMin - padY, yMax + padY]
        }});
    }}

    function focusPoint(id) {{
        const p = points.find(pt => pt.id === id);
        if(!p) return;
        Plotly.relayout('plotDiv', {{
            'xaxis.range': [p.x - 10, p.x + 10],
            'yaxis.range': [p.y - 10, p.y + 10]
        }});
    }}

    function executeSearch() {{
        const q = document.getElementById('search-input').value.toLowerCase().trim();
        if(!q) return;
        
        const match = points.find(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
        if(match) {{
            selectedIds.clear();
            selectedIds.add(match.id);
            renderSelection();
            focusPoint(match.id);
            Plotly.restyle('plotDiv', {{selectedpoints: [null]}}); 
        }} else {{
            showToast("No denomination found matching query.");
        }}
    }}

    // Export Data
    function exportData(type) {{
        let dataStr = '';
        let mime = '';
        let filename = '';
        
        if(type === 'csv') {{
            const rows = [['Denomination_ID', 'Denomination_Name', 'Original_Family', 'Assigned_Cluster_ID', 'Assigned_Cluster_Name', 'tSNE_X', 'tSNE_Y']];
            points.forEach(p => {{
                const cName = clusters[p.cid] ? clusters[p.cid].name : p.cid;
                rows.push([
                    p.id,
                    `"${{p.name.replace(/"/g, '""')}}"`,
                    `"${{p.orig_family.replace(/"/g, '""')}}"`,
                    p.cid,
                    `"${{cName.replace(/"/g, '""')}}"`,
                    p.x.toFixed(4),
                    p.y.toFixed(4)
                ]);
            }});
            dataStr = rows.map(r => r.join(',')).join('\\n');
            mime = 'text/csv;charset=utf-8;';
            filename = 'TheoCompass_tSNE_Taxonomy_Export.csv';
        }} else if (type === 'json') {{
            dataStr = JSON.stringify({{ clusters, points }}, null, 2);
            mime = 'application/json;charset=utf-8;';
            filename = 'TheoCompass_tSNE_Taxonomy_State.json';
        }}
        
        const blob = new Blob([dataStr], {{ type: mime }});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }}

    // Keyboard Shortcuts
    document.addEventListener('keydown', function(e) {{
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.ctrlKey || e.metaKey) {{
            if (e.key === 'z') {{
                e.preventDefault();
                undo();
            }} else if (e.key === 'y') {{
                e.preventDefault();
                redo();
            }}
        }}
    }});

    // Init
    updateUI(true);
    showToast("t-SNE Map Loaded!");

</script>
</body>
</html>
"""

out_path = 'output/TheoCompass_tSNE_Taxonomist.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"✅ Generated final t-SNE taxonomy editor: {out_path}")