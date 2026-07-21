"use client";

import React, { useState, useEffect } from "react";
import { Activity, AlertTriangle, CheckCircle, Clock, Cpu, HardDrive, Layout, Server, ShieldAlert, Sparkles, XCircle, AlertCircle } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import AksOverviewTab from "./tabs/AksOverviewTab";
import AksRisksTab from "./tabs/AksRisksTab";
import AksPodsTab from "./tabs/AksPodsTab";
import AksDeploymentsTab from "./tabs/AksDeploymentsTab";
import AksNodesTab from "./tabs/AksNodesTab";
import AksEventsTab from "./tabs/AksEventsTab";

export default function AksWorkloadSummary({ k8sData, clusterId }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabQuery = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(tabQuery);

  useEffect(() => {
    if (tabQuery !== activeTab) {
      setActiveTab(tabQuery);
    }
  }, [tabQuery]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };

  if (!k8sData || !k8sData.enabled) {
    return (
      <div className="glass-panel p-8 rounded-xl border border-rose-500/30 bg-rose-500/5 mb-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-rose-500/20 rounded-full text-rose-400">
            <XCircle size={24} />
          </div>
          <div className="w-full">
            <h3 className="text-xl font-bold text-white mb-2">{k8sData?.title || "Kubernetes Connection Failed"}</h3>
            <p className="text-sm text-slate-300 mb-4">{k8sData?.message || "Failed to establish connection to the Kubernetes API server."}</p>
            
            {k8sData?.reason === "permission_missing" || k8sData?.status === "permission_missing" ? (
                <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-lg mt-4 space-y-6">
                    <div>
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Required Role</h4>
                        <p className="text-sm font-semibold text-white">{k8sData?.required_role || "Azure Kubernetes Service Cluster User Role"}</p>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3">Troubleshooting Steps</h4>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-rose-300/90 marker:text-rose-500 font-medium">
                            <li>Go to <span className="text-white">Azure Portal</span></li>
                            <li>Open the <span className="text-white">AKS cluster</span></li>
                            <li>Go to <span className="text-white">Access control (IAM)</span></li>
                            <li>Click <span className="text-white">Add role assignment</span></li>
                            <li>Select: <span className="bg-rose-500/20 px-2 py-0.5 rounded text-white font-mono text-xs">Azure Kubernetes Service Cluster User Role</span></li>
                            <li>Assign access to: <span className="text-white">User, group, or service principal</span></li>
                            <li>Select the <span className="text-white">ResolveOps AI App Registration / Service Principal</span></li>
                            <li>Save and wait a few minutes for RBAC propagation</li>
                            <li>Click Retry AKS Connection below</li>
                        </ol>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">CLI Command</h4>
                        <pre className="bg-black/50 p-4 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto border border-rose-500/20 whitespace-pre">
{`az role assignment create \\
  --assignee <RESOLVEOPS_SERVICE_PRINCIPAL_CLIENT_ID_OR_OBJECT_ID> \\
  --role "Azure Kubernetes Service Cluster User Role" \\
  --scope <AKS_RESOURCE_ID>`}
                        </pre>
                    </div>
                    <div className="pt-2">
                         <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-rose-500/20">
                             <Activity size={16} /> Retry AKS Connection
                         </button>
                    </div>
                </div>
            ) : (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg mt-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">Recommended Action</h4>
                    <p className="text-sm text-rose-300/80">{k8sData?.recommended_action || "Check cluster permissions and network connectivity."}</p>
                  </div>
                  <div className="pt-2">
                       <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-rose-500/20">
                           <Activity size={16} /> Retry AKS Connection
                       </button>
                  </div>
                </div>
            )}
            <p className="text-xs text-slate-500 font-mono mt-4">Reason: {k8sData?.reason || k8sData?.status || "unknown"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { summary, namespaces, nodes, pods, deployments, services, events, risks } = k8sData;

  const TABS = [
    { id: "overview", label: "Overview", icon: Layout },
    { id: "risks", label: "Risks", icon: ShieldAlert, badge: risks?.length > 0 ? risks.length : null },
    { id: "pods", label: "Pods", icon: Cpu, badge: summary?.pods },
    { id: "deployments", label: "Deployments", icon: HardDrive },
    { id: "nodes", label: "Nodes", icon: Server },
    { id: "events", label: "Events", icon: Activity, badge: events?.length > 0 ? events.length : null }
  ];

  return (
    <div className="space-y-6 mb-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <Layout className="text-emerald-400" size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Kubernetes Workloads</h2>
          <p className="text-sm text-slate-400 mt-1">Real-time cluster telemetry and AI-driven risk analysis</p>
        </div>
        <span className="ml-auto px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest rounded-full flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Connected
        </span>
      </div>

      {/* Horizontal Tab Bar */}
      <div className="glass-panel p-2 rounded-xl border border-slate-800 flex overflow-x-auto hide-scrollbar snap-x">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap snap-start ${
                isActive ? "bg-slate-800 text-white shadow-lg" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Icon size={16} className={isActive ? "text-indigo-400" : ""} />
              {tab.label}
              {tab.badge != null && (
                <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-indigo-500 text-white" : "bg-slate-900 text-slate-500"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && <AksOverviewTab summary={summary} risks={risks} setActiveTab={handleTabChange} clusterId={clusterId} />}
        {activeTab === "risks" && <AksRisksTab risks={risks} clusterId={clusterId} />}
        {activeTab === "pods" && <AksPodsTab pods={pods} />}
        {activeTab === "deployments" && <AksDeploymentsTab deployments={deployments} />}
        {activeTab === "nodes" && <AksNodesTab nodes={nodes} />}
        {activeTab === "events" && <AksEventsTab events={events} />}
      </div>
    </div>
  );
}

