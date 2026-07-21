"use client";

import React, { useState } from "react";
import { Search, Filter } from "lucide-react";

export default function AksPodsTab({ pods }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  if (!pods || pods.length === 0) {
    return <div className="text-center p-8 text-slate-400">No pods found.</div>;
  }

  // Get unique namespaces
  const namespaces = ["all", ...new Set(pods.map(p => p.namespace))];

  const filteredPods = pods.filter(p => {
    if (namespaceFilter !== "all" && p.namespace !== namespaceFilter) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredPods.length / PAGE_SIZE);
  const paginatedPods = filteredPods.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-lg border border-slate-800">
          <Filter size={16} className="text-slate-500 ml-2" />
          <select 
            className="bg-transparent text-sm text-white focus:outline-none py-1 pr-4 cursor-pointer"
            value={namespaceFilter}
            onChange={(e) => { setNamespaceFilter(e.target.value); setPage(1); }}
          >
            {namespaces.map(ns => (
              <option key={ns} value={ns}>{ns === "all" ? "All Namespaces" : ns}</option>
            ))}
          </select>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search pods..." 
            className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-500 font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Namespace</th>
                <th className="px-4 py-3">Pod Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Node</th>
                <th className="px-4 py-3">Restarts</th>
                <th className="px-4 py-3">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedPods.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">No pods match your search.</td>
                </tr>
              ) : (
                paginatedPods.map((p, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400">{p.namespace}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-200">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        p.status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        p.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 truncate max-w-[150px]" title={p.node_name}>{p.node_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.restart_count > 0 ? (p.restart_count > 5 ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10') : 'text-slate-500'}`}>
                        {p.restart_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">
                      {p.start_time ? new Date(p.start_time).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-slate-900/40 p-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredPods.length)} of {filteredPods.length} pods</span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                Prev
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
