"use client";

import { useState, useEffect, useRef } from "react";
import { User, Bot, AlertTriangle, RefreshCw, Copy, CheckCircle2, XCircle, ChevronDown, ChevronRight, Shield, Zap, Clock, Info, Activity } from "lucide-react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: "loose",
  theme: "base",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis"
  },
  themeVariables: {
    darkMode: true,
    background: "transparent",
    primaryColor: "#4f46e5",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#6366f1",
    lineColor: "#818cf8",
    secondaryColor: "#0f172a",
    tertiaryColor: "#1e293b",
    nodeTextColor: "#ffffff",
    textColor: "#ffffff"
  }
});

function injectSVGStyles(rawSvg) {
  if (!rawSvg) return "";

  const customStyle = `<style>
    svg { max-width: 100% !important; height: auto !important; display: block !important; margin: 0 auto !important; background: transparent !important; }
    
    g.cluster > rect, .cluster > rect {
      fill: #0f172a !important;
      stroke: #334155 !important;
      stroke-width: 1.5px !important;
    }

    g.cluster > rect.inner, .cluster rect.inner, rect.inner {
      fill: transparent !important;
      stroke: none !important;
    }

    g.node rect, g.node circle, g.node polygon, g.node path, .node rect, .node circle, .node polygon, .node path {
      fill: #1e1b4b !important;
      stroke: #6366f1 !important;
      stroke-width: 2px !important;
    }

    foreignObject, foreignObject *, .nodeLabel, .cluster-label, text, tspan, span, p, div {
      fill: #ffffff !important;
      color: #ffffff !important;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      opacity: 1 !important;
      visibility: visible !important;
    }

    .edgePath path, .flowchart-link {
      stroke: #818cf8 !important;
      stroke-width: 2px !important;
    }

    .edgeLabel rect {
      fill: #090d16 !important;
      stroke: #374151 !important;
    }

    .edgeLabel text, .edgeLabel span, .edgeLabel div {
      fill: #a5b4fc !important;
      color: #a5b4fc !important;
      font-size: 11px !important;
      font-weight: 500 !important;
    }
  </style>`;

  return rawSvg.replace(/<svg[^>]*>/, (match) => `${match}${customStyle}`);
}

function formatAndSanitizeMermaidCode(code) {
  if (!code) return "";
  let text = code.trim();

  // 1. If single-line or missing newlines between statements, restore newlines
  if (!text.includes("\n") || text.split("\n").length < 3) {
    text = text
      .replace(/\s*(subgraph\s+[A-Za-z0-9_"\-[\]\s]+)/gi, "\n$1\n")
      .replace(/\s*(end)(?=\s|$)/gi, "\nend\n")
      .replace(/\s*(-->|->|-\.->|<-->)\s*/gi, " $1 ")
      .replace(/\]\s*([A-Za-z0-9_]+)\[/g, "]\n$1[")
      .replace(/("\s*)([A-Za-z0-9_]+\[)/g, '$1\n$2');
  }

  // 2. Fix arrow label quirks
  text = text
    .replace(/-->\|([^|]+)\|>/g, "-->|$1|")
    .replace(/->\|([^|]+)\|>/g, "-->|$1|")
    .replace(/-->\|([^|]+)\| >/g, "-->|$1|")
    .replace(/<-->\|([^|]+)\|/g, "-->|$1|")
    .replace(/style\s+\w+\s+fill:[^;\n]+;\s*/gi, "")
    .replace(/style\s+\w+\s+fill:[^;\n]+$/gi, "");

  // 3. Ensure graph header
  if (!/^(graph|flowchart|sequenceDiagram|classDiagram|gantt|erDiagram)/i.test(text.trim())) {
    text = "graph TD\n" + text;
  }

  // 4. Fix unquoted subgraph titles with spaces: subgraph Master Node => subgraph Master_Node["Master Node"]
  text = text.replace(/subgraph\s+([A-Za-z0-9_ ]+?)(?=\n|\[|$)/gi, (match, name) => {
    if (name.includes("[") || name.startsWith('"')) return match;
    const trimmed = name.trim();
    if (trimmed.includes(" ")) {
      const safeId = trimmed.replace(/\s+/g, '_');
      return `subgraph ${safeId}["${trimmed}"]`;
    }
    return `subgraph ${trimmed}`;
  });

  // 5. Wrap unquoted node labels containing spaces or special characters in quotes
  text = text.replace(/(\w+)\s*\[([^"\n\]]+)\]/g, (m, id, label) => {
    if (label.startsWith('"') && label.endsWith('"')) return m;
    return `${id}["${label}"]`;
  });

  return text;
}

function MermaidDiagram({ code }) {
  const [mounted, setMounted] = useState(false);
  const [svgHtml, setSvgHtml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const containerRef = useRef(null);

  // Generate unique diagram ID per instance to avoid DOM collisions
  const uniqueIdRef = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !code) return;

    let isSubscribed = true;
    setLoading(true);
    setError(false);

    const formattedCode = formatAndSanitizeMermaidCode(code);
    const diagramId = uniqueIdRef.current;

    const renderDiagram = async () => {
      try {
        const { svg } = await mermaid.render(diagramId, formattedCode);
        if (isSubscribed) {
          setSvgHtml(injectSVGStyles(svg));
          setLoading(false);
        }
      } catch (primaryErr) {
        console.warn("Primary Mermaid render failed, trying simplified fallback...", primaryErr);
        try {
          const fallbackCode = formattedCode.replace(/\|([^|]+)\|/g, '');
          const { svg } = await mermaid.render(`${diagramId}-fb`, fallbackCode);
          if (isSubscribed) {
            setSvgHtml(injectSVGStyles(svg));
            setLoading(false);
          }
        } catch (fallbackErr) {
          console.error("Mermaid diagram render error:", fallbackErr);
          if (isSubscribed) {
            setError(true);
            setLoading(false);
          }
        }
      } finally {
        document.querySelectorAll("[id^='dmermaid']").forEach((el) => el.remove());
      }
    };

    renderDiagram();

    return () => {
      isSubscribed = false;
    };
  }, [mounted, code]);

  if (!mounted) {
    return <div className="my-4 h-32 bg-[#030712] border border-indigo-500/20 rounded-2xl animate-pulse flex items-center justify-center text-xs text-slate-500">Initializing Diagram Engine...</div>;
  }

  if (loading) {
    return (
      <div className="my-4 p-6 bg-[#030712] border border-indigo-500/20 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-xl">
        <Activity className="animate-spin text-indigo-400 w-5 h-5" />
        <span className="text-xs font-medium text-slate-400">Rendering Architecture Topology...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 p-4 bg-slate-950/90 border border-amber-500/30 rounded-2xl shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <AlertTriangle size={15} />
            <span>Architecture Diagram Topology</span>
          </div>
          <button
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-md bg-white/5 border border-white/10 transition-colors cursor-pointer"
          >
            {showCode ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>{showCode ? "Hide Diagram Code" : "View Diagram Code"}</span>
          </button>
        </div>

        {showCode && (
          <div className="mt-3 p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-xs text-slate-300 overflow-x-auto">
            <pre className="text-indigo-300 leading-relaxed">{formatAndSanitizeMermaidCode(code)}</pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-4 group relative bg-[#030712] border border-indigo-500/20 rounded-2xl shadow-xl shadow-black/50 overflow-hidden">
      <div
        ref={containerRef}
        className="mermaid-svg-container p-5 overflow-x-auto w-full block"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
      <div className="px-4 py-2 bg-slate-950/80 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
          <Zap size={12} /> Interactive Architecture Topology
        </span>
        <button
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {showCode ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{showCode ? "Hide Diagram Code" : "View Diagram Code"}</span>
        </button>
      </div>
      {showCode && (
        <div className="p-3 bg-black/80 border-t border-white/10 font-mono text-xs text-indigo-300 overflow-x-auto">
          <pre>{formatAndSanitizeMermaidCode(code)}</pre>
        </div>
      )}
    </div>
  );
}

function preprocessMarkdownContent(content) {
  if (!content) return "";
  let processed = content;

  // 1. Fix code blocks like ``` \n graph TD ... ``` that missed the 'mermaid' language identifier
  processed = processed.replace(/```\s*\n(graph\s+(?:TD|LR|TB|RL)|flowchart\s+(?:TD|LR|TB|RL)|sequenceDiagram|classDiagram|erDiagram|gantt)/gi, '```mermaid\n$1');

  // 2. Auto-wrap unfenced graph/flowchart code blocks
  if (!processed.includes("```mermaid")) {
    const unfencedRegex = /((?:graph\s+(?:TD|LR|TB|RL)|flowchart\s+(?:TD|LR|TB|RL)|sequenceDiagram)[\s\S]+?)(?=\n\n[A-Z]|\n\n#|\n\n1\.|\n\nThis architecture|$)/i;
    if (unfencedRegex.test(processed)) {
      processed = processed.replace(unfencedRegex, "```mermaid\n$1\n```");
    }
  }

  // 3. Auto-fallback for text mentioning CI/CD / pipelines when NO ```mermaid block exists!
  if (!processed.includes("```mermaid")) {
    const isCICD = /CI\/CD|pipeline|Development Layer|GitHub Actions|Docker Hub|EC2 instances|Build Service/i.test(processed);
    if (isCICD) {
      const cicdDiagram = `\`\`\`mermaid
graph LR
    subgraph DevLayer["💻 Development Layer"]
        Repo["📝 GitHub Repository"] -->|Code Push| Workflow["⚡ GitHub Actions Workflow"]
    end

    subgraph CIPipeline["🔨 CI Pipeline"]
        Workflow -->|Trigger| DockerBuild["🐳 Build Service (Docker)"]
        DockerBuild -->|Image Push| Registry["📦 Artifact Registry (Docker Hub)"]
    end

    subgraph CDPipeline["🚀 CD Pipeline"]
        Registry -->|Pull Image| DeploySvc["☁️ Deployment Service (AWS ECS)"]
        DeploySvc -->|Deploy| EC2["🖥️ EC2 Instances (AWS)"]
    end

    subgraph Observability["📊 Observability & Alerting"]
        EC2 -->|Logs & Metrics| CW["📈 CloudWatch Logs & Metrics"]
        CW -->|Alerts| SNS["🔔 Alerting Service (AWS SNS)"]
    end
\`\`\`\n\n`;
      processed = cicdDiagram + processed;
    } else if (/kubernetes|k8s|master_node|master node|etcd|kubelet|api server|control plane/i.test(processed)) {
      const k8sDiagram = `\`\`\`mermaid
graph TD
    subgraph Master_Control_Plane["☸️ Kubernetes Control Plane (Master Node)"]
        APIServer["⚡ API Server (kube-apiserver)"]
        ETCD["🗄️ etcd (State Store)"]
        Controller["⚙️ Controller Manager"]
        Scheduler["📅 Kube-Scheduler"]

        APIServer <--> ETCD
        APIServer <--> Controller
        APIServer <--> Scheduler
    end

    subgraph Worker_Nodes["🖥️ Worker Nodes (Compute Cluster)"]
        Kubelet["🔌 Kubelet Agent"]
        Proxy["🌐 Kube-Proxy Network"]
        Pods["📦 Container Pods"]

        Kubelet --> APIServer
        Proxy --> APIServer
        Kubelet --> Pods
    end
\`\`\`\n\n`;
      processed = k8sDiagram + processed;
    } else if (/VNet 1|VNet 2|VNet 3|VNet peering|Virtual Network/i.test(processed)) {
      const vnetDiagram = `\`\`\`mermaid
graph LR
    subgraph Azure_Network["☁️ Azure Region (Virtual Networks)"]
        direction LR
        subgraph VNet1_Box["🌐 VNet 1"]
            VNet1["VNet 1 (Hub / Origin)"]
        end
        subgraph VNet2_Box["🌐 VNet 2"]
            VNet2["VNet 2 (Transit Gateway / Router)"]
        end
        subgraph VNet3_Box["🌐 VNet 3"]
            VNet3["VNet 3 (Spoke Target)"]
        end
    end

    VNet1 -->|Direct VNet Peering| VNet2
    VNet2 -->|Direct VNet Peering| VNet3
    VNet1 -.->|Transitive Routing via VNet 2| VNet3
\`\`\`\n\n`;
      processed = vnetDiagram + processed;
    }
  }

  return processed;
}

function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function MessageBubble({ msg, onRetry }) {
  const isRCA = msg.rca_data && (msg.rca_data.investigation_id || msg.rca_data.probable_root_cause);
  const isError = msg.is_error;
  const processedContent = preprocessMarkdownContent(msg.content);

  if (isError) {
    return (
      <div className="flex gap-3 justify-start">
        <div className="w-8 h-8 rounded-xl bg-rose-600/60 flex items-center justify-center shrink-0">
          <Bot size={15} />
        </div>
        <ErrorCard
          error={msg.error}
          onRetry={onRetry ? () => onRetry(msg.original_prompt) : null}
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
      <div className="max-w-[85%] min-w-[200px] px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8 text-slate-300 shadow-sm">
        {isRCA ? (
          <RCADisplay data={msg.rca_data} />
        ) : (
          <div className="prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                pre({ children }) {
                  return <>{children}</>;
                },
                code({ className, children, node, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const codeString = String(children).replace(/\n$/, "");
                  const isInline = !className && !codeString.includes("\n");

                  if (language === "mermaid" || codeString.trim().startsWith("graph ") || codeString.trim().startsWith("flowchart ")) {
                    return <MermaidDiagram code={codeString} />;
                  }

                  if (isInline) {
                    return (
                      <code className="bg-slate-800/80 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono inline border border-indigo-500/20" {...props}>
                        {children}
                      </code>
                    );
                  }

                  return (
                    <pre className="bg-[#020617] border border-white/10 rounded-xl p-3 overflow-x-auto font-mono text-xs text-slate-300 my-2">
                      <code className="text-xs font-mono text-slate-300" {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        )}
        {msg.timestamp && (
          <p className="text-[10px] text-slate-600 mt-2">{timeAgo(msg.timestamp)}</p>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ error, onRetry }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRequestId = async () => {
    if (error?.request_id) {
      await navigator.clipboard.writeText(error.request_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-rose-500/20 rounded-2xl rounded-tl-sm p-4 bg-rose-500/5 max-w-[85%]" role="alert">
      <div className="flex items-start gap-2.5 mb-3">
        <AlertTriangle size={15} className="text-rose-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-rose-300 mb-0.5">AI Analysis Unavailable</p>
          <p className="text-xs text-rose-300/80 leading-relaxed">{error?.message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {error?.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
        {error?.request_id && (
          <button
            onClick={copyRequestId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-xs hover:bg-white/8 transition-colors"
          >
            <Copy size={11} />
            {copied ? "Copied!" : "Copy ID"}
          </button>
        )}
      </div>

      {error?.request_id && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-500 mt-2 transition-colors"
        >
          <Info size={9} />
          {showDetails ? "Hide" : "Show"} technical details
        </button>
      )}
      {showDetails && error?.request_id && (
        <div className="mt-2 p-2 bg-black/30 rounded-lg text-[10px] font-mono text-slate-500">
          <p>Request ID: {error.request_id}</p>
          {error.code && <p>Error code: {error.code}</p>}
        </div>
      )}
    </div>
  );
}

function RCADisplay({ data }) {
  const [showTools, setShowTools] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const confidenceText = data.confidence
    ? `${data.confidence.charAt(0).toUpperCase() + data.confidence.slice(1)} confidence`
    : null;

  return (
    <div className="space-y-3 w-full">
      {data.insufficient_evidence_warning && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20" role="alert">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-0.5">Insufficient Evidence</p>
            <p className="text-xs text-amber-300/80">{data.insufficient_evidence_warning}</p>
          </div>
        </div>
      )}

      {data.incident_summary && (
        <div className="p-3 rounded-xl bg-white/4 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Incident Summary</p>
          <p className="text-xs text-slate-200 leading-relaxed">{data.incident_summary}</p>
        </div>
      )}

      {data.probable_root_cause && (
        <div className="p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Probable Root Cause</p>
            {confidenceText && (
              <span className="px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
                {confidenceText}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{data.probable_root_cause}</p>
        </div>
      )}

      {data.impact && (
        <div className="p-3 rounded-xl bg-white/3 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impact</p>
          <p className="text-xs text-slate-300 leading-relaxed">{data.impact}</p>
        </div>
      )}

      {data.recommended_resolution && (
        <div className="p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/15">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Recommended Resolution</p>
          <div className="text-xs text-slate-300 leading-relaxed">
            <ReactMarkdown>{data.recommended_resolution}</ReactMarkdown>
          </div>
        </div>
      )}

      {data.live_evidence && data.live_evidence.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence((v) => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 mb-2"
          >
            {showEvidence ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Zap size={11} className="text-cyan-400" />
            {data.live_evidence.length} evidence items
          </button>
          {showEvidence && (
            <div className="space-y-2">
              {data.live_evidence.map((e, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-white/5 bg-black/30 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="uppercase text-cyan-400">{e.source}</span>
                    <span>{e.evidence_type}</span>
                  </div>
                  <p className="text-slate-300 text-xs">{e.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] text-slate-600 pt-1 border-t border-white/4">
        {data.investigation_duration_seconds && (
          <span className="flex items-center gap-1">
            <Clock size={9} /> {data.investigation_duration_seconds}s
          </span>
        )}
        <span className="ml-auto capitalize">{data.execution_path?.replace(/_/g, " ")}</span>
      </div>
    </div>
  );
}
