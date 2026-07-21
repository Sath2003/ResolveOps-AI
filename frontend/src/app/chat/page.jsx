"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ChatHistorySidebar from "@/components/ai/ChatHistorySidebar";
import {
  MessageSquareCode, Send, Bot, User, Activity,
  Sun, Sunset, Moon, Paperclip, Mic, Square, Sparkles
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";

const ExcalidrawBoard = dynamic(
  () => import("@/components/common/ExcalidrawBoard"),
  { ssr: false }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Secret Redaction ────────────────────────────────────────────────────────
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

// ─── Excalidraw helper ───────────────────────────────────────────────────────
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
    } catch (e) {
      return (
        <div>
          <div className="bg-rose-950/20 border border-rose-500/30 text-rose-400 p-3 rounded-lg text-xs font-mono my-2">
            Failed to render diagram. {String(e)}
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AICopilot() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const messagesEndRef = useRef(null);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [voiceSending, setVoiceSending] = useState(false);

  const buildWelcome = useCallback((name) => {
    const firstName = name?.split(" ")[0] || "";
    const greeting = getGreeting();
    return firstName
      ? `${greeting}, ${firstName}! 👋 I am the **ResolveOps AI Copilot**. I have full visibility into your active incidents, pipelines, and cloud resources. How can I assist you today?`
      : `${greeting}! 👋 I am the **ResolveOps AI Copilot**. How can I assist you today?`;
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
            : msg.content || ""
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

  // ── Auth + initial load ───────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) { router.push("/login"); return; }
    const payload = decodeJwtPayload(token);
    const name = payload.username || payload.full_name || payload.email?.split("@")[0] || "";
    setFullName(name);

    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (sid) {
      setSessionId(sid);
      loadSession(sid, name);
    } else {
      setMessages([{ role: "assistant", content: buildWelcome(name) }]);
      setLoading(false);
    }
  }, [pathname, router, loadSession, buildWelcome]);

  // ── Pre-fill query from URL ───────────────────────────────────────────────
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setInput(q);
  }, [pathname]);

  // ── Auto scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Session selection from sidebar ────────────────────────────────────────
  const handleSessionSelect = (sid) => {
    setSessionId(sid);
    router.replace(`/chat?session_id=${sid}`);
    loadSession(sid, fullName);
  };

  // ── New chat ──────────────────────────────────────────────────────────────
  const startNewChat = () => {
    setSessionId(null);
    setInput("");
    setImageFile(null);
    router.replace("/chat");
    setMessages([{ role: "assistant", content: buildWelcome(fullName) }]);
  };

  // ── Image handler ─────────────────────────────────────────────────────────
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

  // ── Voice recorder ────────────────────────────────────────────────────────
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

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() && !imageFile) return;
    const rawMsg = input.trim();
    const safeMsg = redactSecrets(rawMsg);
    const userDisplayContent = imageFile ? `🖼️ [Uploaded Architecture Diagram] ${safeMsg}` : safeMsg;
    setMessages(prev => [...prev, { role: "user", content: userDisplayContent }]);
    setInput("");
    setSending(true);
    const currentImage = imageFile;
    setImageFile(null);

    try {
      const payload = { message: safeMsg || "Analyze this uploaded infrastructure architecture diagram.", image_base64: currentImage };
      if (sessionId) payload.session_id = sessionId;
      const data = await fetchApi("/api/chat", { method: "POST", body: JSON.stringify(payload) });
      setMessages(prev => [...prev, { role: "assistant", content: data.answer }]);
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        router.replace(`/chat?session_id=${data.session_id}`);
      }
      window.dispatchEvent(new Event("chat-updated"));
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ **Error:** ${err.message}` }]);
    } finally {
      setSending(false);
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

        {/* ── Left Sidebar: Chat History ───────────────────────────────── */}
        <ChatHistorySidebar
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={startNewChat}
        />

        {/* ── Right Panel: Chat Area ───────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#080812]/80 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <MessageSquareCode size={18} className="text-indigo-400" />
                {sessionId ? "AI Copilot" : "New Conversation"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <GreetingIcon size={12} className="text-amber-400" />
                {getGreeting()}{fullName ? `, ${fullName.split(" ")[0]}` : ""} · Powered by Amazon Bedrock
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                <Sparkles size={11} />
                AI Active
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4">
                  <MessageSquareCode size={24} className="text-indigo-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-2">Start a conversation</p>
                <p className="text-slate-600 text-xs max-w-sm leading-relaxed">
                  Start a new AI Copilot conversation to analyze incidents, pipelines, cloud resources, or architecture risks.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role !== "user" && (
                  <div className="w-8 h-8 rounded-xl bg-emerald-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/30">
                    <Bot size={15} />
                  </div>
                )}
                <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                    ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-100 whitespace-pre-wrap rounded-tr-sm"
                    : "bg-white/4 border border-white/8 text-slate-300 shadow-sm rounded-tl-sm"
                  }`}>
                  {msg.role === "user" ? msg.content : (
                    <div className="prose-sm max-w-none">
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
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/30">
                    <User size={15} />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/80 flex items-center justify-center shrink-0">
                  <Bot size={15} />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8 flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
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
                >
                  Remove
                </button>
              </div>
            )}
            <div className="relative flex items-center bg-[#0a0a12] border border-white/8 rounded-xl px-4 py-2.5 focus-within:border-indigo-500/40 transition-all duration-200 gap-3">
              <label className="cursor-pointer text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Attach file">
                <Paperclip size={17} />
                <input type="file" accept="image/*,.txt,.log,.json,.csv,.md" className="hidden" onChange={handleImageChange} />
              </label>

              <button
                onClick={toggleRecording}
                disabled={voiceSending}
                className={`shrink-0 transition-colors ${isRecording ? "text-rose-400 animate-pulse" : "text-slate-500 hover:text-slate-300"} ${voiceSending ? "opacity-40 cursor-not-allowed" : ""}`}
                title="Voice input"
              >
                {isRecording ? <Square size={17} /> : <Mic size={17} />}
              </button>

              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  voiceSending ? "Transcribing voice..."
                    : isRecording ? "Recording… press stop when done."
                      : "Ask anything about incidents, pipelines, AKS, costs, architecture…"
                }
                disabled={isRecording || voiceSending}
                className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-slate-600 py-1"
              />

              <button
                onClick={handleSend}
                disabled={sending || voiceSending || isRecording || (!input.trim() && !imageFile)}
                className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-md shadow-indigo-900/40"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] text-slate-700 text-center mt-2">
              Secrets and credentials are automatically redacted before storage.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
