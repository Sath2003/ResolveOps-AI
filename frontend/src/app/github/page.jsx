"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import { GitBranch, User, Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, Activity, RefreshCw, Bot, Terminal, Play, Server, Folder, Layers, BookOpen, ExternalLink, Calendar, Code, Filter } from "lucide-react";
import { fetchApi } from "@/lib/api";

export default function GitHubSyncHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);
  const [repos, setRepos] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [diagnoseModal, setDiagnoseModal] = useState({ isOpen: false });
  const [errorMsg, setErrorMsg] = useState(null);
  const [warningMsgs, setWarningMsgs] = useState([]);
  const [syncScope, setSyncScope] = useState("owned");
  const [dispatching, setDispatching] = useState({});
  const latestSyncId = useRef(0);

  const [activeTab, setActiveTab] = useState("executions");
  const [repoFilter, setRepoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchStatus = async () => {
    try {
      // Add a timestamp query parameter to bypass browser/Next.js aggressive caching
      const t = new Date().getTime();
      const res = await fetchApi(`/api/v1/github/status?_t=${t}`, { cache: "no-store" });
      if (res && res.status === "connected") {
        setStatusData(res);
        return true;
      }
      if (res && res.message) {
        setErrorMsg(res.message);
      } else {
        setErrorMsg("Connect your GitHub PAT in Integrations.");
      }
      return false;
    } catch (e) {
      if (e.message?.includes("PAT") || e.message?.includes("token") || e.message?.includes("configured")) {
        setErrorMsg("Connect your GitHub PAT in Integrations.");
      } else {
        setErrorMsg(e.message || "Failed to fetch GitHub status");
      }
      return false;
    }
  };

  const applySyncResponse = (res) => {
    // Directly apply sync response data to state
    setRepos(res.repositories || []);
    setWorkflows(res.workflows || []);
    
    let sortedRuns = [];
    if (res.runs && res.runs.length > 0) {
      // Sort runs by created_at descending
      sortedRuns = [...res.runs].sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || "")
      );
    }
    setRuns(sortedRuns);
    
    // Build summary from sync response
    setSummary({
      total: sortedRuns.length,
      failed: res.failed_runs_count || 0,
      success: res.successful_runs_count || 0,
      in_progress: res.in_progress_runs_count || 0,
    });
    // Handle warnings
    setWarningMsgs(res.warnings ? res.warnings.map((w) => w.message || w) : []);
  };

  const fetchGithubData = async () => {
    try {
      const [reposRes, workflowsRes, runsRes] = await Promise.all([
        fetchApi("/api/v1/github/repos").catch(() => ({ repos: [] })),
        fetchApi("/api/v1/github/workflows").catch(() => ({ workflows: [] })),
        fetchApi("/api/v1/github/runs").catch(() => ({ runs: [], summary: {} }))
      ]);

      setRepos(reposRes.repos || []);
      setWorkflows(workflowsRes.workflows || []);
      setRuns(runsRes.runs || []);
      if (runsRes.summary) {
        setSummary(runsRes.summary);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const performSync = async (scopeOverride = null) => {
    const currentScope = typeof scopeOverride === 'string' ? scopeOverride : syncScope;
    const syncId = Date.now();
    latestSyncId.current = syncId;
    
    try {
      const res = await fetchApi("/api/v1/github/sync", {
        method: "POST",
        body: JSON.stringify({ scope: currentScope })
      });

      if (latestSyncId.current !== syncId) return false;

      if (res.status === "permission_required") {
        setErrorMsg(res.message || "GitHub PAT does not have permission to read Actions workflow runs.");
        return false;
      }

      // Apply sync response data directly
      if (res.connected !== false) {
        applySyncResponse(res);

        // Handle connected_no_repositories status
        if (res.status === "connected_no_repositories" && (!res.repositories || res.repositories.length === 0)) {
          setErrorMsg(null); // Not an error, just a warning
          setWarningMsgs(res.warnings?.map((w) => w.message || w) || [
            "GitHub token is valid, but no repositories are accessible. Check fine-grained PAT repository access and Actions permissions."
          ]);
        } else if (res.repositories && res.repositories.length > 0) {
          // If repos found, explicitly ensure the 'no repos' warning is cleared
          setWarningMsgs(prev => prev.filter(msg => !msg.includes("no repositories are accessible")));
        }
        return true;
      } else {
        setErrorMsg(res.message || "Sync failed");
        return false;
      }
    } catch (e) {
      if (e.message?.includes("invalid") || e.status === 401) {
        setErrorMsg("GitHub token is invalid or expired.");
      } else if (e.message?.includes("permission") || e.status === 403) {
        setErrorMsg("GitHub token does not have permission to read repositories or Actions workflows.");
      } else {
        setErrorMsg(e.message || "Sync failed");
      }
      return false;
    }
  };

  const init = async () => {
    setLoading(true);
    setErrorMsg(null);
    setWarningMsgs([]);
    const isConnected = await fetchStatus();
    if (isConnected) {
      // Try fetching cached data first
      await fetchGithubData();

      // If no data in cache, auto-trigger a sync
      if (repos.length === 0 && runs.length === 0) {
        setSyncing(true);
        await performSync();
        setSyncing(false);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    init();
  }, [router]);

  const handleForceSync = async (scopeOverride = null) => {
    setSyncing(true);
    setErrorMsg(null);
    setWarningMsgs([]);
    await performSync(scopeOverride);
    setSyncing(false);
  };

  const handleDiagnose = async (repository, workflow_run_id) => {
    setDiagnoseModal({ isOpen: true, loading: true });
    try {
      const data = await fetchApi(`/api/v1/github/runs/${workflow_run_id}/rca`, {
        method: "POST",
        body: JSON.stringify({ repository }),
      });
      setDiagnoseModal({ isOpen: true, loading: false, data });
    } catch (error) {
      const errMsg = typeof error.message === 'string' ? error.message : JSON.stringify(error);
      setDiagnoseModal({ isOpen: true, loading: false, data: { diagnosis: errMsg || "Error communicating with diagnosis engine.", raw_logs: "Logs not available" } });
    }
  };

  const handleDispatch = async (run) => {
    const parts = (run.repository || "").split('/');
    if (parts.length !== 2) return;
    const [owner, repo] = parts;
    const key = run.id;

    setDispatching(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetchApi(`/api/v1/github/workflows/${owner}/${repo}/${run.workflow_id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ ref: run.branch || "main" })
      });
      if (res.status === "success" || res.message?.includes("dispatched")) {
        // Trigger a sync after a brief wait to fetch the new run
        setTimeout(() => handleForceSync(), 2000);
      } else {
        setErrorMsg(res.message || "Failed to dispatch workflow.");
      }
    } catch (e) {
      setErrorMsg(e.message || "Error dispatching workflow.");
    } finally {
      setDispatching(prev => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500 blur-xl opacity-50 rounded-full animate-pulse"></div>
            <Activity className="animate-spin text-purple-400 w-12 h-12 relative z-10" />
          </div>
          <p className="text-slate-400 font-mono text-sm tracking-widest uppercase">
            {syncing ? "Syncing GitHub Repositories..." : "Initializing GitHub Intelligence..."}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const getEmptyStateMessage = () => {
    if (errorMsg) return errorMsg;
    if (!statusData) return "Connect your GitHub PAT in Integrations.";
    if (warningMsgs.length > 0) return warningMsgs[0];
    if (repos.length > 0 && workflows.length === 0) return "Repositories found, but no GitHub Actions workflows were detected.";
    if (workflows.length > 0 && runs.length === 0) return "Workflows found, but no recent workflow runs were found.";
    return "No repositories found for this GitHub account.";
  };

  const filteredRepos = repos.filter(r => repoFilter === "all" || r.full_name === repoFilter);
  const filteredWorkflows = workflows.filter(w => repoFilter === "all" || w.repository === repoFilter);
  const filteredRuns = runs.filter(r => {
    if (repoFilter !== "all" && r.repository !== repoFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "success" && r.conclusion !== "success") return false;
      if (statusFilter === "failure" && r.conclusion !== "failure") return false;
      if (statusFilter === "in_progress" && !["in_progress", "queued", "pending"].includes(r.status)) return false;
    }
    return true;
  });

  const getActiveArray = () => {
    if (activeTab === "repositories") return filteredRepos;
    if (activeTab === "workflows") return filteredWorkflows;
    return filteredRuns;
  };
  const activeArray = getActiveArray();

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans animate-in fade-in duration-500 pb-10">
        
        {/* Header & Connection Status */}
        <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800/80 p-8 lg:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-purple-600/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-wider rounded-full border border-purple-500/20 mb-4">
              <GitBranch size={12} className="text-purple-400" /> GitHub Sync Hub
            </div>
            <h2 className="text-3xl font-bold tracking-wide text-white mb-2 flex items-center gap-3">
              Repository Intelligence
              {statusData ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded border border-emerald-500/30 flex items-center gap-1"><CheckCircle size={12}/> Connected</span>
              ) : (
                <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-1 rounded border border-rose-500/30 flex items-center gap-1"><XCircle size={12}/> Not Connected</span>
              )}
            </h2>
            {statusData && (
              <p className="text-sm text-slate-400 max-w-xl flex items-center gap-2">
                <User size={14}/> {statusData.username || statusData.name || "GitHub User"}
              </p>
            )}
            {errorMsg && (
              <p className="text-sm text-rose-400 mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded max-w-xl">
                {errorMsg}
              </p>
            )}
            {warningMsgs.length > 0 && !errorMsg && (
              <div className="mt-2 space-y-1 max-w-xl">
                {warningMsgs.map((msg, i) => (
                  <p key={i} className="text-sm text-amber-400 p-2 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" /> {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 relative z-10">
            <select
              value={syncScope}
              onChange={(e) => {
                const newScope = e.target.value;
                setSyncScope(newScope);
                setRepos([]);
                setWorkflows([]);
                setRuns([]);
                setWarningMsgs([]);
                setSummary({});
                setRepoFilter("all");
                setStatusFilter("all");
                handleForceSync(newScope);
              }}
              disabled={syncing}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
            >
              <option value="owned">Owned Repositories</option>
              <option value="accessible">All Accessible Repositories</option>
            </select>
            <button
              onClick={handleForceSync}
              disabled={syncing}
              className="bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-md disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing..." : "Force Sync"}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center" title="Owned GitHub repositories synced">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><Folder size={12}/> {syncScope === "owned" ? "Owned Repositories" : "Accessible Repositories"}</p>
            <p className="text-2xl font-bold text-slate-100">{repos.length}</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center" title="GitHub Actions workflow files discovered">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><Layers size={12}/> Workflows</p>
            <p className="text-2xl font-bold text-slate-100">{workflows.length}</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center" title="Total workflow execution records retrieved">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><GitBranch size={12}/> Recent Runs</p>
            <p className="text-2xl font-bold text-slate-100">{runs.length}</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center bg-rose-500/5">
            <p className="text-[10px] text-rose-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><XCircle size={12}/> Failed</p>
            <p className="text-2xl font-bold text-rose-100">{summary?.failed || 0}</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center bg-emerald-500/5">
            <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><CheckCircle size={12}/> Success</p>
            <p className="text-2xl font-bold text-emerald-100">{summary?.success || 0}</p>
          </div>
          <div className="glass-panel p-5 rounded-xl border border-slate-700/50 flex flex-col justify-center bg-amber-500/5">
            <p className="text-[10px] text-amber-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><Activity size={12}/> In Progress</p>
            <p className="text-2xl font-bold text-amber-100">{summary?.in_progress || 0}</p>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 glass-panel p-3 rounded-2xl border border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => { setActiveTab("repositories"); setCurrentPage(1); }}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "repositories" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}
            >
              Repositories
            </button>
            <button
              onClick={() => { setActiveTab("workflows"); setCurrentPage(1); }}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "workflows" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}
            >
              Workflows
            </button>
            <button
              onClick={() => { setActiveTab("executions"); setCurrentPage(1); }}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "executions" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}
            >
              Pipeline Executions
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-black/50 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-purple-500 transition-colors w-full md:w-auto">
              <Filter size={14} className="text-slate-400" />
              <select
                value={repoFilter}
                onChange={(e) => { setRepoFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-slate-300 text-sm focus:outline-none w-full md:w-48 appearance-none"
              >
                <option value="all">All Repositories</option>
                {repos.map((r, i) => (
                  <option key={i} value={r.full_name}>{r.name}</option>
                ))}
              </select>
            </div>
            
            {activeTab === "executions" && (
              <div className="flex items-center gap-2 bg-black/50 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-purple-500 transition-colors w-full md:w-auto">
                <Activity size={14} className="text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-slate-300 text-sm focus:outline-none w-full md:w-36 appearance-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failure">Failed</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Tab Views */}
        <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden flex-1 shadow-lg shadow-black/20">
          {activeTab === "repositories" && (
            <div className="flex flex-col bg-background/20 h-full">
              <div className="p-5 border-b border-slate-800 bg-black/30 flex justify-between items-center">
                <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                  <Folder size={16} className="text-purple-400" /> Repository Inventory
                </h3>
              </div>
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800/80 bg-black/40 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <div className="col-span-3 pl-2">Repository Name</div>
                <div className="col-span-2">Visibility</div>
                <div className="col-span-2">Default Branch</div>
                <div className="col-span-2">Language</div>
                <div className="col-span-2">Last Updated</div>
                <div className="col-span-1 text-right pr-2">Actions</div>
              </div>
              <div className="divide-y divide-slate-800/50">
                {filteredRepos.length === 0 ? (
                  <div className="p-20 text-center text-slate-500 flex flex-col items-center justify-center">
                    <Folder className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-bold text-lg">No repositories match filter.</p>
                  </div>
                ) : filteredRepos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((repo, i) => (
                  <div key={repo.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/[0.04] transition-colors group">
                    <div className="col-span-3 font-bold text-sm text-slate-200 flex items-center gap-2 pl-2 truncate" title={repo.full_name}>
                      <Folder size={14} className="text-purple-500 shrink-0" /> <span className="truncate">{repo.name}</span>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${repo.private ? "bg-slate-500/10 text-slate-400 border-slate-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                        {repo.private ? "Private" : "Public"}
                      </span>
                    </div>
                    <div className="col-span-2 font-mono text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <GitBranch size={12} className="shrink-0" /> {repo.default_branch || "main"}
                    </div>
                    <div className="col-span-2 text-xs text-slate-300 flex items-center gap-1.5 truncate">
                      <Code size={12} className="text-slate-500 shrink-0" /> {repo.language || "Unknown"}
                    </div>
                    <div className="col-span-2 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                      <Calendar size={12} className="shrink-0" /> {repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : "-"}
                    </div>
                    <div className="col-span-1 flex justify-end pr-2">
                      <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 text-white p-1.5 rounded text-[10px] font-bold border border-white/10 transition-all flex items-center justify-center" title="Open in GitHub">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "workflows" && (
            <div className="flex flex-col bg-background/20 h-full">
              <div className="p-5 border-b border-slate-800 bg-black/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                  <Layers size={16} className="text-purple-400" /> Workflow Inventory
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Note: Not all repositories have workflows.</p>
              </div>
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800/80 bg-black/40 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <div className="col-span-4 pl-2">Repository / Workflow Name</div>
                <div className="col-span-3">File Path</div>
                <div className="col-span-2">State</div>
                <div className="col-span-3 text-right pr-2">Actions</div>
              </div>
              <div className="divide-y divide-slate-800/50">
                {filteredWorkflows.length === 0 ? (
                  <div className="p-20 text-center text-slate-500 flex flex-col items-center justify-center">
                    <Layers className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-bold text-lg">No workflows found.</p>
                  </div>
                ) : filteredWorkflows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((wf, i) => {
                  const repoParts = (wf.repository || "").split('/');
                  const repoName = repoParts[1] || wf.repository;
                  return (
                    <div key={wf.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/[0.04] transition-colors group">
                      <div className="col-span-4 flex flex-col justify-center truncate pl-2">
                        <span className="font-bold text-xs text-slate-400 flex items-center gap-1.5 mb-1 truncate"><Folder size={12} className="text-purple-500/70 shrink-0" /> {repoName}</span>
                        <span className="font-bold text-sm text-slate-200 truncate">{wf.name || "Unknown"}</span>
                      </div>
                      <div className="col-span-3 font-mono text-[10px] text-slate-400 truncate">
                        {wf.path || "-"}
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${wf.state === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                          {wf.state || "unknown"}
                        </span>
                      </div>
                      <div className="col-span-3 flex justify-end gap-1.5 pr-2">
                        <a href={wf.html_url} target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 text-white px-2 py-1 rounded text-[10px] font-bold border border-white/10 transition-all flex items-center gap-1" title="Open in GitHub">
                          <ExternalLink size={12} /> View
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "executions" && (
            <div className="flex flex-col bg-background/20 h-full">
              <div className="p-5 border-b border-slate-800 bg-black/30 flex justify-between items-center">
                <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                  <Activity size={16} className="text-purple-400" /> Pipeline Executions / Workflow Runs
                </h3>
              </div>

              {filteredRuns.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center justify-center text-slate-500 bg-background/20 rounded-b-xl">
                  <GitBranch className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
                  <p className="font-bold text-slate-300 text-lg">No workflow runs match filter.</p>
                </div>
              ) : (
                <div className="flex flex-col bg-background/20 rounded-b-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800/80 bg-black/40 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <div className="col-span-3 pl-2">Repository / Workflow</div>
                    <div className="col-span-2">Branch / Event</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-2 text-right">Updated</div>
                    <div className="col-span-2 text-right pr-2">Actions</div>
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {filteredRuns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((run, i) => {
                      const repoParts = (run.repository || "").split('/');
                      const repoName = repoParts[1] || run.repository;
                      return (
                        <div key={run.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/[0.04] transition-colors group cursor-default">
                          <div className="col-span-3 flex flex-col justify-center truncate pl-2">
                            <span className="font-bold text-sm text-slate-200 flex items-center gap-2 truncate">
                              <Folder size={14} className="text-purple-500 shrink-0" />
                              {repoName}
                            </span>
                            <span className="text-[10px] text-purple-400/80 mt-1 ml-6 truncate" title={run.workflow_name}>
                              {run.workflow_name || "Unknown"} #{run.run_number}
                            </span>
                          </div>
                          <div className="col-span-2 flex flex-col justify-center">
                            <span className="font-mono text-[11px] font-bold bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 w-max group-hover:border-purple-500/30 transition-colors truncate max-w-full">
                              {run.branch || "unknown"}
                            </span>
                            <div className="flex items-center space-x-1.5 mt-2 text-[10px] text-slate-500 font-medium">
                              <GitBranch size={12} className="text-slate-600 shrink-0" />
                              <span className="truncate uppercase">{run.event}</span>
                            </div>
                          </div>
                          <div className="col-span-3 flex flex-wrap items-center gap-2">
                            {run.status === "in_progress" || run.status === "queued" || run.status === "pending" ? (
                              <span className="bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full text-[10px] font-bold border border-amber-500/20 flex items-center gap-1.5 shadow-sm">
                                <Activity size={12} className="animate-spin" /> {run.status === "queued" ? "Queued" : "Running"}
                              </span>
                            ) : run.conclusion === "failure" ? (
                              <span className="bg-rose-500/10 text-rose-400 px-2.5 py-1 rounded-full text-[10px] font-bold border border-rose-500/20 flex items-center gap-1.5 shadow-sm">
                                <XCircle size={12} /> Failed
                              </span>
                            ) : run.conclusion === "success" ? (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1.5 shadow-sm">
                                <CheckCircle size={12} /> Success
                              </span>
                            ) : (
                               <span className="bg-slate-500/10 text-slate-400 px-2.5 py-1 rounded-full text-[10px] font-bold border border-slate-500/20 flex items-center gap-1.5 shadow-sm">
                                <AlertCircle size={12} /> {run.conclusion || run.status}
                              </span>
                            )}
                          </div>
                          <div className="col-span-2 text-right text-[11px] text-slate-500 font-mono">
                            {run.updated_at ? new Date(run.updated_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "just now"}
                          </div>
                          <div className="col-span-2 flex justify-end gap-1.5 pr-2">
                            <a href={run.html_url} target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 text-white px-2 py-1 rounded text-[10px] font-bold border border-white/10 transition-all flex items-center gap-1" title="Open in GitHub">
                              <GitBranch size={12} /> GitHub
                            </a>
                            {run.conclusion === "failure" && (
                              <button onClick={() => handleDiagnose(run.repository, run.id)} className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-[10px] font-bold border border-purple-500/30 transition-all flex items-center gap-1 hover:shadow-md">
                                <Bot size={12} /> RCA
                              </button>
                            )}
                            <button onClick={() => handleDispatch(run)} disabled={dispatching[run.id]} className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded text-[10px] font-bold border border-indigo-500/30 transition-all flex items-center gap-1 hover:shadow-md disabled:opacity-50" title="Run Pipeline Again">
                              {dispatching[run.id] ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />} Run
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pagination Controls */}
          {activeArray.length > itemsPerPage && (
            <div className="p-4 border-t border-slate-800/50 bg-black/20 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, activeArray.length)} of {activeArray.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => (p * itemsPerPage < activeArray.length ? p + 1 : p))}
                  disabled={currentPage * itemsPerPage >= activeArray.length}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* AI Diagnosis Modal */}
      {diagnoseModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
          <div className="glass-panel border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-700 bg-black/40 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Bot className="text-purple-400" size={20} />
                </div>
                <h3 className="font-bold text-white tracking-wide text-lg">ResolveOps AI RCA Report</h3>
              </div>
              <button
                onClick={() => setDiagnoseModal({ isOpen: false })}
                className="text-slate-500 hover:text-white transition-colors bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 p-2 rounded-lg"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-background/50 space-y-6">
              {diagnoseModal.loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Activity size={40} className="text-purple-500 animate-spin mb-2" />
                  <p className="text-slate-300 font-bold text-lg">Analyzing Pipeline Telemetry...</p>
                  <p className="text-slate-500 text-sm">Extracting root cause from raw GitHub Action logs</p>
                </div>
              ) : (
                <>
                  <div className="bg-purple-900/10 p-6 rounded-xl border border-purple-500/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                    
                    {typeof diagnoseModal.data?.diagnosis === 'object' ? (
                      <div className="space-y-6">
                        {/* Section 1: AI Provider Status */}
                        {diagnoseModal.data.diagnosis.provider === 'rule_based' && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-3 text-sm text-amber-400">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <p>Primary AI provider unavailable. Showing rule-based fallback RCA.</p>
                          </div>
                        )}
                        
                        {/* Section 2: Summary */}
                        <div>
                          <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Bot size={16} /> RCA Summary
                          </h4>
                          <p className="text-slate-200 text-lg font-medium">
                            {diagnoseModal.data.diagnosis.summary}
                          </p>
                        </div>
                        
                        {/* Section 3: Probable Root Cause */}
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Probable Root Cause
                          </h4>
                          <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                            {diagnoseModal.data.diagnosis.probable_root_cause}
                          </div>
                        </div>

                        {/* Section 4: Evidence from Logs */}
                        {diagnoseModal.data.diagnosis.evidence && diagnoseModal.data.diagnosis.evidence.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <Terminal size={12} /> Evidence from Logs
                            </h4>
                            <ul className="list-disc pl-5 text-rose-400 text-xs font-mono space-y-1">
                              {diagnoseModal.data.diagnosis.evidence.map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Section 5: Recommended Fix Steps */}
                        {diagnoseModal.data.diagnosis.recommended_fix && diagnoseModal.data.diagnosis.recommended_fix.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <CheckCircle size={12} /> Recommended Fix Steps
                            </h4>
                            <ol className="list-decimal pl-5 text-emerald-400 text-sm space-y-2">
                              {diagnoseModal.data.diagnosis.recommended_fix.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                        
                        {/* Section 7: Download Report */}
                        <div className="pt-4 border-t border-purple-500/20">
                          <button onClick={() => {
                              const blob = new Blob([JSON.stringify(diagnoseModal.data.diagnosis, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'rca_report.json';
                              a.click();
                            }}
                            className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2">
                            <ExternalLink size={14} /> Download JSON Report
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Bot size={16} /> AI Generated Solution
                        </h4>
                        <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed prose prose-invert max-w-none">
                          <MarkdownRenderer content={diagnoseModal.data?.diagnosis || ""} />
                        </div>
                      </>
                    )}
                  </div>

                  {diagnoseModal.data?.raw_logs && (
                    <div className="bg-black/60 p-5 rounded-xl border border-slate-800">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Terminal size={14} /> Log Evidence
                      </h4>
                      <pre className="text-rose-400/90 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed p-4 bg-black rounded-lg border border-slate-800">
                        {diagnoseModal.data.raw_logs}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
