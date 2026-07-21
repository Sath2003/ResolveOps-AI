"use client";

import React from "react";
import { ShieldAlert, Clock, Info } from "lucide-react";

export default function ResourceEmptyState({ type }) {
  let title = "No data found";
  let message = "There is no data available for this view.";
  let Icon = Info;
  let colorClass = "text-slate-500/50";

  switch (type) {
    case "logs":
      title = "No recent logs found";
      message = "Enable Diagnostic Settings and Log Analytics to collect deeper signals.";
      Icon = Clock;
      colorClass = "text-emerald-500/50";
      break;
    case "events":
      title = "No recent warning events detected";
      message = "The resource is currently operating without significant platform warnings.";
      Icon = Info;
      colorClass = "text-sky-500/50";
      break;
    case "risks":
      title = "No active risks detected";
      message = "The resource currently has no severe misconfigurations or performance risks.";
      Icon = ShieldAlert;
      colorClass = "text-emerald-500/50";
      break;
    default:
      break;
  }

  return (
    <div className="glass-panel p-10 rounded-xl text-center text-slate-400 border border-slate-800">
      <Icon size={48} className={`mx-auto mb-4 ${colorClass}`} />
      <h3 className="text-xl font-bold text-slate-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-lg mx-auto">{message}</p>
    </div>
  );
}
