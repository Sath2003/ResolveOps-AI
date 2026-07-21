"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import {
  Plus, Search, MessageSquare, Trash2, Pencil, Check, X, Pin,
  Clock, ChevronRight, Loader2
} from "lucide-react";

function timeAgo(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function ChatHistorySidebar({ currentSessionId, onSessionSelect, onNewChat }) {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchApi("/api/chat/sessions");
      if (Array.isArray(data)) {
        // Sort: pinned first, then by most recent
        const sorted = [...data].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (b.timestamp || "").localeCompare(a.timestamp || "");
        });
        setSessions(sorted);
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Listen for chat updates dispatched from main chat area
  useEffect(() => {
    const handler = () => loadSessions();
    window.addEventListener("chat-updated", handler);
    return () => window.removeEventListener("chat-updated", handler);
  }, [loadSessions]);

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (deletingId === sessionId) {
      // Confirmed delete
      try {
        await fetchApi(`/api/chat/history?session_id=${sessionId}`, { method: "DELETE" });
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
        if (currentSessionId === sessionId) {
          onNewChat?.();
        }
      } catch (err) {
        console.error("Delete failed:", err);
      }
      setDeletingId(null);
    } else {
      setDeletingId(sessionId);
      // Auto cancel confirm after 3s
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const startRename = (e, session) => {
    e.stopPropagation();
    setRenamingId(session.session_id);
    setRenameValue(session.title || "New Chat");
  };

  const confirmRename = async (e, sessionId) => {
    e.stopPropagation();
    if (!renameValue.trim()) return;
    try {
      await fetchApi(`/api/v1/chat/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      setSessions(prev => prev.map(s =>
        s.session_id === sessionId ? { ...s, title: renameValue.trim() } : s
      ));
    } catch (err) {
      // Optimistic update even if API not yet wired
      setSessions(prev => prev.map(s =>
        s.session_id === sessionId ? { ...s, title: renameValue.trim() } : s
      ));
    }
    setRenamingId(null);
  };

  const cancelRename = (e) => {
    e.stopPropagation();
    setRenamingId(null);
  };

  const filteredSessions = sessions.filter(s =>
    !searchQuery || (s.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedSessions = filteredSessions.filter(s => s.pinned);
  const recentSessions = filteredSessions.filter(s => !s.pinned);

  return (
    <div className="flex flex-col h-full w-64 border-r border-white/5 bg-[#060610]">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-900/30 group"
        >
          <Plus size={15} className="group-hover:rotate-90 transition-transform duration-200" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-white/5 border border-white/8 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-slate-600" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare size={28} className="text-slate-700 mx-auto mb-3" />
            <p className="text-xs text-slate-600 leading-relaxed">
              {searchQuery
                ? "No conversations match your search."
                : "Start a new AI Copilot conversation to analyze incidents, pipelines, cloud resources, or architecture risks."}
            </p>
          </div>
        ) : (
          <>
            {pinnedSessions.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest px-2 py-1.5 flex items-center gap-1">
                  <Pin size={9} /> Pinned
                </p>
                {pinnedSessions.map(s => (
                  <SessionItem
                    key={s.session_id}
                    session={s}
                    isActive={s.session_id === currentSessionId}
                    isRenaming={renamingId === s.session_id}
                    isDeleting={deletingId === s.session_id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onSelect={() => onSessionSelect?.(s.session_id)}
                    onRenameStart={startRename}
                    onRenameConfirm={confirmRename}
                    onRenameCancel={cancelRename}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {recentSessions.length > 0 && (
              <div>
                {pinnedSessions.length > 0 && (
                  <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest px-2 py-1.5 flex items-center gap-1 mt-2">
                    <Clock size={9} /> Recent
                  </p>
                )}
                {recentSessions.map(s => (
                  <SessionItem
                    key={s.session_id}
                    session={s}
                    isActive={s.session_id === currentSessionId}
                    isRenaming={renamingId === s.session_id}
                    isDeleting={deletingId === s.session_id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onSelect={() => onSessionSelect?.(s.session_id)}
                    onRenameStart={startRename}
                    onRenameConfirm={confirmRename}
                    onRenameCancel={cancelRename}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionItem({
  session, isActive, isRenaming, isDeleting,
  renameValue, onRenameChange,
  onSelect, onRenameStart, onRenameConfirm, onRenameCancel, onDelete
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col gap-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-violet-600/20 border border-violet-500/30 text-white"
          : "hover:bg-white/5 text-slate-400 border border-transparent hover:border-white/5"
      }`}
    >
      {isRenaming ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") onRenameConfirm(e, session.session_id);
              if (e.key === "Escape") onRenameCancel(e);
            }}
            className="flex-1 bg-white/10 border border-indigo-500/50 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none min-w-0"
          />
          <button onClick={e => onRenameConfirm(e, session.session_id)} className="text-emerald-400 hover:text-emerald-300 shrink-0">
            <Check size={13} />
          </button>
          <button onClick={onRenameCancel} className="text-slate-500 hover:text-slate-300 shrink-0">
            <X size={13} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-1">
            <span className={`text-xs font-medium truncate flex-1 leading-snug ${isActive ? "text-white" : "text-slate-300"}`}>
              {session.title || "New Chat"}
            </span>
            {/* Action buttons - shown on hover */}
            <div className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              <button
                onClick={e => onRenameStart(e, session)}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
                title="Rename"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={e => onDelete(e, session.session_id)}
                className={`p-1 rounded transition-colors ${
                  isDeleting
                    ? "bg-rose-500/20 text-rose-400 hover:text-rose-300"
                    : "hover:bg-white/10 text-slate-500 hover:text-rose-400"
                }`}
                title={isDeleting ? "Click again to confirm" : "Delete"}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600 truncate flex-1">
              {session.last_message || (session.title ? `${session.message_count || 0} messages` : "No messages yet")}
            </span>
            <span className="text-[10px] text-slate-700 shrink-0 ml-1">
              {timeAgo(session.timestamp)}
            </span>
          </div>
          {isActive && (
            <ChevronRight size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-violet-400" />
          )}
        </>
      )}
    </div>
  );
}
