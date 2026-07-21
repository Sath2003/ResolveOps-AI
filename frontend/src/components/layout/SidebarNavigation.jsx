"use client";

import { usePathname, useRouter } from "next/navigation";
import { Cloud, Cpu, GitBranch, LayoutDashboard, MessageSquareCode, Lightbulb, BarChart3, Settings, LogOut, MessageSquare, Server, Layers, AppWindow, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [integrations, setIntegrations] = useState({ github: false, aws: false, azure: false });

  const loadIntegrations = () => {
    const token = typeof window !== 'undefined' && localStorage.getItem("jwt_token");
    if (!token) return;
    
    fetchApi("/api/v1/integrations")
      .then((data) => {
        if (data) setIntegrations(data);
      })
      .catch((err) => console.error("Failed to load integrations status:", err));
  };

  useEffect(() => {
    loadIntegrations();
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("jwt_token");
    router.push("/login");
  };

  const navItems = [
    { name: "Cloud Resources", path: "/", icon: LayoutDashboard },
    ...(integrations.github ? [{ name: "GitHub Sync", path: "/github", icon: GitBranch }] : []),
    ...(integrations.azure ? [{ name: "Azure Hub", path: "/azure", icon: Cloud }] : []),
    ...(integrations.aws ? [{ name: "AWS Hub", path: "/aws", icon: Server }] : []),
    { name: "AI Copilot", path: "/chat", icon: MessageSquareCode },
    { name: "Suggestions", path: "/suggestions", icon: Lightbulb },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Integrations", path: "/integrations", icon: Settings },
  ];

  return (
    <aside className={`border-r border-slate-800/50 glass-panel flex flex-col z-10 m-4 rounded-xl overflow-hidden shrink-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className={`p-6 flex items-center mb-4 transition-all duration-300 ${isCollapsed ? 'justify-center space-x-0' : 'space-x-3'}`}>
        <div className="shrink-0 flex items-center justify-center">
          <img src="/resolveops-icon.svg" alt="ResolveOps AI" className="w-8 h-8" />
        </div>
        {!isCollapsed && (
          <div className="animate-in fade-in duration-300 whitespace-nowrap overflow-hidden">
            <h1 className="font-bold text-lg tracking-tight leading-none text-slate-100">ResolveOps AI</h1>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Command Center</p>
          </div>
        )}
      </div>

      <div className="px-4 mb-2 flex justify-center">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex justify-center items-center py-2 bg-black/20 hover:bg-black/40 text-slate-500 hover:text-slate-300 rounded border border-slate-800/50 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link key={item.name} href={item.path} title={isCollapsed ? item.name : undefined}>
              <div className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'space-x-3 px-4'} py-2.5 rounded-xl transition-all ${
                isActive 
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent"
              }`}>
                <Icon size={18} className="shrink-0" />
                {!isCollapsed && <span className="font-semibold text-sm whitespace-nowrap">{item.name}</span>}
              </div>
            </Link>
          );
        })}


      </nav>

      <div className="p-4 mt-auto">
        <button 
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : undefined}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'space-x-3 px-4'} py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all font-semibold`}
        >
          <LogOut size={18} className="shrink-0" />
          {!isCollapsed && <span className="text-sm whitespace-nowrap">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
