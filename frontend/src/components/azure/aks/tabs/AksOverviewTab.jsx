"use client";

import React, { useState } from "react";
import { Layout, Server, Cpu, HardDrive, ShieldAlert, Zap, Sparkles, Activity, AlertCircle } from "lucide-react";
import ResourceRiskSummaryCards from "@/components/resource-intelligence/ResourceRiskSummaryCards";
import { fetchApi } from "@/lib/api";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";

export default function AksOverviewTab({ summary, risks, setActiveTab, clusterId }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Take top 3 most severe risks
  const topRisks = risks?.slice(0, 3) || [];

  const aksMetrics = [
    { label: "Pending Pods", value: summary.pending_pods || 0, color: "amber", icon: Activity },
    { label: "Failed Pods", value: summary.failed_pods || 0, color: "slate", icon: AlertCircle }
  ];

  const handleAnalyze = async () => {
    if (analysis) return;
    setAnalyzing(true);
    try {
      const result = await fetchApi("/api/v1/ai/analyze-failure", {
        method: "POST",
        body: JSON.stringify({
          log_message: `Generate Root Cause Analysis for overall AKS Cluster Health. Found ${risks?.length || 0} risks. Top risks: ${topRisks.map(r => r.type).join(', ')}.`,
          resource_id: clusterId || "aks-cluster"
        })
      });
      setAnalysis(result.analysis);
    } catch (err) {
      setAnalysis("Failed to generate Cluster Root Cause Analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="text-emerald-400" size={20} /> Cluster Overview
        </h3>
        <button 
          onClick={handleAnalyze}
          disabled={analyzing}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
        >
          {analyzing ? <><Activity size={16} className="animate-spin" /> Generating RCA...</> : <><Sparkles size={16} /> Generate Cluster RCA</>}
        </button>
      </div>

      {analysis && (
        <div className="bg-indigo-500/5 rounded-xl border border-indigo-500/20 overflow-hidden mb-6">
          <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
            <Sparkles className="text-indigo-400" size={18} />
            <span className="text-sm font-bold text-indigo-300">AI Cluster Root Cause Analysis</span>
          </div>
          <div className="p-5 prose prose-invert prose-sm max-w-none prose-headings:text-indigo-300 prose-a:text-sky-400">
            <MarkdownRenderer content={analysis} />
          </div>
        </div>
      )}

      <ResourceRiskSummaryCards risks={risks} customMetrics={aksMetrics} />

      {/* Primary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Namespaces</p>
            <p className="text-2xl text-white font-bold">{summary.namespaces}</p>
          </div>
          <Layout className="text-slate-600" size={24} />
        </div>
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Nodes</p>
            <p className="text-2xl text-white font-bold">{summary.nodes}</p>
          </div>
          <Server className="text-sky-600" size={24} />
        </div>
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Total Pods</p>
            <p className="text-2xl text-white font-bold">{summary.pods}</p>
          </div>
          <Cpu className="text-indigo-600" size={24} />
        </div>
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Deployments</p>
            <p className="text-2xl text-white font-bold">{summary.deployments}</p>
          </div>
          <HardDrive className="text-emerald-600" size={24} />
        </div>
      </div>

      {/* Pod Health Bar */}
      <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Pod Health Status</h4>
        <div className="flex gap-2 h-4 rounded-full overflow-hidden mb-3 bg-slate-800">
          {summary.running_pods > 0 && <div style={{ width: `${(summary.running_pods / summary.pods) * 100}%` }} className="bg-emerald-500 transition-all duration-1000" title={`Running: ${summary.running_pods}`} />}
          {summary.pending_pods > 0 && <div style={{ width: `${(summary.pending_pods / summary.pods) * 100}%` }} className="bg-amber-500 transition-all duration-1000" title={`Pending: ${summary.pending_pods}`} />}
          {summary.failed_pods > 0 && <div style={{ width: `${(summary.failed_pods / summary.pods) * 100}%` }} className="bg-rose-500 transition-all duration-1000" title={`Failed: ${summary.failed_pods}`} />}
        </div>
        <div className="flex flex-wrap gap-6 text-xs font-bold text-slate-400">
          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Running: {summary.running_pods}</span>
          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> Pending: {summary.pending_pods}</span>
          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500" /> Failed: {summary.failed_pods}</span>
        </div>
      </div>

      {/* Top 3 Risks Preview */}
      {topRisks.length > 0 && (
        <div className="bg-rose-500/5 p-5 rounded-xl border border-rose-500/20">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="text-rose-400" size={16} /> Urgent Workload Risks</h4>
            <button 
              onClick={() => setActiveTab('risks')}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
            >
              View All {risks.length} Risks &rarr;
            </button>
          </div>
          <div className="space-y-3">
            {topRisks.map((risk, idx) => (
              <div key={idx} className="bg-black/40 border border-slate-800 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 mt-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    risk.severity === 'critical' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    risk.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                    'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {risk.severity}
                  </span>
                  <div>
                    <h5 className="text-sm font-bold text-slate-200">{risk.type}</h5>
                    <p className="text-[11px] text-slate-500 font-mono mt-1">{risk.resource} in {risk.namespace}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('risks')}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                >
                  Investigate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// missing Sparkles import handled in next edit
