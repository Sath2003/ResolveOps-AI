"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  Download,
  ZoomIn,
  ZoomOut,
  Home,
  X,
} from "lucide-react";

/**
 * StructuredDiagramCard — renders the structured JSON diagram spec as an
 * interactive SVG-based architecture diagram.
 *
 * Uses a custom lightweight SVG renderer (auto-layout) instead of Excalidraw
 * to avoid SSR issues and React 19 incompatibilities.
 *
 * The spec shape expected:
 * {
 *   title: string,
 *   direction: "LR" | "TB",
 *   groups: [{ id, label }],
 *   nodes: [{ id, label, groupId, type, description }],
 *   edges: [{ id, source, target, label, direction }],
 * }
 */
export function StructuredDiagramCard({ spec, title }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);
  const svgContainerRef = useRef(null);

  // Layout the diagram
  const layout = computeLayout(spec);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleMouseMove = (e) => {
    if (!isDragging || !dragStart.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.3, Math.min(3, s + delta)));
  };

  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.2));

  const downloadSVG = () => {
    const svgEl = svgContainerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "diagram").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    const svgEl = svgContainerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${(title || "diagram").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.png`;
      a.click();
    };
    img.src = url;
  };

  const DiagramContent = ({ containerHeight }) => (
    <div
      ref={svgContainerRef}
      className="w-full overflow-hidden bg-[#07091a] rounded-xl"
      style={{ height: containerHeight, cursor: isDragging ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "top left",
          transition: isDragging ? "none" : "transform 0.1s ease",
          display: "block",
          userSelect: "none",
        }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#818cf8" />
          </marker>
          <marker id="arrowhead-bi" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill="#818cf8" />
          </marker>
        </defs>

        {/* Group backgrounds */}
        {layout.groups.map((g) => (
          <g key={g.id}>
            <rect
              x={g.x} y={g.y} width={g.w} height={g.h}
              rx="12" ry="12"
              fill="#0a0f1e" stroke="#334155" strokeWidth="1.5"
              strokeDasharray="none" opacity="0.9"
            />
            <text
              x={g.x + 14} y={g.y + 20}
              fill="#94a3b8" fontSize="11" fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Edges */}
        {layout.edges.map((e) => (
          <g key={e.id}>
            <path
              d={e.path}
              fill="none"
              stroke="#818cf8"
              strokeWidth="1.5"
              markerEnd={`url(#arrowhead)`}
              markerStart={e.bidirectional ? `url(#arrowhead-bi)` : "none"}
              opacity="0.8"
            />
            {e.label && (
              <>
                <rect
                  x={e.labelX - (e.label.length * 3.5) - 4}
                  y={e.labelY - 9}
                  width={(e.label.length * 7) + 8}
                  height="16"
                  rx="4" fill="#0d1224" stroke="#374151" strokeWidth="1"
                />
                <text
                  x={e.labelX} y={e.labelY + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#a5b4fc" fontSize="10"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {e.label}
                </text>
              </>
            )}
          </g>
        ))}

        {/* Nodes */}
        {layout.nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h}
              rx="8" ry="8"
              fill={getNodeFill(n.type)}
              stroke={getNodeStroke(n.type)}
              strokeWidth="1.5"
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + n.h / 2 - (n.description ? 7 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#e2e8f0"
              fontSize="12"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {truncate(n.label, 22)}
            </text>
            {n.description && (
              <text
                x={n.x + n.w / 2}
                y={n.y + n.h / 2 + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#64748b"
                fontSize="9"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {truncate(n.description, 28)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );

  return (
    <>
      <div className="my-4 bg-[#060b18] border border-indigo-500/20 rounded-2xl overflow-hidden shadow-xl shadow-black/50">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0f1e] border-b border-white/5">
          <span className="text-xs font-semibold text-indigo-300 truncate">
            {title || "Architecture Diagram"}
          </span>
          <div className="flex items-center gap-1">
            <ToolBtn icon={<ZoomIn size={12} />} label="Zoom In" onClick={zoomIn} />
            <ToolBtn icon={<ZoomOut size={12} />} label="Zoom Out" onClick={zoomOut} />
            <ToolBtn icon={<Home size={12} />} label="Fit" onClick={resetView} />
            <ToolBtn icon={<Download size={12} />} label="SVG" onClick={downloadSVG} />
            <ToolBtn icon={<Download size={12} />} label="PNG" onClick={downloadPNG} />
            <ToolBtn icon={<Maximize2 size={12} />} label="Fullscreen" onClick={() => setFullscreen(true)} />
          </div>
        </div>

        <DiagramContent containerHeight={420} />

        <div className="px-4 py-2 bg-[#0a0f1e] border-t border-white/5 text-[11px] text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
          <span>Structured architecture diagram • Drag to pan • Scroll to zoom</span>
          <span className="ml-auto">{spec?.nodes?.length || 0} components</span>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[9999] bg-[#04060f] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
            <span className="text-sm font-semibold text-slate-200">{title}</span>
            <div className="flex items-center gap-2">
              <ToolBtn icon={<ZoomIn size={13} />} label="Zoom In" onClick={zoomIn} />
              <ToolBtn icon={<ZoomOut size={13} />} label="Zoom Out" onClick={zoomOut} />
              <ToolBtn icon={<Home size={13} />} label="Reset" onClick={resetView} />
              <ToolBtn icon={<Download size={13} />} label="SVG" onClick={downloadSVG} />
              <ToolBtn icon={<Download size={13} />} label="PNG" onClick={downloadPNG} />
              <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <DiagramContent containerHeight="100%" />
          </div>
        </div>
      )}
    </>
  );
}

function ToolBtn({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/8 transition-colors text-[11px] cursor-pointer flex items-center gap-1"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

function getNodeFill(type) {
  const map = {
    database: "#1e1040",
    storage: "#1e1040",
    client: "#0d2233",
    gateway: "#16213e",
    loadbalancer: "#13243a",
    queue: "#1a1535",
    network: "#102040",
    container: "#0d2236",
    pod: "#0d2236",
    node: "#122040",
    service: "#0f1b3a",
  };
  return map[type?.toLowerCase()] || "#0f1b3a";
}

function getNodeStroke(type) {
  const map = {
    database: "#8b5cf6",
    storage: "#8b5cf6",
    client: "#22d3ee",
    gateway: "#6366f1",
    loadbalancer: "#38bdf8",
    queue: "#a78bfa",
    network: "#34d399",
    container: "#60a5fa",
    pod: "#60a5fa",
    node: "#6366f1",
    service: "#6366f1",
  };
  return map[type?.toLowerCase()] || "#6366f1";
}

// ── Auto-layout engine ────────────────────────────────────────────────────────

const NODE_W = 140;
const NODE_H = 56;
const H_GAP = 24;
const V_GAP = 24;
const GROUP_PAD = 36;
const CANVAS_PAD = 40;

function computeLayout(spec) {
  if (!spec?.nodes || spec.nodes.length === 0) {
    return { width: 400, height: 200, nodes: [], edges: [], groups: [] };
  }

  const isLR = spec.direction !== "TB";

  // Group nodes by groupId
  const groupMap = {};
  (spec.groups || []).forEach((g) => { groupMap[g.id] = { ...g, nodes: [] }; });
  const ungrouped = [];
  spec.nodes.forEach((n) => {
    if (n.groupId && groupMap[n.groupId]) {
      groupMap[n.groupId].nodes.push(n);
    } else {
      ungrouped.push(n);
    }
  });

  // Assign positions
  const positionedNodes = {};
  const layoutGroups = [];
  let cursorX = CANVAS_PAD;
  let cursorY = CANVAS_PAD;

  const groupList = Object.values(groupMap).filter((g) => g.nodes.length > 0);

  groupList.forEach((group, gi) => {
    const nodesInGroup = group.nodes;
    let gx = cursorX;
    let gy = cursorY;

    if (isLR) {
      // Stack nodes vertically within each group
      nodesInGroup.forEach((n, ni) => {
        positionedNodes[n.id] = {
          ...n,
          x: gx + GROUP_PAD,
          y: gy + GROUP_PAD + ni * (NODE_H + V_GAP),
          w: NODE_W,
          h: NODE_H,
        };
      });
      const gw = NODE_W + GROUP_PAD * 2;
      const gh = nodesInGroup.length * (NODE_H + V_GAP) - V_GAP + GROUP_PAD * 2;
      layoutGroups.push({ id: group.id, label: group.label, x: gx, y: gy, w: gw, h: gh });
      cursorX += gw + H_GAP * 2;
    } else {
      // Stack nodes horizontally within each group
      nodesInGroup.forEach((n, ni) => {
        positionedNodes[n.id] = {
          ...n,
          x: gx + GROUP_PAD + ni * (NODE_W + H_GAP),
          y: gy + GROUP_PAD,
          w: NODE_W,
          h: NODE_H,
        };
      });
      const gw = nodesInGroup.length * (NODE_W + H_GAP) - H_GAP + GROUP_PAD * 2;
      const gh = NODE_H + GROUP_PAD * 2;
      layoutGroups.push({ id: group.id, label: group.label, x: gx, y: gy, w: gw, h: gh });
      cursorY += gh + V_GAP * 2;
    }
  });

  // Layout ungrouped nodes
  ungrouped.forEach((n, i) => {
    positionedNodes[n.id] = {
      ...n,
      x: cursorX + i * (NODE_W + H_GAP),
      y: cursorY,
      w: NODE_W,
      h: NODE_H,
    };
  });

  // Compute edges
  const layoutEdges = (spec.edges || []).map((e) => {
    const src = positionedNodes[e.source];
    const tgt = positionedNodes[e.target];
    if (!src || !tgt) return null;

    // Connect right-center to left-center (LR) or bottom-center to top-center (TB)
    let x1, y1, x2, y2;
    if (isLR) {
      x1 = src.x + src.w;
      y1 = src.y + src.h / 2;
      x2 = tgt.x;
      y2 = tgt.y + tgt.h / 2;
    } else {
      x1 = src.x + src.w / 2;
      y1 = src.y + src.h;
      x2 = tgt.x + tgt.w / 2;
      y2 = tgt.y;
    }

    // Simple bezier curve
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const path = isLR
      ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;

    return {
      id: e.id,
      path,
      label: e.label,
      labelX: mx,
      labelY: my - 10,
      bidirectional: e.direction === "bidirectional",
    };
  }).filter(Boolean);

  // Canvas dimensions
  const allPositioned = Object.values(positionedNodes);
  const maxX = Math.max(...allPositioned.map((n) => n.x + n.w), ...layoutGroups.map((g) => g.x + g.w), 200) + CANVAS_PAD;
  const maxY = Math.max(...allPositioned.map((n) => n.y + n.h), ...layoutGroups.map((g) => g.y + g.h), 200) + CANVAS_PAD;

  return {
    width: maxX,
    height: maxY,
    nodes: Object.values(positionedNodes),
    edges: layoutEdges,
    groups: layoutGroups,
  };
}
