"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ChatHistorySidebar from "@/components/ai/ChatHistorySidebar";
import {
  MessageSquareCode, Send, Bot, User, Activity,
  Sun, Sunset, Moon, Paperclip, Mic, Square, Sparkles,
  AlertTriangle, RefreshCw, Copy, X, ChevronDown, ChevronRight,
  Clock, Shield, Database, Zap, CheckCircle2, XCircle, Info,
  Cloud, GitBranch, Container, Server, Search, BarChart2,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";

const ExcalidrawBoard = dynamic(
  () => import("@/components/common/ExcalidrawBoard"),
  { ssr: false }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 18) return "Good Afternoon";
  return "Good Evening";
}
function getGreetingIcon() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return Sun;
  if (hour >= 12 && hour < 18) return Sunset;
  return Moon;
}
function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}
function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Secret Redaction ─────────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:password|secret|token|key)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];
function redactSecrets(text) {
  let result = text;
  SECRET_PATTERNS.forEach(pattern => {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  });
  return result;
}

// ─── Provider Badge ───────────────────────────────────────────────────────────
function ProviderBadge({ providerStatus, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/40 text-slate-500 text-[11px]">
        <Activity className="w-3 h-3 animate-spin" />
        Checking AI...
      </div>
    );
  }

  const { provider, model, status } = providerStatus || {};
  const isAvailable = status === "available";
  const displayProvider = provider === "bedrock" ? "Amazon Bedrock"
    : provider === "openai" ? "OpenAI"
    : provider || "AI";

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
      isAvailable
        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        : "bg-amber-500/10 border-amber-500/20 text-amber-400"
    }`}>
      {isAvailable
        ? <CheckCircle2 size={11} />
        : <AlertTriangle size={11} />}
      {isAvailable ? `Powered by ${displayProvider}` : "AI Degraded"}
    </div>
  );
}

// ─── Investigation Status ─────────────────────────────────────────────────────
const STATUS_LABELS = {
  preparing: { label: "Preparing investigation", icon: Search, color: "text-indigo-400" },
  collecting: { label: "Collecting live evidence", icon: Cloud, color: "text-cyan-400" },
  searching: { label: "Searching historical incidents", icon: Database, color: "text-violet-400" },
  correlating: { label: "Correlating evidence", icon: GitBranch, color: "text-amber-400" },
  generating: { label: "Generating RCA", icon: BarChart2, color: "text-indigo-400" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-400" },
  insufficient_evidence: { label: "Insufficient evidence", icon: AlertTriangle, color: "text-amber-400" },
  failed: { label: "Failed", icon: XCircle, color: "text-rose-400" },
};

function InvestigationStatus({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.preparing;
  const Icon = s.icon;
  return (
    <div className={`flex items-center gap-2 text-xs ${s.color}`} role="status" aria-live="polite">
      <Icon size={13} className={status === "preparing" || status === "collecting" || status === "generating" ? "animate-pulse" : ""} />
      {s.label}
    </div>
  );
}

// ─── Evidence Card ────────────────────────────────────────────────────────────
function EvidenceCard({ evidence }) {
  const [expanded, setExpanded] = useState(false);
  const sourceIcon = {
    cloudwatch: <Cloud size={12} />,
    github: <GitBranch size={12} />,
    docker: <Container size={12} />,
    resolveops: <Shield size={12} />,
    aws: <Cloud size={12} />,
  };

  return (
    <div className="border border-white/8 rounded-xl p-3 bg-white/3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
          {sourceIcon[evidence.source] || <Server size={12} />}
          <span className="uppercase tracking-wider">{evidence.source}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{evidence.evidence_type}</span>
          {evidence.is_live && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px]">
              LIVE
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-600 shrink-0">
          {evidence.collection_timestamp ? timeAgo(evidence.collection_timestamp) : ""}
        </span>
      </div>
      {evidence.resource && (
        <p className="text-[11px] text-slate-500 font-mono truncate">{evidence.resource}</p>
      )}
      <p className="text-xs text-slate-300 leading-relaxed">{evidence.summary}</p>
      {evidence.raw_preview && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? "Collapse" : "Show raw preview"}
        </button>
      )}
      {expanded && evidence.raw_preview && (
        <pre className="bg-slate-900/80 border border-white/8 rounded-lg p-2.5 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
          {evidence.raw_preview}
        </pre>
      )}
    </div>
  );
}

// ─── RCA Display ─────────────────────────────────────────────────────────────
function RCADisplay({ data }) {
  const [showTools, setShowTools] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const confidenceColor = {
    high: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    low: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  }[data.confidence] || "text-slate-400 bg-slate-500/10 border-slate-500/20";

  return (
    <div className="space-y-3 w-full">
      {/* Insufficient Evidence Warning */}
      {data.insufficient_evidence_warning && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20" role="alert">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-0.5">Insufficient Evidence</p>
            <p className="text-xs text-amber-300/80">{data.insufficient_evidence_warning}</p>
          </div>
        </div>
      )}

      {/* Summary */}
      {data.incident_summary && (
        <div className="p-3 rounded-xl bg-white/4 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Incident Summary</p>
          <p className="text-sm text-slate-200 leading-relaxed">{data.incident_summary}</p>
        </div>
      )}

      {/* Root Cause + Confidence */}
      {data.probable_root_cause && (
        <div className="p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Probable Root Cause</p>
            {data.confidence && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] border font-medium ${confidenceColor}`}>
                {data.confidence.toUpperCase()} confidence
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{data.probable_root_cause}</p>
        </div>
      )}

      {/* Impact */}
      {data.impact && (
        <div className="p-3 rounded-xl bg-white/3 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impact</p>
          <p className="text-sm text-slate-300 leading-relaxed">{data.impact}</p>
        </div>
      )}

      {/* Resolution */}
      {data.recommended_resolution && (
        <div className="p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/15">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Recommended Resolution</p>
          <div className="text-sm text-slate-300 leading-relaxed prose-sm max-w-none">
            <ReactMarkdown>{data.recommended_resolution}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Live Evidence */}
      {data.live_evidence && data.live_evidence.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 mb-2 transition-colors"
          >
            {showEvidence ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Zap size={11} className="text-cyan-400" />
            {data.live_evidence.length} live evidence item{data.live_evidence.length !== 1 ? "s" : ""}
          </button>
          {showEvidence && (
            <div className="space-y-2">
              {data.live_evidence.map((e, i) => (
                <EvidenceCard key={i} evidence={e} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tools Used */}
      {data.tools_used && data.tools_used.length > 0 && (
        <div>
          <button
            onClick={() => setShowTools(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-400 mb-2 transition-colors"
          >
            {showTools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Shield size={11} className="text-indigo-400" />
            {data.tools_used.length} MCP tool{data.tools_used.length !== 1 ? "s" : ""} used
          </button>
          {showTools && (
            <div className="space-y-1">
              {data.tools_used.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500 font-mono px-2 py-1 rounded bg-white/3">
                  {t.success
                    ? <CheckCircle2 size={10} className="text-emerald-400" />
                    : <XCircle size={10} className="text-rose-400" />}
                  {t.tool_name}
                  <span className="text-slate-700">{t.duration_ms}ms</span>
                  {!t.success && t.error_code && (
                    <span className="text-rose-500">{t.error_code}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer metadata */}
      <div className="flex items-center gap-3 text-[10px] text-slate-700 pt-1 border-t border-white/4">
        {data.investigation_duration_seconds && (
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {data.investigation_duration_seconds}s
          </span>
        )}
        {data.investigation_id && (
          <span className="font-mono truncate">ID: {data.investigation_id.slice(0, 8)}</span>
        )}
        <span className="ml-auto capitalize">{data.execution_path?.replace(/_/g, " ")}</span>
      </div>
    </div>
  );
}

// ─── Error Card ───────────────────────────────────────────────────────────────
function ErrorCard({ error, onRetry, onDismiss }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRequestId = async () => {
    if (error.request_id) {
      await navigator.clipboard.writeText(error.request_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-rose-500/20 rounded-2xl rounded-tl-sm p-4 bg-rose-500/5 max-w-[78%]" role="alert">
      <div className="flex items-start gap-2.5 mb-3">
        <AlertTriangle size={15} className="text-rose-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-rose-300 mb-0.5">AI Analysis Unavailable</p>
          <p className="text-xs text-rose-300/80 leading-relaxed">{error.message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
        {error.request_id && (
          <button
            onClick={copyRequestId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-xs hover:bg-white/8 transition-colors"
          >
            <Copy size={11} />
            {copied ? "Copied!" : "Copy ID"}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto px-2.5 py-1.5 rounded-lg bg-white/3 border border-white/5 text-slate-500 text-xs hover:text-slate-400 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {error.request_id && (
        <button
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-500 mt-2 transition-colors"
        >
          <Info size={9} />
          {showDetails ? "Hide" : "Show"} technical details
        </button>
      )}
      {showDetails && error.request_id && (
        <div className="mt-2 p-2 bg-black/30 rounded-lg">
          <p className="text-[10px] text-slate-600 font-mono">
            Request ID: {error.request_id}
          </p>
          {error.code && (
            <p className="text-[10px] text-slate-600 font-mono">
              Error code: {error.code}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Code Block ───────────────────────────────────────────────────────────────
function findExcalidrawCode(children) {
  if (!children) return null;
  if (Array.isArray(children)) {
    for (const child of children) {
      const res = findExcalidrawCode(child);
      if (res) return res;
    }
    return null;
  }
  if (children.props) {
    const className = children.props.className || "";
    if (typeof className === "string" && (className.includes("language-excalidraw") || className.includes("language-json"))) {
      const childrenVal = children.props.children;
      const codeText = Array.isArray(childrenVal) ? childrenVal.join("") : String(childrenVal || "");
      if (className.includes("language-excalidraw") || codeText.includes('"type": "excalidraw"')) {
        return { codeText };
      }
    }
    if (children.props.children) return findExcalidrawCode(children.props.children);
  }
  return null;
}

function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const excalidraw = useMemo(() => findExcalidrawCode(children), [children]);

  if (excalidraw) {
    try {
      let cleaned = excalidraw.codeText.trim().replace(/,\s*([\]}])/g, "$1");
      const parsed = JSON.parse(cleaned);
      return <ExcalidrawBoard elements={parsed.elements || []} />;
    } catch {
      return (
        <div>
          <div className="bg-rose-950/20 border border-rose-500/30 text-rose-400 p-3 rounded-lg text-xs font-mono my-2">
            Failed to render diagram.
          </div>
          <pre className="bg-[#020617] border border-white/10 rounded-lg p-4 overflow-x-auto font-mono text-xs text-slate-400 mt-2">
            {excalidraw.codeText}
          </pre>
        </div>
      );
    }
  }

  const handleCopy = async () => {
    if (codeRef.current) {
      await navigator.clipboard.writeText(codeRef.current.innerText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group my-2">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded text-[11px] border border-white/10 flex items-center gap-1 cursor-pointer font-sans"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre ref={codeRef} className="bg-[#020617] border border-white/10 rounded-lg p-4 overflow-x-auto font-mono text-xs text-slate-300" {...props}>
        {children}
      </pre>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onRetry }) {
  // Detect structured RCA response (has investigation_id)
  const isRCA = msg.rca_data && (msg.rca_data.investigation_id || msg.rca_data.probable_root_cause);
  const isError = msg.is_error;

  if (isError) {
    return (
      <div className="flex gap-3 justify-start">
        <div className="w-8 h-8 rounded-xl bg-rose-600/60 flex items-center justify-center shrink-0">
          <Bot size={15} />
        </div>
        <ErrorCard
          error={msg.error}
          onRetry={onRetry ? () => onRetry(msg.original_prompt) : null}
          onDismiss={null}
        />
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-indigo-600/25 border border-indigo-500/30 text-indigo-100 whitespace-pre-wrap">
          {msg.content}
        </div>
        <div className="w-8 h-8 rounded-xl bg-indigo-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/30">
          <User size={15} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-xl bg-emerald-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/30">
        <Bot size={15} />
      </div>
      <div className="max-w-[78%] min-w-[200px] px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8 text-slate-300 shadow-sm">
        {isRCA ? (
          <RCADisplay data={msg.rca_data} />
        ) : (
          <div className="prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                pre: ({ ...props }) => <CodeBlock {...props} />,
                code: ({ ...props }) => <code className="bg-slate-800 text-indigo-300 px-1 py-0.5 rounded text-xs font-mono" {...props} />,
                h1: ({ ...props }) => <h1 className="text-lg font-bold text-white mt-4 mb-2 first:mt-0" {...props} />,
                h2: ({ ...props }) => <h2 className="text-md font-semibold text-white mt-3 mb-1 first:mt-0" {...props} />,
                h3: ({ ...props }) => <h3 className="text-sm font-semibold text-slate-200 mt-2 mb-1 first:mt-0" {...props} />,
                ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                li: ({ ...props }) => <li className="text-slate-300" {...props} />,
                p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                a: ({ ...props }) => <a className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {msg.timestamp && (
          <p className="text-[10px] text-slate-700 mt-2">{timeAgo(msg.timestamp)}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AICopilot() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState("preparing");
  const [fullName, setFullName] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [voiceSending, setVoiceSending] = useState(false);

  const buildWelcome = useCallback((name) => {
    const firstName = name?.split(" ")[0] || "";
    const greeting = getGreeting();
    return firstName
      ? `${greeting}, ${firstName}! 👋 I'm the **ResolveOps AI-RCA Agent** — your evidence-first incident investigation assistant.\n\nI have visibility into your AWS resources, EC2 instances, Docker services, GitHub pipelines, and historical incidents. How can I assist you?`
      : `${greeting}! 👋 I'm the **ResolveOps AI-RCA Agent**. I can help you investigate incidents, analyze AWS resources, Docker services, and GitHub pipeline failures. How can I help?`;
  }, []);

  // Fetch provider status
  const fetchProviderStatus = useCallback(async () => {
    setProviderLoading(true);
    try {
      const data = await fetchApi("/api/v1/ai/provider-status");
      setProviderStatus(data);
    } catch {
      setProviderStatus({ provider: "unknown", status: "unavailable" });
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sid, name) => {
    setLoading(true);
    try {
      const history = await fetchApi(`/api/chat/history?session_id=${sid}`);
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history.map(msg => ({
          role: msg.role || "assistant",
          content: msg.role === "user" && msg.image_base64
            ? `🖼️ [Uploaded Architecture Diagram] ${msg.content || ""}`
            : msg.content || "",
          timestamp: msg.timestamp,
        })));
      } else {
        setMessages([{ role: "assistant", content: buildWelcome(name) }]);
      }
    } catch {
      setMessages([{ role: "assistant", content: buildWelcome(name) }]);
    } finally {
      setLoading(false);
    }
  }, [buildWelcome]);

  // Auth + initial load
  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) { router.push("/login"); return; }
    const payload = decodeJwtPayload(token);
    const name = payload.username || payload.full_name || payload.email?.split("@")[0] || "";
    setFullName(name);
    fetchProviderStatus();

    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (sid) {
      setSessionId(sid);
      loadSession(sid, name);
    } else {
      setMessages([{ role: "assistant", content: buildWelcome(name) }]);
      setLoading(false);
    }
  }, [pathname, router, loadSession, buildWelcome, fetchProviderStatus]);

  // Pre-fill query from URL
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setInput(q);
  }, [pathname]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Session selection from sidebar
  const handleSessionSelect = (sid) => {
    setSessionId(sid);
    router.replace(`/chat?session_id=${sid}`);
    loadSession(sid, fullName);
  };

  // New chat
  const startNewChat = () => {
    setSessionId(null);
    setInput("");
    setImageFile(null);
    router.replace("/chat");
    setMessages([{ role: "assistant", content: buildWelcome(fullName) }]);
  };

  // Image handler
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.type.startsWith("image/")) {
      reader.onloadend = () => setImageFile(reader.result);
      reader.readAsDataURL(file);
    } else {
      reader.onloadend = () => setInput(prev => prev + `\n\n--- FILE: ${file.name} ---\n${reader.result}\n---------------------\n`);
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  // Voice recorder
  const toggleRecording = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          setVoiceSending(true);
          try {
            const res = await fetchApi("/api/chat/voice", { method: "POST", body: JSON.stringify({ audio_base64: reader.result.split(",")[1] }) });
            if (res.text) setInput(prev => prev + (prev ? " " : "") + res.text);
          } catch { alert("Voice transcription failed."); }
          finally { setVoiceSending(false); }
        };
      };
      mr.start();
      setIsRecording(true);
    } catch { alert("Microphone access denied."); }
  };

  // Send message
  const handleSend = async (prefillMessage) => {
    const rawMsg = typeof prefillMessage === "string" ? prefillMessage : input.trim();
    if (!rawMsg && !imageFile) return;
    const safeMsg = redactSecrets(rawMsg);
    const userDisplayContent = imageFile ? `🖼️ [Uploaded Architecture Diagram] ${safeMsg}` : safeMsg;

    setMessages(prev => [...prev, {
      role: "user",
      content: userDisplayContent,
      timestamp: new Date().toISOString(),
    }]);
    setInput("");
    setSending(true);
    setSendingStatus("preparing");
    const currentImage = imageFile;
    setImageFile(null);

    // Simulate investigation status transitions
    const statusProgression = ["preparing", "collecting", "correlating", "generating"];
    let statusIdx = 0;
    const statusTimer = setInterval(() => {
      statusIdx = Math.min(statusIdx + 1, statusProgression.length - 1);
      setSendingStatus(statusProgression[statusIdx]);
    }, 4000);

    try {
      const payload = {
        message: safeMsg || "Analyze this uploaded infrastructure architecture diagram.",
        image_base64: currentImage,
      };
      if (sessionId) payload.session_id = sessionId;

      const data = await fetchApi("/api/chat", { method: "POST", body: JSON.stringify(payload) });
      clearInterval(statusTimer);

      // Check if response contains structured RCA data
      const rcaData = data.investigation_id || data.probable_root_cause
        ? data
        : null;

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer || "",
        rca_data: rcaData,
        timestamp: new Date().toISOString(),
      }]);

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        router.replace(`/chat?session_id=${data.session_id}`);
      }
      window.dispatchEvent(new Event("chat-updated"));
    } catch (err) {
      clearInterval(statusTimer);

      // Structured AI error from api.js normalisation
      if (err.is_ai_error || err.code) {
        setMessages(prev => [...prev, {
          role: "assistant",
          is_error: true,
          error: {
            message: err.message,
            code: err.code,
            request_id: err.request_id,
            retryable: err.retryable ?? true,
          },
          original_prompt: safeMsg,
          timestamp: new Date().toISOString(),
        }]);
      } else {
        // Generic non-AI error (network, auth, etc.)
        setMessages(prev => [...prev, {
          role: "assistant",
          is_error: true,
          error: {
            message: err.message || "An unexpected error occurred. Please retry.",
            retryable: true,
          },
          original_prompt: safeMsg,
          timestamp: new Date().toISOString(),
        }]);
      }
    } finally {
      setSending(false);
      setSendingStatus("preparing");
    }
  };

  const GreetingIcon = getGreetingIcon();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060610]">
        <Activity className="animate-spin text-indigo-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      {/* Full-height two-panel layout */}
      <div className="flex h-[calc(100vh-2rem)] -m-6 overflow-hidden">

        {/* ── Left Sidebar: Chat History ────────────────────────────────── */}
        <ChatHistorySidebar
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={startNewChat}
        />

        {/* ── Right Panel: Chat Area ───────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#080812]/80 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <MessageSquareCode size={18} className="text-indigo-400" />
                {sessionId ? "AI-RCA Agent" : "New Investigation"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <GreetingIcon size={12} className="text-amber-400" />
                {getGreeting()}{fullName ? `, ${fullName.split(" ")[0]}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ProviderBadge providerStatus={providerStatus} loading={providerLoading} />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4">
                  <MessageSquareCode size={24} className="text-indigo-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-2">Start an investigation</p>
                <p className="text-slate-600 text-xs max-w-sm leading-relaxed">
                  Ask about incidents, AWS resources, EC2 instances, Docker services, GitHub pipelines, costs, and architecture.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                onRetry={msg.is_error && msg.original_prompt ? handleSend : null}
              />
            ))}

            {/* Investigation status indicator */}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/80 flex items-center justify-center shrink-0">
                  <Bot size={15} />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8 min-w-[180px]">
                  <InvestigationStatus status={sendingStatus} />
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="shrink-0 px-6 py-4 border-t border-white/5 bg-[#080812]/60">
            {imageFile && (
              <div className="mb-3 relative w-14 h-14 border border-indigo-500/50 rounded-xl overflow-hidden group bg-slate-900 flex items-center justify-center">
                <img src={imageFile} alt="Preview" className="object-cover w-full h-full" />
                <button
                  onClick={() => setImageFile(null)}
                  className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 text-[10px] font-bold transition-opacity cursor-pointer border-none font-sans"
                  aria-label="Remove image"
                >
                  Remove
                </button>
              </div>
            )}
            <div className="relative flex items-center bg-[#0a0a12] border border-white/8 rounded-xl px-4 py-2.5 focus-within:border-indigo-500/40 transition-all duration-200 gap-3">
              <label className="cursor-pointer text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Attach file" aria-label="Attach file">
                <Paperclip size={17} />
                <input type="file" accept="image/*,.txt,.log,.json,.csv,.md" className="hidden" onChange={handleImageChange} />
              </label>

              <button
                onClick={toggleRecording}
                disabled={voiceSending}
                className={`shrink-0 transition-colors ${isRecording ? "text-rose-400 animate-pulse" : "text-slate-500 hover:text-slate-300"} ${voiceSending ? "opacity-40 cursor-not-allowed" : ""}`}
                title="Voice input"
                aria-label={isRecording ? "Stop recording" : "Start voice input"}
              >
                {isRecording ? <Square size={17} /> : <Mic size={17} />}
              </button>

              <input
                ref={textareaRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  voiceSending ? "Transcribing voice..."
                    : isRecording ? "Recording… press stop when done."
                      : "Ask about incidents, AWS resources, EC2, Docker services, pipelines, costs and architecture…"
                }
                disabled={isRecording || voiceSending}
                aria-label="Chat input"
                className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-slate-600 py-1 min-w-0"
              />

              <button
                onClick={handleSend}
                disabled={sending || voiceSending || isRecording || (!input.trim() && !imageFile)}
                aria-label="Send message"
                className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-md shadow-indigo-900/40"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] text-slate-700 text-center mt-2">
              Secrets and credentials are automatically redacted · Evidence is collected from live sources
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
