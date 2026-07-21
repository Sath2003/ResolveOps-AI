"use client";

import React from "react";
import { Terminal } from "lucide-react";

export default function ResourceLogPreview({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-400 text-sm flex items-center justify-center">
        No recent logs available for this resource.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log, idx) => (
        <div key={log.id || idx} className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={14} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-300">{log.title || log.event_type}</span>
            <span className="text-[10px] text-slate-500 ml-auto">{new Date(log.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-xs text-slate-400 mb-2">{log.short_message}</p>
          {log.log_preview && (
            <pre className="text-[10px] text-slate-500 font-mono bg-black/40 p-2 rounded overflow-x-auto border border-slate-800/50">
              {log.log_preview}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
