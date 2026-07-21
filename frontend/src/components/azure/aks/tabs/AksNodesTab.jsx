"use client";

import React from "react";
import { CheckCircle, XCircle } from "lucide-react";

export default function AksNodesTab({ nodes }) {
  if (!nodes || nodes.length === 0) {
    return <div className="text-center p-8 text-slate-400">No nodes found.</div>;
  }

  return (
    <div className="animate-in fade-in duration-300">
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-500 font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Node Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Instance / OS</th>
                <th className="px-4 py-3">Capacity (CPU/Mem)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {nodes.map((n, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{n.name}</td>
                  <td className="px-4 py-3">
                    <span className={`flex w-fit px-2 py-0.5 rounded border items-center gap-1.5 text-[10px] font-bold uppercase ${n.ready_status === 'True' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-rose-400 border-rose-500/20 bg-rose-500/10'}`}>
                      {n.ready_status === 'True' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {n.ready_status === 'True' ? 'Ready' : 'NotReady'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{n.kubernetes_version}</td>
                  <td className="px-4 py-3 text-xs">
                    <div>{n.instance_type}</div>
                    <div className="text-[10px] text-slate-500">{n.os_image}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-sky-400">{n.cpu_capacity} / {n.memory_capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
