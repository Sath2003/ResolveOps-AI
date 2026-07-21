"use client";

import React from "react";
import { Lock, AlertCircle, Database } from "lucide-react";

export default function ResourcePermissionState({ reason }) {
  let title = "Access Denied";
  let message = "You do not have permission to view this data.";
  let Icon = Lock;
  let colorClass = "text-rose-500/50";
  let bgClass = "bg-rose-500/5";
  let borderClass = "border-rose-500/30";

  switch (reason) {
    case "monitoring_reader_missing":
      title = "Logs Unavailable";
      message = "Monitoring Reader or Log Analytics Reader permissions are required to view these logs.";
      Icon = AlertCircle;
      colorClass = "text-amber-500/50";
      bgClass = "bg-amber-500/5";
      borderClass = "border-amber-500/30";
      break;
    case "log_analytics_not_enabled":
      title = "Diagnostic Settings Disabled";
      message = "Diagnostic Settings are not enabled for this resource. Enable diagnostics to collect logs and platform events.";
      Icon = Database;
      colorClass = "text-slate-400/50";
      bgClass = "bg-slate-500/5";
      borderClass = "border-slate-800";
      break;
    case "kubernetes_api_denied":
      title = "Kubernetes API Access Denied";
      message = "Failed to establish an RBAC-authorized connection to the Kubernetes API server.";
      Icon = Lock;
      colorClass = "text-rose-500/50";
      bgClass = "bg-rose-500/5";
      borderClass = "border-rose-500/30";
      break;
    case "cost_management_missing":
      title = "Cost Intelligence Unavailable";
      message = "Cost Management Reader permission is missing for this subscription.";
      Icon = Lock;
      colorClass = "text-amber-500/50";
      bgClass = "bg-amber-500/5";
      borderClass = "border-amber-500/30";
      break;
    default:
      break;
  }

  return (
    <div className={`p-10 rounded-xl text-center border ${borderClass} ${bgClass} transition-colors`}>
      <Icon size={48} className={`mx-auto mb-4 ${colorClass}`} />
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-300 max-w-lg mx-auto">{message}</p>
    </div>
  );
}
