"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fetchApi } from "@/lib/api";
import { 
  Cloud, Box, GitBranch, ShieldAlert, Activity, DollarSign, 
  AlertTriangle, CheckCircle, Server, RefreshCw, ChevronRight,
  Cpu, Database, Network, Key, Zap
} from "lucide-react";
import Link from "next/link";

export default function GlobalDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState({});
  const [stats, setStats] = useState({
    aws: 0, azure: 0, 
    incidents: 0, risks: 0, cost: "$0.00", 
    failures: 0, health: "100%"
  });
  const [deployments, setDeployments] = useState([]);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetchApi("/api/v1/integrations").catch(() => ({})),
      fetchApi("/api/v1/cloud/resources").catch(() => []),
      fetchApi("/api/v1/github/deployments").catch(() => []),
      fetchApi("/api/v1/cloud/azure/cost").catch(() => ({}))
    ]).then(([integData, resData, depData, costData]) => {
      setIntegrations(integData);
      
      const awsCount = Array.isArray(resData) ? resData.filter(r => r.provider === "AWS").length : 0;
      const azureCount = Array.isArray(resData) ? resData.filter(r => r.provider === "Azure").length : 0;
      
      const failedPipelines = Array.isArray(depData) ? depData.filter(d => d.conclusion === "failure").length : 0;
      setDeployments(Array.isArray(depData) ? depData.slice(0, 3) : []);

      setStats({ 
        aws: awsCount, 
        azure: azureCount,
        incidents: 0, // In reality, fetch from an incidents API
        risks: 0,     // In reality, fetch from a risks API
        cost: costData && !costData.error ? costData : null,
        failures: failedPipelines,
        health: failedPipelines > 0 ? "92.0%" : "100%"
      });
      
      setLoading(false);
    });
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [router]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-50 rounded-full animate-pulse"></div>
            <Activity className="animate-spin text-indigo-400 w-12 h-12 relative z-10" />
          </div>
          <p className="text-slate-400 font-mono text-sm tracking-widest uppercase">Initializing ResolveOps AI Core...</p>
        </div>
      </DashboardLayout>
    );
  }

  const isAwsConnected = !!integrations.aws;
  const isAzureConnected = !!integrations.azure;
  const isGithubConnected = !!integrations.github;
  const totalConnected = [isAwsConnected, isAzureConnected, isGithubConnected].filter(Boolean).length;
  const totalResources = stats.aws + stats.azure;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full font-sans pb-10 space-y-8 animate-in fade-in duration-500">
        
        {/* Hero Section */}
        <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800/80 p-8 lg:p-10">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-600/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-emerald-600/10 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-full border border-indigo-500/20 mb-4">
                <Zap size={12} className="text-indigo-400" /> System Online
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-4 tracking-tight">
                ResolveOps AI Command Center
              </h1>
              <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
                Monitor Kubernetes, Azure, AWS, GitHub Actions, Docker containers, costs, risks, and incidents from one AI-powered SRE platform.
              </p>
            </div>
            <button 
              onClick={fetchData}
              className="bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-md"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Sync Telemetry
            </button>
          </div>
        </div>

        {/* Global Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Platform Health" value={stats.health} icon={<Activity />} color="emerald" />
          <StatCard title="Connected Orgs" value={totalConnected} icon={<Network />} color="indigo" />
          <StatCard title="Total Resources" value={totalResources} icon={<Server />} color="sky" />
          <StatCard title="Critical Risks" value={stats.risks} icon={<ShieldAlert />} color="amber" alert={stats.risks > 0} />
          <StatCard title="Failed Pipelines" value={stats.failures} icon={<AlertTriangle />} color="rose" alert={stats.failures > 0} />
          <CostCard costData={stats.cost} />
        </div>

        {/* Platform Cards */}
        <h2 className="text-xl font-bold text-white pt-4 tracking-wide flex items-center gap-2">
          <Database size={20} className="text-indigo-500" /> Infrastructure Integrations
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PlatformCard 
            title="Microsoft Azure"
            desc="Actively monitoring Resource Groups, VMs, and Subnets."
            icon={<Cloud size={28} />}
            color="sky"
            isConnected={isAzureConnected}
            stats={`${stats.azure} Resources`}
            href="/azure"
          />
          <PlatformCard 
            title="Amazon Web Services"
            desc="Actively monitoring Regions, VPCs, EC2, and RDS."
            icon={<Box size={28} />}
            color="amber"
            isConnected={isAwsConnected}
            stats={`${stats.aws} Resources`}
            href="/aws"
          />
          <PlatformCard 
            title="GitHub Actions"
            desc="Synchronizing CI/CD pipeline telemetry and logs."
            icon={<GitBranch size={28} />}
            color="purple"
            isConnected={isGithubConnected}
            stats={`${deployments.length} Recent Syncs`}
            href="/github"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI Recommendations */}
          <div className="lg:col-span-2 glass-panel border border-slate-800/80 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap size={18} className="text-indigo-400" /> AI Recommendations
              </h3>
              <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded text-[10px] font-bold uppercase border border-slate-700">Demo Data</span>
            </div>
            
            <div className="space-y-4 opacity-60">
              <RecommendationRow 
                type="risk"
                title="Potential CPU Exhaustion detected in Azure VMSS"
                desc="Historical data predicts VMSS-WebTier will hit 95% CPU during peak hours tomorrow. Recommend scaling up instance size."
              />
              <RecommendationRow 
                type="cost"
                title="Unattached EBS Volumes in AWS"
                desc="Found 3 unattached volumes in us-east-1. Deleting them will save ~$45/month."
              />
              <RecommendationRow 
                type="security"
                title="Permissive NSG Rule"
                desc="Azure NSG 'App-Security-Group' allows Any/Any inbound on port 22. Highly recommend restricting to known IPs."
              />
            </div>
          </div>

          {/* Recent Pipeline Activity */}
          <div className="glass-panel border border-slate-800/80 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity size={18} className="text-slate-400" /> Pipeline Activity
              </h3>
            </div>
            
            <div className="space-y-4">
              {deployments.length > 0 ? deployments.map((dep, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  {dep.conclusion === "failure" ? 
                    <AlertTriangle size={16} className="text-rose-500 mt-1 flex-shrink-0" /> : 
                    <CheckCircle size={16} className="text-emerald-500 mt-1 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-semibold text-slate-200 line-clamp-1">{dep.repository}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{dep.workflow_name} - {dep.commit_msg}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center p-6 bg-white/[0.02] rounded-xl border border-white/[0.05]">
                  <p className="text-sm text-slate-500">No recent pipeline activity.</p>
                </div>
              )}
              <Link href="/github" className="flex items-center justify-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mt-4 pt-2 border-t border-slate-800">
                View All Activity <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

// Sub-components for cleaner code
function StatCard({ title, value, icon, color, alert = false }) {
  const colorMap = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    slate: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  };
  
  return (
    <div className={`glass-panel border ${alert ? 'border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'border-slate-800/80'} rounded-2xl p-5 flex flex-col justify-between`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-lg ${colorMap[color]} border`}>
          {icon}
        </div>
        {alert && <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>}
      </div>
      <div>
        <p className="text-3xl font-black text-white mb-1 tracking-tight">{value}</p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      </div>
    </div>
  );
}

function PlatformCard({ title, desc, icon, color, isConnected, stats, href }) {
  const colorMap = {
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/20 group-hover:bg-sky-500",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20 group-hover:bg-purple-500",
  };
  
  const borderMap = {
    sky: "hover:border-sky-500/50",
    amber: "hover:border-amber-500/50",
    purple: "hover:border-purple-500/50",
  };

  return (
    <div className={`glass-panel border border-slate-800/80 rounded-2xl p-6 flex flex-col relative overflow-hidden group ${borderMap[color]} transition-all cursor-default`}>
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3 rounded-xl border ${colorMap[color].split(' group-hover')[0]}`}>
          {icon}
        </div>
        {isConnected ? (
          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-emerald-500/20 shadow-sm">Connected</span>
        ) : (
          <span className="px-2.5 py-1 bg-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-full border border-slate-700">Disconnected</span>
        )}
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 flex-1">{desc}</p>
      
      {isConnected ? (
        <div className="space-y-4">
          <div className="px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.05]">
            <p className="text-xs font-mono text-slate-300">{stats}</p>
          </div>
          <Link href={href} className={`w-full flex justify-center items-center gap-2 py-3 ${colorMap[color].split(' group-hover')[0]} rounded-xl font-semibold transition-all group-hover:text-white ${colorMap[color].split(' ')[2]}`}>
            Enter Hub <ChevronRight size={16} />
          </Link>
        </div>
      ) : (
        <Link href="/integrations" className="w-full flex justify-center items-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors border border-slate-700">
          <Key size={16} /> Configure Access
        </Link>
      )}
    </div>
  );
}

function RecommendationRow({ type, title, desc }) {
  const icon = type === 'risk' ? <Activity size={16} className="text-amber-400" /> : 
               type === 'cost' ? <DollarSign size={16} className="text-emerald-400" /> : 
               <ShieldAlert size={16} className="text-rose-400" />;
               
  const bg = type === 'risk' ? 'bg-amber-500/10 border-amber-500/20' : 
             type === 'cost' ? 'bg-emerald-500/10 border-emerald-500/20' : 
             'bg-rose-500/10 border-rose-500/20';

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors flex gap-4 items-start">
      <div className={`p-2 rounded-lg border mt-0.5 ${bg}`}>
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-bold text-slate-200 mb-1">{title}</h4>
        <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function CostCard({ costData }) {
  if (!costData || !costData.subscription_cost) {
    return (
      <div className="glass-panel border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <div className="p-2 rounded-lg text-slate-400 bg-slate-500/10 border border-slate-500/20">
            <DollarSign size={20} />
          </div>
        </div>
        <div>
          <p className="text-3xl font-black text-white mb-1 tracking-tight">$0.00</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Est. Cloud Cost</p>
        </div>
      </div>
    );
  }

  const sub = costData.subscription_cost;
  const isPermissionReq = sub.status === "permission_required";
  
  return (
    <div className="glass-panel border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.1)] rounded-2xl p-4 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2">
        <div className="p-2 rounded-lg text-sky-400 bg-sky-500/10 border border-sky-500/20">
          <DollarSign size={20} />
        </div>
        {isPermissionReq ? (
          <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
            <ShieldAlert size={10} /> Permission Required
          </span>
        ) : (
          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
            <CheckCircle size={10} /> Actual
          </span>
        )}
      </div>
      <div>
        {isPermissionReq ? (
          <p className="text-sm font-bold text-slate-400 mb-1 leading-tight">Unavailable</p>
        ) : (
          <p className="text-2xl font-black text-white mb-1 tracking-tight">
            {sub.currency_symbol}{sub.month_to_date_actual.toLocaleString(undefined, {minimumFractionDigits: 2})}
          </p>
        )}
        <div className="flex justify-between items-end mt-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Month-to-Date Cost</p>
          <p className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded uppercase border border-sky-500/20">{sub.currency}</p>
        </div>
      </div>
    </div>
  );
}

