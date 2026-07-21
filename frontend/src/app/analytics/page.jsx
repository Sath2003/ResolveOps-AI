"use client";

import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Activity, BarChart3, LineChart, PieChart } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans animate-in fade-in duration-500 pb-10">
        <div className="flex flex-col space-y-2">
          <h2 className="text-3xl font-bold tracking-wide text-white mb-2 flex items-center gap-3">
            <BarChart3 className="text-indigo-400" size={28} /> Analytics & Insights
          </h2>
          <p className="text-sm text-slate-400 max-w-xl">
            Monitor pipeline stability, cloud costs, and resource utilization across your connected platforms.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-black/40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Build Success Rate</h3>
              <PieChart size={16} className="text-indigo-400" />
            </div>
            <div className="text-3xl font-black text-white">--%</div>
            <p className="text-xs text-slate-500 mt-2">Awaiting workflow sync</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-black/40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Deployment Frequency</h3>
              <Activity size={16} className="text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-white">--/wk</div>
            <p className="text-xs text-slate-500 mt-2">Awaiting workflow sync</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-black/40">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Resource Cost</h3>
              <LineChart size={16} className="text-amber-400" />
            </div>
            <div className="text-3xl font-black text-white">$0.00</div>
            <p className="text-xs text-slate-500 mt-2">Awaiting cloud metrics</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-20 glass-panel rounded-2xl border border-slate-800 mt-8">
          <Activity size={48} className="text-slate-600 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-white mb-2">Not enough data to display insights</h3>
          <p className="text-sm text-slate-400 text-center max-w-md">
            Analytics data will appear after you connect your integrations and perform a successful resource and pipeline sync.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
