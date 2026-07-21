"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Lightbulb, Wrench, Rocket, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SuggestionsHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Activity className="animate-spin text-primary w-8 h-8"/></div>;
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6">
        <div>
          <h2 className="text-xl font-medium tracking-wide text-white mb-2 flex items-center">
            <Lightbulb className="mr-3 text-amber-400" /> Multi-Stage DevOps Suggestion Hub
          </h2>
          <p className="text-sm text-slate-400">Diagnose problems and view pre-mapped resolutions for typical errors encountered across the software lifecycle.</p>
        </div>

        <div className="flex-1 glass-panel rounded-xl p-6 border-t border-t-white/10">
          <Tabs defaultValue="dev" className="w-full flex-col">
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-black/40 p-1 border border-white/10 rounded-xl">
              <TabsTrigger value="dev" className="data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-300 transition-all rounded-lg"><Wrench size={16} className="mr-2" /> Development</TabsTrigger>
              <TabsTrigger value="deploy" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 transition-all rounded-lg"><Rocket size={16} className="mr-2" /> Deployment</TabsTrigger>
              <TabsTrigger value="runtime" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 transition-all rounded-lg"><Activity size={16} className="mr-2" /> Runtime</TabsTrigger>
            </TabsList>
            
            <TabsContent value="dev" className="space-y-4">
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg p-5">
                <h4 className="text-white font-medium mb-2">Lint Violation (flake8 style checks)</h4>
                <p className="text-sm text-slate-400">Ensure all imports are resolved and no undefined names exist. Run <code className="text-rose-400 bg-rose-400/10 px-1 rounded">flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics</code> locally.</p>
              </div>
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg p-5">
                <h4 className="text-white font-medium mb-2">Unit Test Failure (pytest execution)</h4>
                <p className="text-sm text-slate-400">Review assertion mismatch. Often caused by unmocked DB calls. Use <code className="text-rose-400 bg-rose-400/10 px-1 rounded">pytest -v --lf</code> to run failed tests in isolation.</p>
              </div>
            </TabsContent>
            
            <TabsContent value="deploy" className="space-y-4">
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg p-5">
                <h4 className="text-white font-medium mb-2">Kubernetes YAML Schema Mismatch</h4>
                <p className="text-sm text-slate-400">Invalid apiVersion. If using Kubernetes 1.22+, <code className="text-rose-400 bg-rose-400/10 px-1 rounded">extensions/v1beta1</code> is deprecated. Change Ingress apiVersion to <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">networking.k8s.io/v1</code>.</p>
              </div>
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg p-5">
                <h4 className="text-white font-medium mb-2">Trivy CVE Alert</h4>
                <p className="text-sm text-slate-400">High severity vulnerabilities found in base image. Update your Dockerfile FROM statement to use an Alpine or distroless tag (e.g., <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">node:20-alpine</code>).</p>
              </div>
            </TabsContent>
            
            <TabsContent value="runtime" className="space-y-4">
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg p-5">
                <h4 className="text-white font-medium mb-2">OOMKilled Error (Exit Code 137)</h4>
                <p className="text-sm text-slate-400">Container memory limit exceeded. Increase the memory limit in the deployment manifest or profile the application for memory leaks.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}

