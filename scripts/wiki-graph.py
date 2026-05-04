#!/usr/bin/env python3
"""
Wiki-Graph-Generator für ShieldPM.

Liest alle .md-Dateien unter docs/wiki-intern/, extrahiert relative Markdown-
Links (z.B. [Text](./pfad.md), [Text](../pfad.md)) und erzeugt eine eigenständige,
interaktive HTML-Datei (vis-network via CDN), die das Wiki als Netzwerk darstellt.

Aufruf:
    python3 scripts/wiki-graph.py            # nutzt docs/wiki-intern/
    python3 scripts/wiki-graph.py docs/wiki  # anderes Wiki

Ausgabe:
    docs/wiki-intern/wiki-graph.html
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r"\[([^\]]+)\]\((\.{1,2}/[^)]+\.md)\)")

# Farben pro Top-Ordner. Andere/unbekannte Ordner erhalten den letzten Eintrag.
FOLDER_COLORS = {
    "module": "#60a5fa",
    "architektur": "#f97316",
    "api": "#a855f7",
    "daten": "#10b981",
    "konfiguration": "#eab308",
    "entwicklung": "#ec4899",
    "ui": "#14b8a6",
    "verwaltung": "#ef4444",
    "entscheidungen": "#8b5cf6",
    "features": "#22d3ee",
    "projekt": "#f59e0b",
    "_root": "#94a3b8",
    "_other": "#cbd5e1",
}


def find_markdown(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.md") if p.is_file())


def category_for(rel_path: Path) -> str:
    parts = rel_path.parts
    if len(parts) == 1:
        return "_root"
    return parts[0] if parts[0] in FOLDER_COLORS else "_other"


def short_label(rel_path: Path) -> str:
    name = rel_path.stem
    if name == "README" or name == "index":
        return f"{rel_path.parent.name or 'index'}/{name}"
    return name


def build_graph(root: Path):
    files = find_markdown(root)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    indegree: dict[str, int] = {}

    for md in files:
        rel = md.relative_to(root)
        node_id = str(rel).replace(os.sep, "/")
        cat = category_for(rel)
        nodes[node_id] = {
            "id": node_id,
            "label": short_label(rel),
            "title": node_id,
            "group": cat,
            "color": FOLDER_COLORS[cat],
            "outgoing": 0,
        }
        indegree.setdefault(node_id, 0)

    for md in files:
        rel = md.relative_to(root)
        src_id = str(rel).replace(os.sep, "/")
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        for _label, link in LINK_RE.findall(text):
            target = (md.parent / link).resolve()
            try:
                t_rel = target.relative_to(root.resolve())
            except ValueError:
                # Link zeigt aus dem Wiki heraus — überspringen
                continue
            tgt_id = str(t_rel).replace(os.sep, "/")
            if tgt_id not in nodes:
                # Defekter Link — als grauer Knoten anlegen
                nodes[tgt_id] = {
                    "id": tgt_id,
                    "label": tgt_id + " (?)",
                    "title": "Defekter Link: " + tgt_id,
                    "group": "_other",
                    "color": "#fee2e2",
                    "outgoing": 0,
                }
                indegree.setdefault(tgt_id, 0)
            edges.append({"from": src_id, "to": tgt_id})
            nodes[src_id]["outgoing"] += 1
            indegree[tgt_id] = indegree.get(tgt_id, 0) + 1

    for nid, n in nodes.items():
        deg = indegree.get(nid, 0)
        # Größe abhängig von eingehenden Links (gewichtet)
        n["value"] = max(deg, 1)
        # HTML-Tooltip mit <br> – funktioniert robust unabhängig von innerText/innerHTML.
        n["title"] = (
            f"<b>{nid}</b><br>"
            f"<span style='color:#8a98b3'>Eingehend:</span> {deg} · "
            f"<span style='color:#8a98b3'>Ausgehend:</span> {n['outgoing']}"
        )

    return list(nodes.values()), edges


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang=\"de\">
<head>
<meta charset=\"utf-8\">
<title>ShieldPM — Wiki-Graph</title>
<script>__VIS_NETWORK_JS__</script>
<style>
  :root {
    --bg-0: #0b1220;
    --bg-1: #111a2e;
    --bg-2: #182238;
    --line: #1e2a44;
    --line-2: #2a3a5c;
    --text: #e6edf7;
    --text-mute: #8a98b3;
    --accent: #7dd3fc;
    --accent-warm: #fb923c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: var(--bg-0); color: var(--text); font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; overflow: hidden; -webkit-font-smoothing: antialiased; }
  #app { display: grid; grid-template-columns: 1fr 320px; grid-template-rows: auto 1fr; height: 100vh; width: 100vw; gap: 0; }
  /* === Header === */
  header {
    grid-column: 1 / -1;
    background: linear-gradient(180deg, #14203a 0%, #0e172b 100%);
    border-bottom: 1px solid var(--line);
    padding: 14px 22px;
    display: flex; gap: 22px; align-items: center; flex-wrap: wrap;
  }
  header .brand { display: flex; flex-direction: column; gap: 2px; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: 0.2px; }
  header .stats { font-size: 12px; color: var(--text-mute); }
  header .spacer { flex: 1; }
  .search { position: relative; }
  .search input {
    background: var(--bg-1); color: var(--text); border: 1px solid var(--line-2);
    border-radius: 8px; padding: 8px 12px 8px 32px; font-size: 13px; width: 240px;
    transition: border-color .15s, box-shadow .15s;
  }
  .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(125,211,252,0.15); }
  .search::before {
    content: \"\";
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    width: 14px; height: 14px;
    background: no-repeat center / contain url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a98b3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>\");
  }
  .toolbar { display: flex; gap: 6px; }
  .toolbar button {
    background: var(--bg-1); color: var(--text); border: 1px solid var(--line-2);
    border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer;
    transition: background .12s, border-color .12s;
  }
  .toolbar button:hover { background: var(--bg-2); border-color: var(--accent); }
  .toolbar button.active { background: rgba(125,211,252,0.15); border-color: var(--accent); color: var(--accent); }
  .legend { display: flex; gap: 6px; flex-wrap: wrap; }
  .legend .chip {
    padding: 5px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 500;
    cursor: pointer; user-select: none; border: 1px solid transparent;
    transition: opacity .15s, transform .1s;
  }
  .legend .chip.off { opacity: 0.35; text-decoration: line-through; }
  .legend .chip:hover { transform: translateY(-1px); }
  /* === Graph + Sidebar === */
  #graph { background: radial-gradient(ellipse at 50% 40%, #122340 0%, #0b1220 70%); position: relative; min-height: 0; min-width: 0; }
  #graph::after {
    content: \"\";
    pointer-events: none;
    position: absolute; inset: 0;
    background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0);
    background-size: 32px 32px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0));
  }
  /* vis-network einige Sachen überschreiben */
  div.vis-tooltip {
    background: rgba(11,18,32,0.96) !important;
    color: var(--text) !important;
    border: 1px solid var(--line-2) !important;
    border-radius: 8px !important;
    padding: 10px 12px !important;
    font-family: 'Inter', system-ui, sans-serif !important;
    font-size: 12px !important;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5) !important;
    line-height: 1.55 !important;
    max-width: 340px !important;
    white-space: pre-line !important;
  }
  div.vis-network div.vis-navigation div.vis-button {
    filter: invert(0.85) hue-rotate(180deg) saturate(0.6);
    opacity: 0.7;
  }
  div.vis-network div.vis-navigation div.vis-button:hover { opacity: 1; }
  /* === Sidebar === */
  aside {
    background: var(--bg-1); border-left: 1px solid var(--line);
    padding: 18px 18px 10px;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
  }
  aside h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-mute); margin: 0; font-weight: 600; }
  .panel { background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  .panel .label { font-size: 11px; color: var(--text-mute); margin-bottom: 4px; }
  .panel .title { font-size: 14px; font-weight: 600; word-break: break-word; }
  .panel .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-mute); margin-top: 6px; word-break: break-all; }
  .badges { display: flex; gap: 8px; margin-top: 12px; }
  .badge { background: rgba(255,255,255,0.06); padding: 6px 10px; border-radius: 6px; font-size: 11px; color: var(--text-mute); }
  .badge b { color: var(--text); margin-right: 4px; font-weight: 600; }
  .neighbors { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
  .neighbors a {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px;
    text-decoration: none; color: var(--text); font-size: 12.5px;
    cursor: pointer; transition: background .12s;
  }
  .neighbors a:hover { background: rgba(255,255,255,0.05); }
  .neighbors .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .neighbors .dir { font-size: 10px; color: var(--text-mute); margin-left: auto; }
  .empty { font-size: 12px; color: var(--text-mute); padding: 12px; text-align: center; }
  /* Scrollbars */
  aside::-webkit-scrollbar, .neighbors::-webkit-scrollbar { width: 6px; }
  aside::-webkit-scrollbar-thumb, .neighbors::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 3px; }
  /* Error */
  #error { position: absolute; top: 80px; left: 50%; transform: translateX(-50%); padding: 14px 18px; background: #4c0f0f; color: #fee2e2; border: 1px solid #7f1d1d; border-radius: 8px; display: none; max-width: 520px; font-size: 13px; }
  /* Mobile */
  @media (max-width: 800px) {
    #app { grid-template-columns: 1fr; }
    aside { border-left: none; border-top: 1px solid var(--line); max-height: 40vh; }
  }
</style>
</head>
<body>
<div id=\"app\">
  <header>
    <div class=\"brand\">
      <h1>ShieldPM Wiki — Beziehungsgraph</h1>
      <span class=\"stats\" id=\"stats\"></span>
    </div>
    <div class=\"search\"><input id=\"search\" placeholder=\"Knoten suchen…\" autocomplete=\"off\"></div>
    <div class=\"toolbar\">
      <button id=\"btn-fit\" title=\"Ansicht zentrieren (F)\">Zentrieren</button>
      <button id=\"btn-physics\" class=\"active\" title=\"Physik ein/aus (P)\">Physik</button>
      <button id=\"btn-png\" title=\"Als PNG speichern\">PNG</button>
    </div>
    <div class=\"spacer\"></div>
    <div class=\"legend\" id=\"legend\"></div>
  </header>
  <div id=\"graph\">
    <div id=\"error\"></div>
  </div>
  <aside>
    <h2>Auswahl</h2>
    <div id=\"selection\"><div class=\"empty\">Klicke einen Knoten für Details.</div></div>
    <h2>Top-vernetzte Seiten</h2>
    <div id=\"toplist\" class=\"panel\"></div>
  </aside>
</div>
<script>
const NODES = __NODES__;
const EDGES = __EDGES__;
const COLORS = __COLORS__;

const $ = id => document.getElementById(id);
$('stats').textContent = NODES.length + ' Seiten · ' + EDGES.length + ' Verknüpfungen · gebaut __BUILD_TS__';

function showError(msg) {
  const el = $('error');
  el.style.display = 'block';
  el.textContent = msg;
}

// --- Adjazenz-Tabellen vorberechnen ---
const outAdj = new Map(), inAdj = new Map();
NODES.forEach(n => { outAdj.set(n.id, []); inAdj.set(n.id, []); });
EDGES.forEach(e => {
  if (outAdj.has(e.from)) outAdj.get(e.from).push(e.to);
  if (inAdj.has(e.to)) inAdj.get(e.to).push(e.from);
});

// --- Top-Liste rendern ---
const topList = [...NODES].sort((a, b) => (inAdj.get(b.id).length + outAdj.get(b.id).length) - (inAdj.get(a.id).length + outAdj.get(a.id).length)).slice(0, 8);
$('toplist').innerHTML = topList.map(n => {
  const tot = inAdj.get(n.id).length + outAdj.get(n.id).length;
  return `<div class=\"neighbors\"><a data-id=\"${n.id}\"><span class=\"dot\" style=\"background:${n.color}\"></span>${n.label}<span class=\"dir\">${tot}</span></a></div>`;
}).join('');
$('toplist').querySelectorAll('a').forEach(a => a.addEventListener('click', () => focusNode(a.dataset.id)));

// --- Legende ---
const groupVisible = {};
const legend = $('legend');
Object.entries(COLORS).forEach(([k, c]) => {
  if (k.startsWith('_')) return;
  groupVisible[k] = true;
  const s = document.createElement('span');
  s.className = 'chip';
  s.style.background = c;
  s.style.color = '#0a0f1a';
  s.textContent = k;
  s.addEventListener('click', () => {
    groupVisible[k] = !groupVisible[k];
    s.classList.toggle('off', !groupVisible[k]);
    applyVisibility();
  });
  legend.appendChild(s);
});

let network, nodesDS, edgesDS, physicsOn = true;

function focusNode(id) {
  if (!network) return;
  network.selectNodes([id]);
  network.focus(id, { animation: { duration: 600, easingFunction: 'easeInOutCubic' }, scale: 1.2 });
  showSelection(id);
}

function applyVisibility() {
  if (!nodesDS) return;
  nodesDS.update(NODES.map(n => ({
    id: n.id,
    hidden: !groupVisible[n.group]
  })));
}

function showSelection(id) {
  const node = NODES.find(n => n.id === id);
  if (!node) return;
  const ins = inAdj.get(id) || [], outs = outAdj.get(id) || [];
  const renderList = (ids, dir) => ids.length === 0 ? '' : ids.map(nid => {
    const n = NODES.find(x => x.id === nid);
    if (!n) return '';
    return `<a data-id=\"${nid}\"><span class=\"dot\" style=\"background:${n.color}\"></span>${n.label}<span class=\"dir\">${dir}</span></a>`;
  }).join('');
  $('selection').innerHTML = `
    <div class=\"panel\">
      <div class=\"label\">Seite</div>
      <div class=\"title\">${node.label}</div>
      <div class=\"path\">${node.id}</div>
      <div class=\"badges\">
        <span class=\"badge\"><b>${ins.length}</b>eingehend</span>
        <span class=\"badge\"><b>${outs.length}</b>ausgehend</span>
        <span class=\"badge\" style=\"background:${node.color};color:#0a0f1a;\"><b>${node.group}</b></span>
      </div>
    </div>
    ${ins.length ? `<div class=\"panel\"><div class=\"label\">Eingehend</div><div class=\"neighbors\">${renderList(ins, '→')}</div></div>` : ''}
    ${outs.length ? `<div class=\"panel\"><div class=\"label\">Ausgehend</div><div class=\"neighbors\">${renderList(outs, '→')}</div></div>` : ''}
  `;
  $('selection').querySelectorAll('a').forEach(a => a.addEventListener('click', () => focusNode(a.dataset.id)));
}

window.addEventListener('load', () => {
  if (typeof vis === 'undefined') {
    showError('vis-network konnte nicht geladen werden.');
    return;
  }
  try {
    function htmlTitle(html) {
      const el = document.createElement('div');
      el.innerHTML = html;
      return el;
    }
    nodesDS = new vis.DataSet(NODES.map(n => ({
      ...n,
      title: htmlTitle(n.title),
      shape: 'dot',
      borderWidth: 2,
      color: {
        background: n.color,
        border: 'rgba(255,255,255,0.5)',
        highlight: { background: n.color, border: '#ffffff' },
        hover: { background: n.color, border: '#ffffff' }
      },
      shadow: { enabled: true, color: n.color + '88', size: 18, x: 0, y: 0 },
      font: { color: '#e6edf7', size: 13, face: \"'Inter', system-ui, sans-serif\", strokeWidth: 4, strokeColor: '#0b1220' }
    })));
    edgesDS = new vis.DataSet(EDGES.map((e, i) => ({
      ...e, id: 'e' + i,
      arrows: { to: { enabled: true, scaleFactor: 0.55, type: 'arrow' } },
      color: { color: 'rgba(125,140,170,0.28)', highlight: '#fb923c', hover: '#7dd3fc' },
      smooth: { type: 'cubicBezier', forceDirection: 'none', roundness: 0.35 },
      width: 0.7,
      selectionWidth: 2,
      hoverWidth: 1.2
    })));

    network = new vis.Network($('graph'), { nodes: nodesDS, edges: edgesDS }, {
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -55, centralGravity: 0.012, springLength: 130, springConstant: 0.07, damping: 0.65, avoidOverlap: 0.6 },
        stabilization: { iterations: 350, fit: true }
      },
      interaction: { hover: true, hoverConnectedEdges: true, tooltipDelay: 120, navigationButtons: true, keyboard: true, multiselect: false, zoomView: true },
      nodes: { scaling: { min: 10, max: 38, label: { enabled: true, min: 11, max: 18, drawThreshold: 6 } } },
      edges: {}
    });

    network.on('selectNode', p => { highlightNeighborhood(p.nodes[0]); showSelection(p.nodes[0]); });
    network.on('deselectNode', () => { resetHighlight(); $('selection').innerHTML = '<div class=\"empty\">Klicke einen Knoten für Details.</div>'; });
    network.on('hoverNode', p => network.canvas.body.container.style.cursor = 'pointer');
    network.on('blurNode', () => network.canvas.body.container.style.cursor = '');
    network.on('doubleClick', p => { if (p.nodes.length) window.open(p.nodes[0], '_blank'); });

    function highlightNeighborhood(id) {
      const keep = new Set([id, ...(inAdj.get(id) || []), ...(outAdj.get(id) || [])]);
      nodesDS.update(NODES.map(n => ({
        id: n.id,
        color: keep.has(n.id) ? {
          background: n.color, border: '#ffffff',
          highlight: { background: n.color, border: '#ffffff' },
          hover: { background: n.color, border: '#ffffff' }
        } : {
          background: '#1a2238', border: '#2a3a5c',
          highlight: { background: '#1a2238', border: '#2a3a5c' },
          hover: { background: '#1a2238', border: '#2a3a5c' }
        },
        shadow: keep.has(n.id) ? { enabled: true, color: n.color + 'aa', size: 22 } : { enabled: false }
      })));
    }
    function resetHighlight() {
      nodesDS.update(NODES.map(n => ({
        id: n.id,
        color: {
          background: n.color, border: 'rgba(255,255,255,0.5)',
          highlight: { background: n.color, border: '#ffffff' },
          hover: { background: n.color, border: '#ffffff' }
        },
        shadow: { enabled: true, color: n.color + '88', size: 18 }
      })));
    }

    $('btn-fit').addEventListener('click', () => network.fit({ animation: { duration: 600, easingFunction: 'easeInOutCubic' } }));
    $('btn-physics').addEventListener('click', () => {
      physicsOn = !physicsOn;
      network.setOptions({ physics: { enabled: physicsOn } });
      $('btn-physics').classList.toggle('active', physicsOn);
    });
    $('btn-png').addEventListener('click', () => {
      const canvas = $('graph').querySelector('canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'wiki-graph.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    document.addEventListener('keydown', ev => {
      if (ev.target.tagName === 'INPUT') return;
      if (ev.key === 'f' || ev.key === 'F') $('btn-fit').click();
      else if (ev.key === 'p' || ev.key === 'P') $('btn-physics').click();
      else if (ev.key === 'Escape') { network.unselectAll(); resetHighlight(); $('selection').innerHTML = '<div class=\"empty\">Klicke einen Knoten für Details.</div>'; }
    });

    const search = $('search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { resetHighlight(); return; }
      const matches = new Set(NODES.filter(n => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)).map(n => n.id));
      nodesDS.update(NODES.map(n => ({
        id: n.id,
        color: matches.has(n.id) ? {
          background: n.color, border: '#ffffff',
          highlight: { background: n.color, border: '#ffffff' },
          hover: { background: n.color, border: '#ffffff' }
        } : {
          background: '#1a2238', border: '#1e2a44',
          highlight: { background: '#1a2238', border: '#1e2a44' },
          hover: { background: '#1a2238', border: '#1e2a44' }
        },
        shadow: matches.has(n.id) ? { enabled: true, color: n.color + 'cc', size: 24 } : { enabled: false }
      })));
    });
    search.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        const q = search.value.trim().toLowerCase();
        const first = NODES.find(n => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q));
        if (first) focusNode(first.id);
      }
    });

  } catch (e) {
    showError('Fehler beim Aufbau des Graphen: ' + e.message);
    console.error(e);
  }
});
</script>
</body>
</html>
"""


def load_vis_network(here: Path) -> str:
    """vis-network-Bibliothek inline laden. Datei wird beim ersten Lauf
    von unpkg.com nach scripts/lib/vis-network.min.js heruntergeladen
    und danach offline verwendet."""
    lib_path = here / "scripts" / "lib" / "vis-network.min.js"
    if not lib_path.is_file():
        import urllib.request
        url = "https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"
        print(f"Lade vis-network herunter: {url}")
        lib_path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, lib_path)
        print(f"Gespeichert: {lib_path}")
    return lib_path.read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    here = Path(__file__).resolve().parent.parent
    target_arg = argv[1] if len(argv) > 1 else "docs/wiki-intern"
    root = (here / target_arg).resolve()
    if not root.is_dir():
        print(f"FEHLER: Verzeichnis nicht gefunden: {root}", file=sys.stderr)
        return 1

    import datetime
    build_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    nodes, edges = build_graph(root)
    vis_js = load_vis_network(here)
    out_path = root / "wiki-graph.html"

    # Reihenfolge wichtig: zuerst die größte Ersetzung (vis_js), dann die JSONs.
    html = HTML_TEMPLATE.replace("__VIS_NETWORK_JS__", vis_js)
    html = (
        html
        .replace("__NODES__", json.dumps(nodes, ensure_ascii=False))
        .replace("__EDGES__", json.dumps(edges, ensure_ascii=False))
        .replace("__COLORS__", json.dumps(FOLDER_COLORS, ensure_ascii=False))
        .replace("__BUILD_TS__", build_ts)
    )
    out_path.write_text(html, encoding="utf-8")
    size_kb = out_path.stat().st_size / 1024
    print(f"OK: {len(nodes)} Knoten, {len(edges)} Kanten -> {out_path} ({size_kb:.0f} KB, offline-fähig)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
