"use client";

import React from "react";
import { ShieldAlert, AlertTriangle, AlertCircle, Info } from "lucide-react";

export default function ResourceRiskSummaryCards({ risks, customMetrics = [] }) {
  const criticalCount = risks?.filter(r => r.severity === 'critical').length || 0;
  const highCount = risks?.filter(r => r.severity === 'high').length || 0;
  const mediumCount = risks?.filter(r => r.severity === 'medium').length || 0;
  const lowCount = risks?.filter(r => r.severity === 'low' || r.severity === 'info').length || 0;
  
  // Base risk metric cards
  const cards = [
    { label: "Critical Risks", value: criticalCount, color: "rose", icon: ShieldAlert, condition: true },
    { label: "High Risks", value: highCount, color: "orange", icon: AlertTriangle, condition: true },
    { label: "Medium Risks", value: mediumCount, color: "amber", icon: AlertCircle, condition: true },
    { label: "Low / Info", value: lowCount, color: "slate", icon: Info, condition: true },
    ...customMetrics
  ].filter(c => c.condition !== false);

  // Take at most 4 to fit in the grid row cleanly
  const displayedCards = cards.slice(0, 4);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {displayedCards.map((card, idx) => {
        const Icon = card.icon;
        
        let borderClass, textClass, bgClass;
        switch (card.color) {
          case "rose": borderClass = "border-rose-500/30"; textClass = "text-rose-400"; bgClass = "bg-rose-500/10"; break;
          case "orange": borderClass = "border-orange-500/30"; textClass = "text-orange-400"; bgClass = "bg-orange-500/10"; break;
          case "amber": borderClass = "border-amber-500/30"; textClass = "text-amber-400"; bgClass = "bg-amber-500/10"; break;
          case "sky": borderClass = "border-sky-500/30"; textClass = "text-sky-400"; bgClass = "bg-sky-500/10"; break;
          case "emerald": borderClass = "border-emerald-500/30"; textClass = "text-emerald-400"; bgClass = "bg-emerald-500/10"; break;
          default: borderClass = "border-slate-700"; textClass = "text-slate-400"; bgClass = "bg-slate-800"; break;
        }

        return (
          <div key={idx} className={`glass-panel p-4 rounded-xl border ${borderClass} flex items-center justify-between`}>
            <div>
              <p className={`text-[10px] ${textClass} uppercase font-bold tracking-wider`}>{card.label}</p>
              <p className="text-2xl text-white font-bold">{card.value}</p>
            </div>
            <div className={`p-2 rounded-lg ${bgClass}`}>
              <Icon className={textClass} size={20} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
