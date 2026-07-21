"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Download, Copy, Share } from "lucide-react";

export default function MermaidDiagram({ chart, onSave }) {
  const containerRef = useRef(null);
  const [svgCode, setSvgCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily: "Inter, sans-serif"
    });

    const renderChart = async () => {
      try {
        if (containerRef.current && chart) {
          const { svg } = await mermaid.render("mermaid-svg-" + Date.now(), chart);
          containerRef.current.innerHTML = svg;
          setSvgCode(svg);
        }
      } catch (e) {
        console.error("Mermaid parsing error:", e);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div class="text-rose-400 p-4 font-mono text-xs border border-rose-500/30 bg-rose-500/10 rounded">Error rendering diagram: ${e.message}</div>`;
        }
      }
    };
    renderChart();
  }, [chart]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSVG = () => {
    if (!svgCode) return;
    const blob = new Blob([svgCode], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "architecture.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = () => {
    if (!svgCode) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    // Scale up for better quality
    const scale = 2;
    
    img.onload = () => {
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.scale(scale, scale);
      
      // Dark background to match theme
      ctx.fillStyle = "#0f172a"; // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "architecture.png";
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgCode)));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center z-10">
        <div className="text-xs font-bold text-sky-400 tracking-wider uppercase">
          Generated Architecture Topology
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 rounded transition-colors"
          >
            <Copy size={14} /> {copied ? "Copied!" : "Copy Code"}
          </button>
          <div className="flex bg-white/5 rounded divide-x divide-white/10 overflow-hidden text-slate-300">
            <button 
              onClick={handleDownloadSVG}
              className="px-3 py-1.5 text-xs font-semibold hover:bg-white/10 transition-colors flex items-center gap-1.5"
            >
              <Download size={14} /> SVG
            </button>
            <button 
              onClick={handleDownloadPNG}
              className="px-3 py-1.5 text-xs font-semibold hover:bg-white/10 transition-colors"
            >
              PNG
            </button>
          </div>
          {onSave && (
            <button 
              onClick={onSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 rounded transition-colors"
            >
              <Share size={14} /> Save to DB
            </button>
          )}
          <button
            onClick={() => alert("Presentation Diagram Generation initiated (AI Model is processing...)")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded transition-colors border border-indigo-500/30"
          >
            Generate Presentation Diagram (AI)
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-8 flex items-center justify-center min-h-[400px]">
        <div ref={containerRef} className="mermaid flex justify-center" />
      </div>
    </div>
  );
}
