"use client";

import React, { useState } from "react";
import { Search, AlertTriangle, CheckCircle } from "lucide-react";

export default function AksDeploymentsTab({ deployments }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  if (!deployments || deployments.length === 0) {
    return <div className="text-center p-8 text-slate-400">No deployments found.</div>;
  }

  const filtered = deployments.filter(d => {
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase()) && !d.namespace.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-4 relative w-full sm:w-64">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input 
          type="text" 
          placeholder="Search deployments..." 
          className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
        />
      </div>

      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-500 font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Namespace</th>
                <th className="px-4 py-3">Deployment</th>
                <th className="px-4 py-3">Desired</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Unavailable</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">No deployments match your search.</td>
                </tr>
              ) : (
                paginated.map((d, i) => {
                  const isDegraded = d.unavailable_replicas > 0 || d.available_replicas < d.desired_replicas;
                  return (
                    <tr key={i} className={`hover:bg-white/5 transition-colors ${isDegraded ? 'bg-rose-500/5' : ''}`}>
                      <td className="px-4 py-3 text-xs text-slate-400">{d.namespace}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-200">{d.name}</td>
                      <td className="px-4 py-3 text-xs">{d.desired_replicas}</td>
                      <td className="px-4 py-3 text-xs text-emerald-400">{d.available_replicas}</td>
                      <td className="px-4 py-3 text-xs text-rose-400">{d.unavailable_replicas}</td>
                      <td className="px-4 py-3">
                        {isDegraded ? (
                          <span className="text-rose-400 flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 border border-rose-500/20 bg-rose-500/10 rounded w-fit"><AlertTriangle size={12} /> Degraded</span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/10 rounded w-fit"><CheckCircle size={12} /> Healthy</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="bg-slate-900/40 p-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} deployments</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white">Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
