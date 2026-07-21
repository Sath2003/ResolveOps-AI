"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fetchApi } from "@/lib/api";
import { Activity, AlertCircle, ArrowLeft, Cpu, Hexagon, Info, Server, Sparkles, AlertTriangle, DollarSign, CheckCircle } from "lucide-react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import AksWorkloadSummary from "@/components/azure/aks/AksWorkloadSummary";
import ResourceRiskList from "@/components/resource-intelligence/ResourceRiskList";
import { normalizeRiskEvent } from "@/lib/resourceRiskFormatters";

export default function ResourceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  
  const rawId = params.id;
  const resourceId = decodeURIComponent(rawId);
  
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [children, setChildren] = useState([]);
  const [activities, setActivities] = useState([]);
  
  const [analyzingLogId, setAnalyzingLogId] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState({});

  useEffect(() => {
    if (!resourceId) return;
    
    Promise.all([
      fetchApi(`/api/v1/cloud/azure/resource?resource_id=${encodeURIComponent(resourceId)}`).catch(() => ({ details: null, children: [] })),
      fetchApi(`/api/v1/cloud/azure/activity?resource_id=${encodeURIComponent(resourceId)}`).catch(() => [])
    ]).then(([resData, activityData]) => {
      if (resData.details) {
        setDetails({
          ...resData.details,
          tenant_id: resData.tenant_id,
          user_email: resData.user_email
        });
        setChildren(resData.children || []);
      }
      setActivities(Array.isArray(activityData) ? activityData : []);
      setLoading(false);
    });
  }, [resourceId]);

  const handleAnalyzeFailure = async (log) => {
    if (aiAnalysis[log.id]) return; // Already analyzed
    
    setAnalyzingLogId(log.id);
    try {
      const result = await fetchApi("/api/v1/ai/analyze-failure", {
        method: "POST",
        body: JSON.stringify({
          log_message: log.description || log.operationName,
          resource_id: resourceId
        })
      });
      setAiAnalysis(prev => ({ ...prev, [log.id]: result.analysis }));
    } catch (err) {
      setAiAnalysis(prev => ({ ...prev, [log.id]: "Failed to analyze failure with AI Copilot." }));
    } finally {
      setAnalyzingLogId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex items-center justify-center">
          <Activity className="animate-spin text-indigo-500 w-8 h-8" />
        </div>
      </DashboardLayout>
    );
  }

  if (!details) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full text-slate-400">
          Resource not found or failed to load.
        </div>
      </DashboardLayout>
    );
  }

  const isResourceGroup = details.type === "Resource Group";

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full font-sans pb-10 max-w-[1500px] mx-auto w-full px-4 lg:px-8">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 w-fit transition-colors"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div className="glass-panel rounded-2xl p-8 mb-8 border border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Hexagon size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                {details.type}
              </span>
              <span className="text-xs text-slate-500 font-mono bg-slate-900/50 px-2 py-1 rounded-md">
                {details.location}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">{details.name}</h1>
            
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-1 rounded border border-slate-700/50">
                Connected User: <strong className="text-slate-200">{details.user_email || "Unknown"}</strong>
              </span>
              <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-1 rounded border border-slate-700/50">
                Tenant: <strong className="text-slate-200">{details.tenant_id ? details.tenant_id.substring(0, 8) + "..." : "Unknown"}</strong>
              </span>
            </div>
            
            {details.tags && Object.keys(details.tags).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(details.tags).map(([k, v]) => (
                  <span key={k} className="text-[11px] text-slate-400 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                    <span className="text-slate-500">{k}:</span> {v}
                  </span>
                ))}
              </div>
            )}
            
            <div className="mt-4 text-xs text-slate-600 font-mono break-all">
              {details.id}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="text-sky-400" /> Activity Logs & Failures
            </h3>
            
            <ResourceRiskList 
              items={activities.map(log => normalizeRiskEvent(log, "azure", details.type))} 
              emptyType="events" 
            />
          </div>

          <div className="space-y-6">
            {details.cost_intelligence && (
              <div className="glass-panel p-6 rounded-xl border border-sky-500/30 bg-black/40 shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="flex justify-between items-center mb-6 relative z-10 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-emerald-400" size={20} />
                    <h3 className="text-xl font-bold text-white">Cost Intelligence</h3>
                  </div>
                </div>

                <div className="space-y-6 relative z-10">
                  {/* Actual Billed Cost */}
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <CheckCircle size={14} className="text-emerald-500" /> Actual Billed Cost
                      </h4>
                      {details.cost_intelligence.actual_cost?.status === "permission_required" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Permission Required
                        </span>
                      ) : details.cost_intelligence.actual_cost?.status === "unavailable" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 bg-slate-500/10 text-slate-400 border-slate-500/20">
                          Unavailable
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Available
                        </span>
                      )}
                    </div>

                    {details.cost_intelligence.actual_cost?.status === "permission_required" ? (
                      <p className="text-xs text-amber-400/80 mb-2">{details.cost_intelligence.actual_cost.message}</p>
                    ) : details.cost_intelligence.actual_cost?.status === "unavailable" ? (
                      <p className="text-xs text-slate-400 mb-2">{details.cost_intelligence.actual_cost?.message || "Actual cost data unavailable."}</p>
                    ) : (
                      <div className="flex items-end gap-2 mb-1">
                        <span className="text-3xl font-black text-white tracking-tight">
                          {details.cost_intelligence.actual_cost?.currency === "INR" ? "₹" : "$"}
                          {(details.cost_intelligence.actual_cost?.month_to_date || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </span>
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1.5">MTD</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 font-mono">Source: Azure Cost Management</p>
                  </div>

                  {/* Estimated Running Price */}
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <Activity size={14} className="text-sky-400" /> Estimated Running Price
                      </h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 ${
                        details.cost_intelligence.estimated_running_price?.status === 'unavailable' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      }`}>
                        {details.cost_intelligence.estimated_running_price?.status || 'Unknown'}
                      </span>
                    </div>

                    {details.cost_intelligence.estimated_running_price?.status === "unavailable" ? (
                      <p className="text-xs text-slate-400">{details.cost_intelligence.estimated_running_price?.warnings?.[0] || "Estimate unavailable."}</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                          <div className="bg-black/30 p-3 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Hourly</p>
                            <p className="text-lg font-bold text-white font-mono">
                              {details.cost_intelligence.estimated_running_price?.currency === "INR" ? "₹" : "$"}
                              {(details.cost_intelligence.estimated_running_price?.hourly || 0).toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4})}
                            </p>
                          </div>
                          <div className="bg-black/30 p-3 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Daily</p>
                            <p className="text-lg font-bold text-white font-mono">
                              {details.cost_intelligence.estimated_running_price?.currency === "INR" ? "₹" : "$"}
                              {(details.cost_intelligence.estimated_running_price?.daily || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </p>
                          </div>
                          <div className="bg-sky-900/10 p-3 rounded-lg border border-sky-500/20">
                            <p className="text-[10px] text-sky-400/70 uppercase font-bold tracking-wider mb-1">Monthly</p>
                            <p className="text-lg font-bold text-sky-400 font-mono">
                              {details.cost_intelligence.estimated_running_price?.currency === "INR" ? "₹" : "$"}
                              {(details.cost_intelligence.estimated_running_price?.monthly || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </p>
                          </div>
                        </div>

                        {Array.isArray(details.cost_intelligence.breakdown) && details.cost_intelligence.breakdown.length > 0 && (
                          <div className="mt-4 border-t border-slate-800 pt-4">
                            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cost Breakdown</h5>
                            <div className="space-y-2">
                              {details.cost_intelligence.breakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs bg-black/20 p-2 rounded">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-300">{item.component} - {item.name}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{item.quantity} × {item.sku}</span>
                                  </div>
                                  <div className="text-right font-mono text-sky-300">
                                    {details.cost_intelligence.estimated_running_price?.currency === "INR" ? "₹" : "$"}
                                    {item.hourly_total?.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4})} / hr
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {Array.isArray(details.cost_intelligence.estimated_running_price?.warnings) && details.cost_intelligence.estimated_running_price.warnings.map((w, idx) => (
                           <p key={idx} className="text-[10px] text-slate-500 mt-3 italic flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> {w}</p>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Server className="text-emerald-400" /> 
              {isResourceGroup ? "Child Resources" : "Related Information"}
            </h3>
            
            {isResourceGroup ? (
              children.length === 0 ? (
                <div className="glass-panel p-6 rounded-xl text-center text-slate-400 border border-slate-800 text-sm">
                  This resource group is currently empty.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {children.map(child => {
                    const isCompute = child.type.includes("VirtualMachines") || child.type.includes("managedClusters");
                    const ChildIcon = isCompute ? Cpu : Hexagon;
                    return (
                      <div key={child.id} className="glass-panel p-4 rounded-xl border border-slate-800 flex items-start gap-3 hover:border-slate-700 transition-colors cursor-pointer" onClick={() => router.push(`/azure/resource/${encodeURIComponent(child.id)}`)}>
                        <div className="p-2 rounded bg-slate-800 text-slate-300">
                          <ChildIcon size={16} />
                        </div>
                        <div className="overflow-hidden">
                          <h5 className="text-white text-sm font-medium truncate">{child.name}</h5>
                          <p className="text-[10px] text-slate-500 uppercase mt-1 truncate">{child.type.split('/').pop()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : details.kubernetes ? (
              <div className="lg:col-span-1">
                 <div className="glass-panel p-6 rounded-xl border border-slate-800 mb-6">
                    <div className="flex items-start gap-3 mb-4">
                      <Cpu className="text-emerald-400 shrink-0" size={20} />
                      <p className="text-sm text-slate-300">
                        This is an Azure Kubernetes Service cluster. We have established data-plane access to fetch workloads.
                      </p>
                    </div>
                  </div>
              </div>
            ) : (
              <div className="glass-panel p-6 rounded-xl border border-slate-800">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="text-amber-400 shrink-0" size={20} />
                  <p className="text-sm text-slate-300">
                    To view deeper application logs, metrics, and terminal access for this specific resource, use the <strong>Azure Hub</strong> directly.
                  </p>
                </div>
                <button 
                  onClick={() => router.push("/azure")}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Go to Azure Hub
                </button>
              </div>
            )}
          </div>
        </div>
        
        {details.kubernetes && (
          <div className="mt-8">
            <AksWorkloadSummary k8sData={details.kubernetes} clusterId={resourceId} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
