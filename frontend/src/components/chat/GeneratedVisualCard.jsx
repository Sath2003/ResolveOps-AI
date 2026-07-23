"use client";

import { useState, useRef } from "react";
import {
  Download,
  Maximize2,
  RefreshCw,
  Edit3,
  X,
  AlertTriangle,
  ImageOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/**
 * GeneratedVisualCard — displays an AI-generated architecture image.
 *
 * Props:
 *   visual       { kind, url, visual_id, mime_type, width, height, alt }
 *   title        string
 *   onRegenerate () => void
 *   onEdit       (message: string) => void  — sends a follow-up message
 */
export function GeneratedVisualCard({ visual, title, onRegenerate, onEdit }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const imgRef = useRef(null);

  const handleDownload = async () => {
    try {
      const res = await fetch(visual.url, { credentials: "include" });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "architecture"}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(visual.url, "_blank");
    }
  };

  if (imgError) {
    return (
      <div className="my-4 p-6 bg-[#0a0f1e] border border-rose-500/25 rounded-2xl flex flex-col items-center gap-3 text-center">
        <ImageOff size={28} className="text-rose-400/60" />
        <p className="text-sm text-rose-300/80">Visual could not be loaded.</p>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors cursor-pointer"
          >
            <RefreshCw size={12} /> Regenerate
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="my-4 group bg-[#060b18] border border-indigo-500/20 rounded-2xl overflow-hidden shadow-xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0f1e] border-b border-white/5">
          <span className="text-xs font-semibold text-indigo-300 tracking-wide truncate">
            {title || "Architecture Diagram"}
          </span>
          <div className="flex items-center gap-1">
            {onEdit && (
              <ToolbarButton
                icon={<Edit3 size={13} />}
                label="Edit"
                onClick={() => onEdit("Convert the previous architecture into an editable technical diagram.")}
              />
            )}
            <ToolbarButton
              icon={<Download size={13} />}
              label="Download"
              onClick={handleDownload}
            />
            {onRegenerate && (
              <ToolbarButton
                icon={<RefreshCw size={13} />}
                label="Regenerate"
                onClick={onRegenerate}
              />
            )}
            <ToolbarButton
              icon={<Maximize2 size={13} />}
              label="Fullscreen"
              onClick={() => setFullscreen(true)}
            />
          </div>
        </div>

        {/* Image */}
        <div
          className="relative overflow-hidden bg-[#07091a] cursor-zoom-in"
          onClick={() => setFullscreen(true)}
          style={{ minHeight: "280px" }}
        >
          <img
            ref={imgRef}
            src={visual.url}
            alt={visual.alt || title}
            onError={() => setImgError(true)}
            className="w-full h-auto object-contain transition-transform duration-300"
            style={{
              maxHeight: "520px",
              display: "block",
              margin: "0 auto",
            }}
          />
          {/* Hover overlay hint */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <ZoomIn size={12} /> Click to expand
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#0a0f1e] border-t border-white/5 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span>AI-generated architecture image</span>
          {visual.width && visual.height && (
            <span className="ml-auto">{visual.width} × {visual.height}px</span>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      {fullscreen && (
        <FullscreenModal
          src={visual.url}
          alt={visual.alt || title}
          title={title}
          onClose={() => setFullscreen(false)}
          onDownload={handleDownload}
        />
      )}
    </>
  );
}

function ToolbarButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/8 transition-colors text-[11px] cursor-pointer"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FullscreenModal({ src, alt, title, onClose, onDownload }) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold text-slate-200 truncate">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors cursor-pointer"
          >
            <Download size={12} /> Download PNG
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          style={{ userSelect: "none" }}
        />
      </div>
    </div>
  );
}

/**
 * VisualLoadingState — animated loading card shown while generating.
 */
export function VisualLoadingState({ step = "Understanding the requested visual…" }) {
  const steps = [
    "Understanding the requested visual…",
    "Planning the architecture…",
    "Validating technical relationships…",
    "Generating the visual…",
    "Preparing the explanation…",
  ];

  return (
    <div className="my-4 p-5 bg-[#060b18] border border-indigo-500/20 rounded-2xl shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <p className="text-xs font-semibold text-indigo-300">Generating Visual</p>
          <p className="text-xs text-slate-500 mt-0.5">{step}</p>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                s === step
                  ? "bg-indigo-400 animate-pulse"
                  : steps.indexOf(step) > i
                  ? "bg-emerald-400"
                  : "bg-white/10"
              }`}
            />
            <span
              className={`text-[11px] ${
                s === step
                  ? "text-indigo-300 font-medium"
                  : steps.indexOf(step) > i
                  ? "text-emerald-400/70"
                  : "text-slate-600"
              }`}
            >
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * VisualErrorState — friendly error card when generation fails.
 */
export function VisualErrorState({ errorCode, title, onRetry, onViewExplanation, onSwitchToDiagram }) {
  const messages = {
    content_policy_rejection: "The image content was flagged by the AI safety system. Try rephrasing the request.",
    rate_limit_exceeded: "Rate limit reached. Please wait a moment and retry.",
    quota_exceeded: "Image generation quota reached for today.",
    generation_timeout: "Generation timed out. Please retry.",
    missing_api_key: "Image generation is not configured. Showing written explanation instead.",
    visual_generation_disabled: "Image generation is currently disabled.",
    planning_failed: "Could not build a valid architecture plan for this request.",
  };

  const message =
    messages[errorCode] ||
    "The architecture visual could not be generated. The written explanation is still available.";

  return (
    <div className="my-4 p-4 bg-amber-500/5 border border-amber-500/25 rounded-2xl">
      <div className="flex items-start gap-2.5 mb-3">
        <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-300 mb-0.5">
            {title || "Visual Generation Failed"}
          </p>
          <p className="text-xs text-amber-300/70 leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors cursor-pointer"
          >
            <RefreshCw size={11} /> Retry
          </button>
        )}
        {onSwitchToDiagram && (
          <button
            onClick={onSwitchToDiagram}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs hover:bg-white/8 transition-colors cursor-pointer"
          >
            Switch to Editable Diagram
          </button>
        )}
        {onViewExplanation && (
          <button
            onClick={onViewExplanation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs hover:bg-white/8 transition-colors cursor-pointer"
          >
            View Explanation Only
          </button>
        )}
      </div>
    </div>
  );
}
