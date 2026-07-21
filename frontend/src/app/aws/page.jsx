"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Cloud,
  Server,
  Database,
  Lock,
  Globe,
  RefreshCw,
  ShieldAlert,
  HardDrive,
  Activity,
  Layers,
  ArrowRight
} from "lucide-react";

export default function AwsHubPage() {
  const [status, setStatus] = useState("loading"); // loading, connected, disconnected
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [resources, setResources] = useState([]);
  const [summary, setSummary] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchAwsStatus();
  }, []);

  const fetchAwsResources = async () => {
    try {
      const res = await fetchApi("/api/v1/aws/resources");
      if (res && res.resources) {
        setResources(res.resources);
        
        // Compute summary
        let ec2Count = 0, ec2Running = 0, ec2Stopped = 0, eksCount = 0, rdsCount = 0, s3Count = 0;
        res.resources.forEach(r => {
          if (r.resource_type.includes("EC2::Instance")) {
            ec2Count++;
            if (r.status?.toLowerCase() === "running") ec2Running++;
            if (r.status?.toLowerCase() === "stopped") ec2Stopped++;
          }
          if (r.resource_type.includes("EKS::Cluster")) eksCount++;
          if (r.resource_type.includes("RDS::DBInstance")) rdsCount++;
          if (r.resource_type.includes("S3::Bucket")) s3Count++;
        });
        
        setSummary({
          total: res.resources.length,
          ec2: ec2Count,
          ec2Running,
          ec2Stopped,
          eks: eksCount,
          rds: rdsCount,
          s3: s3Count,
        });
      }
    } catch (err) {
      console.error("Failed to fetch resources", err);
    }
  };

  const fetchAwsStatus = async () => {
    try {
      const res = await fetchApi("/api/v1/aws/status");
      if (res && res.connected) {
        setStatus("connected");
        setConnectionDetails({
          name: "AWS Connection",
          account_id: res.account_id,
          default_region: res.region,
          auth_method: res.auth_method
        });
        await fetchAwsResources();
      } else {
        setStatus("disconnected");
      }
    } catch (err) {
      console.error("Failed to fetch AWS status", err);
      setStatus("error");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const authData = {
        auth_method: connectionDetails?.auth_method || "environment",
        connection_name: connectionDetails?.name || "AWS Connection"
      };
      
      const syncRes = await fetchApi("/api/v1/aws/resources/sync", {
        method: "POST",
        body: JSON.stringify(authData)
      });
      
      if (syncRes) {
        if (syncRes.warnings && syncRes.warnings.length > 0) {
          setWarnings(syncRes.warnings);
        } else {
          setWarnings([]);
        }
        if (syncRes.resources || syncRes.status === "success" || syncRes.status === "partial_success") {
          await fetchAwsResources();
        }
      }
    } catch (err) {
      console.error("Failed to sync resources", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-400">Loading AWS Intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1600px] w-full mx-auto animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Cloud className="w-7 h-7 text-amber-500" />
              </div>
              AWS Intelligence Hub
            </h1>
            <p className="text-slate-400 mt-2">
              Discover, analyze, and secure your Amazon Web Services infrastructure.
            </p>
          </div>
          
          {status === "connected" && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Syncing..." : "Sync Resources"}
            </button>
          )}
        </div>

        {status === "error" ? (
          <div className="glass-panel p-12 rounded-xl border border-rose-500/50 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-200 mb-2">AWS status endpoint unavailable. Check backend routing.</h3>
            <p className="text-slate-400 mb-6">Could not verify connection state.</p>
          </div>
        ) : status === "disconnected" ? (
          <div className="glass-panel p-12 rounded-xl border border-slate-700/50 text-center">
            <Cloud className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-200 mb-2">AWS is not connected.</h3>
            <p className="text-slate-400 mb-6">Connect AWS in Integrations.</p>
            <a href="/integrations" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold rounded-lg transition-colors">
              Go to Integrations <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-400">Scan completed with warnings</h4>
                  <ul className="mt-1 space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-sm text-slate-300">• {w.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <AwsConnectionCard details={connectionDetails} />
            <AwsSummaryGrid summary={summary} />
            <AwsResourceInventory resources={resources} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}


function AwsConnectionCard({ details }) {
  if (!details) return null;
  return (
    <div className="glass-panel p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-emerald-500/20 rounded-full">
          <Cloud className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-emerald-400 font-bold text-lg">{details.name || "AWS Connection Active"}</h3>
          <p className="text-sm text-emerald-500/80">Account ID: {details.account_id || "..."} • Region: {details.default_region}</p>
        </div>
      </div>
      <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium">
        Verified
      </div>
    </div>
  );
}

function AwsSummaryGrid({ summary }) {
  const cards = [
    { label: "EC2 Instances", value: summary.ec2 || 0, subValue: `${summary.ec2Running || 0} Running, ${summary.ec2Stopped || 0} Stopped`, icon: Server, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "RDS Databases", value: summary.rds || 0, icon: Database, color: "text-indigo-400", bg: "bg-indigo-400/10" },
    { label: "EKS Clusters", value: summary.eks || 0, icon: Layers, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "S3 Buckets", value: summary.s3 || 0, icon: HardDrive, color: "text-emerald-400", bg: "bg-emerald-400/10" }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((c, i) => (
        <div key={i} className="glass-panel p-6 rounded-xl border border-slate-700/50 flex items-center gap-4">
          <div className={`p-3 rounded-lg ${c.bg}`}>
            <c.icon className={`w-6 h-6 ${c.color}`} />
          </div>
          <div>
            <p className="text-sm text-slate-400">{c.label}</p>
            <p className="text-2xl font-bold text-slate-100">{c.value}</p>
            {c.subValue && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{c.subValue}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AwsResourceInventory({ resources }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  if (!resources || resources.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-xl border border-slate-700/50 text-center">
        <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-200 mb-2">No resources discovered yet</h3>
        <p className="text-slate-400 max-w-md mx-auto">
          We haven't found any resources in your specified regions. Click "Sync Resources" to scan your AWS environment.
        </p>
      </div>
    );
  }

  const filteredResources = resources.filter(r => {
    const matchesSearch = (r.resource_name || r.id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || r.resource_type.includes(filterType);
    return matchesSearch && matchesType;
  });

  return (
    <div className="glass-panel rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-6 border-b border-slate-700/50 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50">
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Resource Inventory
        </h3>
        
        <div className="flex gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Search resources..." 
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 flex-1 md:w-64"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="EC2">EC2 Instances</option>
            <option value="EKS">EKS Clusters</option>
            <option value="RDS">RDS Databases</option>
            <option value="S3">S3 Buckets</option>
          </select>
        </div>
      </div>

      <div className="w-full overflow-x-auto md:overflow-x-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
              <th className="p-4 font-medium">Resource</th>
              <th className="p-4 font-medium hidden sm:table-cell">Type</th>
              <th className="p-4 font-medium hidden md:table-cell">Region</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium hidden lg:table-cell">Instance Type / SKU</th>
              <th className="p-4 font-medium hidden xl:table-cell">Features</th>
              <th className="p-4 font-medium">Public IP</th>
              <th className="p-4 font-medium hidden xl:table-cell">Private IP</th>
              <th className="p-4 font-medium hidden md:table-cell">Risk</th>
              <th className="p-4 font-medium hidden lg:table-cell">Cost status</th>
              <th className="p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50 text-sm">
            {filteredResources.map((res) => (
              <tr key={res.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-4">
                  <div className="font-medium text-slate-200">{res.resource_name || res.id}</div>
                  <div className="text-xs text-slate-500 mt-1 font-mono truncate max-w-[150px] sm:max-w-[200px] lg:max-w-[300px] xl:max-w-[450px]" title={res.id}>{res.id}</div>
                </td>
                <td className="p-4 text-slate-300 hidden sm:table-cell">
                  <span className="px-2.5 py-1 bg-slate-800 rounded-md text-xs border border-slate-700">
                    {res.resource_type.split("::").pop()}
                  </span>
                </td>
                <td className="p-4 text-slate-300 hidden md:table-cell">{res.region}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    res.status.toLowerCase() === 'running' || res.status.toLowerCase() === 'available' || res.status.toLowerCase() === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                  }`}>
                    {res.status}
                  </span>
                </td>
                <td className="p-4 text-slate-300 text-xs hidden lg:table-cell">
                  {res.metadata?.instance_type || res.metadata?.instance_class || "-"}
                </td>
                <td className="p-4 text-slate-300 hidden xl:table-cell">
                  <div className="flex gap-1">
                    <span title="Sub-resources" className="w-5 h-5 flex items-center justify-center rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px]">S</span>
                    {res.resource_type?.includes("EC2") && <span title="Runtime Workloads" className="w-5 h-5 flex items-center justify-center rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 text-[10px]">R</span>}
                    <span title="Metrics" className="w-5 h-5 flex items-center justify-center rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">M</span>
                    <span title="Logs/Events" className="w-5 h-5 flex items-center justify-center rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">L</span>
                  </div>
                </td>
                <td className="p-4 text-slate-300 text-xs font-mono">
                  {res.metadata?.public_ip || "-"}
                </td>
                <td className="p-4 text-slate-300 text-xs font-mono hidden xl:table-cell">
                  {res.metadata?.private_ip || "-"}
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    res.risk_level === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    res.risk_level === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                    res.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {res.risk_level}
                  </span>
                </td>
                <td className="p-4 hidden lg:table-cell">
                  <span className={`text-xs ${
                    res.cost_status === 'available' ? 'text-emerald-400' :
                    res.cost_status === 'permission_required' ? 'text-amber-400' :
                    'text-slate-400'
                  }`}>
                    {res.cost_status === 'permission_required' ? 'Permissions Required' : res.cost_status || 'Unknown'}
                  </span>
                </td>
                <td className="p-4">
                  <a href={`/aws/resource/${encodeURIComponent(res.id)}`} className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 group">
                    View <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </a>
                </td>
              </tr>
            ))}
            {filteredResources.length === 0 && (
              <tr>
                <td colSpan="10" className="p-8 text-center text-slate-400">
                  No resources match your search filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
