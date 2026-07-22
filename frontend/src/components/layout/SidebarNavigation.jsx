"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Cloud, GitBranch, LayoutDashboard, MessageSquareCode, Lightbulb,
  BarChart3, Settings, LogOut, Server, PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export default function SidebarNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [integrations, setIntegrations] = useState({ github: false, aws: false, azure: false });

  // Load collapse state preference
  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved === "true") setIsCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  const loadIntegrations = () => {
    const token = typeof window !== "undefined" && localStorage.getItem("jwt_token");
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
    <aside
      className={`border-r border-slate-800/50 glass-panel flex flex-col z-10 my-4 ml-4 mr-0 rounded-xl overflow-hidden shrink-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-60"
      }`}
    >
      {/* Header */}
      <div className={`p-4 flex items-center justify-between transition-all ${isCollapsed ? "justify-center" : ""}`}>
        <Link href="/" className="flex items-center space-x-3 min-w-0">
          <div className="shrink-0 flex items-center justify-center">
            <img src="/resolveops-icon.svg" alt="ResolveOps AI" className="w-7 h-7" />
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <h1 className="font-bold text-base tracking-tight leading-none text-slate-100">ResolveOps AI</h1>
              <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider">Command Center</p>
            </div>
          )}
        </Link>

        {!isCollapsed && (
          <button
            onClick={toggleCollapse}
            className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-white/5 transition-colors"
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {isCollapsed && (
        <div className="px-3 mb-2 flex justify-center">
          <button
            onClick={toggleCollapse}
            className="w-full flex justify-center items-center py-1.5 bg-black/20 hover:bg-black/40 text-slate-400 hover:text-white rounded border border-slate-800/50 transition-colors"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link key={item.name} href={item.path} title={isCollapsed ? item.name : undefined}>
              <div
                className={`w-full flex items-center ${
                  isCollapsed ? "justify-center px-0" : "space-x-3 px-3"
                } py-2.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {!isCollapsed && <span className="font-semibold text-sm whitespace-nowrap">{item.name}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 mt-auto border-t border-white/5">
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : undefined}
          aria-label="Logout"
          className={`w-full flex items-center ${
            isCollapsed ? "justify-center px-0" : "space-x-3 px-3"
          } py-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all font-semibold cursor-pointer`}
        >
          <LogOut size={18} className="shrink-0" />
          {!isCollapsed && <span className="text-sm whitespace-nowrap">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
