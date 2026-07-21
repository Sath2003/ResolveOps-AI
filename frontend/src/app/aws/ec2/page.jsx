"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Server, Activity } from "lucide-react";

export default function AWSEC2Explorer() {
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold tracking-wide text-white">AWS EC2 Explorer</h2>
            <p className="text-sm text-slate-500 mt-1">
              Active telemetry context for EC2 instances in your connected AWS environment.
            </p>
          </div>
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-white/5 text-xs text-orange-400 font-semibold font-mono flex items-center space-x-2">
            <Server size={14} />
            <span>AWS EC2</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl border border-slate-800/80 flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Activity className="text-orange-500/50 w-12 h-12 mx-auto animate-pulse" />
            <h3 className="text-lg font-medium text-slate-300">EC2 Telemetry Module Initializing</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              We are currently establishing the CloudWatch logs connection to fetch your EC2 metrics and logs. Please check back shortly.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

