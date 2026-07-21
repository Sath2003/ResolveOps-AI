"use client";

import React, { useState } from "react";
import { Filter, Search } from "lucide-react";
import ResourceLogDetailsDrawer from "./ResourceLogDetailsDrawer";
import ResourceEmptyState from "./ResourceEmptyState";

export default function ResourceRiskList({ items, emptyType = "risks" }) {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  if (!items || items.length === 0) {
    return <ResourceEmptyState type={emptyType} />;
  }

  const filteredItems = items.filter(r => {
    if (filterSeverity !== "all" && r.severity !== filterSeverity) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.title.toLowerCase().includes(q) || 
             r.resource_name.toLowerCase().includes(q) || 
             r.short_message.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const paginatedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="animate-in fade-in duration-300">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-lg border border-slate-800">
          <Filter size={16} className="text-slate-500 ml-2" />
          <select 
            className="bg-transparent text-sm text-white focus:outline-none py-1 pr-4 cursor-pointer"
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); setPage(1); }}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search events..." 
            className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center p-8 text-slate-400 border border-slate-800/50 rounded-xl bg-slate-900/20">
            No events match the current filters.
          </div>
        ) : (
          paginatedItems.map((item, idx) => (
            <div key={idx} className="bg-black/40 border border-slate-800 hover:border-slate-700 transition-colors p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <span className={`px-2 py-0.5 mt-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  item.severity === 'critical' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                  item.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                  item.severity === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  item.severity === 'low' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' :
                  'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                }`}>
                  {item.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-bold text-sm flex items-center gap-2 flex-wrap">
                    {item.title} 
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded font-mono truncate max-w-[200px]">{item.resource_name}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono mt-1 mb-2">
                    {new Date(item.timestamp).toLocaleString()} {item.metadata?.namespace ? ` | Namespace: ${item.metadata.namespace}` : ''}
                  </p>
                  <p className="text-xs text-slate-400 line-clamp-2 max-w-3xl">{item.short_message}</p>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedEvent(item)}
                className="shrink-0 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors mt-2 md:mt-0"
              >
                View Details
              </button>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 p-3 flex justify-between items-center text-xs text-slate-400">
          <span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredItems.length)} of {filteredItems.length} events</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white">Next</button>
          </div>
        </div>
      )}

      <ResourceLogDetailsDrawer 
        event={selectedEvent} 
        onClose={() => setSelectedEvent(null)} 
      />
    </div>
  );
}
