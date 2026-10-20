import { useState, useEffect } from 'react';
import {
  FolderTree,
  Clock,
  Inbox,
  Scale,
  Bot,
  CheckCircle2,
  ListTodo,
  Settings as SettingsIcon,
  Activity,
  Cpu,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  FolderPlus,
  Trash2,
  Check,
  FileCheck,
  Play,
  RotateCcw,
  X,
  ChevronRight,
  Pause,
  StopCircle,
  Mail,
  FileText,
  Calendar,
  ListChecks,
  MessageSquare,
  Copy,
  Search,
  FileSpreadsheet,
  Download,
  Send,
  Wrench
} from 'lucide-react';
import {
  fetchHealth,
  fetchReadiness,
  fetchSettings,
  fetchModels,
  selectModel,
  addApprovedRoot,
  removeApprovedRoot,
  fetchAuditLogs,
  scanFolder,
  fetchPendingApprovals,
  approvePlan,
  rejectPlan,
  undoPlan,
  fetchWatches,
  addWatch,
  pauseWatch,
  resumeWatch,
  removeWatch,
  fetchTasks,
  cancelTask,
  importInboxFile,
  fetchInboxItems,
  analyzeInboxItem,
  runShipmentAudit,
  fetchShipmentAudits,
  fetchShipmentAudit,
  exportAuditReport,
  fetchCopilotTools,
  createCopilotSession,
  fetchCopilotSessions,
  fetchCopilotMessages,
  sendCopilotPrompt,
  type HealthResponse,
  type ReadinessResponse,
  type SystemSettings,
  type ModelsResponse,
  type AuditLogEntry,
  type ActionPlan,
  type ScanResult,
  type FolderWatch,
  type TaskRecord,
  type InboxItem,
  type ShipmentAudit,
  type CopilotTool,
  type CopilotSession,
  type CopilotMessage
} from './services/api';

type Tab =
  | 'overview'
  | 'organizer'
  | 'lazydesk'
  | 'inbox'
  | 'tradesloth'
  | 'copilot'
  | 'approvals'
  | 'tasks'
  | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [totalAuditLogs, setTotalAuditLogs] = useState<number>(0);
  const [pendingPlans, setPendingPlans] = useState<ActionPlan[]>([]);
  const [completedPlans, setCompletedPlans] = useState<ActionPlan[]>([]);
  const [watches, setWatches] = useState<FolderWatch[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Notice banner
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Settings form states
  const [newRootPath, setNewRootPath] = useState<string>('');
  const [newRootLabel, setNewRootLabel] = useState<string>('');

  // Organizer scan states
  const [scanFolderInput, setScanFolderInput] = useState<string>('');
  const [useAiClassification, setUseAiClassification] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [latestScanResult, setLatestScanResult] = useState<ScanResult | null>(null);

  // LazyDesk form states
  const [watchFolderInput, setWatchFolderInput] = useState<string>('');

  // Inbox & Notes states
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [selectedInboxItem, setSelectedInboxItem] = useState<InboxItem | null>(null);
  const [inboxSearchQuery, setInboxSearchQuery] = useState<string>('');
  const [inboxImportPath, setInboxImportPath] = useState<string>('');
  const [inboxImportTitle, setInboxImportTitle] = useState<string>('');
  const [isImportingInbox, setIsImportingInbox] = useState<boolean>(false);
  const [isAnalyzingInbox, setIsAnalyzingInbox] = useState<boolean>(false);
  const [copiedDraft, setCopiedDraft] = useState<boolean>(false);

  // TradeSloth states
  const [shipmentAudits, setShipmentAudits] = useState<ShipmentAudit[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<ShipmentAudit | null>(null);
  const [auditPathsInput, setAuditPathsInput] = useState<string>('');
  const [auditTitleInput, setAuditTitleInput] = useState<string>('');
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [reportModalContent, setReportModalContent] = useState<string | null>(null);

  // Copilot states
  const [copilotSessions, setCopilotSessions] = useState<CopilotSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotPrompt, setCopilotPrompt] = useState<string>('');
  const [isCopilotLoading, setIsCopilotLoading] = useState<boolean>(false);
  const [copilotTools, setCopilotTools] = useState<CopilotTool[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, r, s, m, a, p, w, t, inb, aud] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchReadiness().catch(() => null),
        fetchSettings().catch(() => null),
        fetchModels().catch(() => null),
        fetchAuditLogs(undefined, 10, 0).catch(() => ({ total: 0, items: [] })),
        fetchPendingApprovals().catch(() => []),
        fetchWatches().catch(() => []),
        fetchTasks(undefined, 20).catch(() => []),
        fetchInboxItems(inboxSearchQuery || undefined).catch(() => []),
        fetchShipmentAudits().catch(() => [])
      ]);

      if (h) setHealth(h);
      if (r) setReadiness(r);
      if (s) {
        setSystemSettings(s);
        if (!scanFolderInput && s.approved_roots.length > 0) {
          setScanFolderInput(s.approved_roots[0].path);
          setWatchFolderInput(s.approved_roots[0].path);
        }
      }
      if (m) setModelsData(m);
      if (a) {
        setAuditLogs(a.items);
        setTotalAuditLogs(a.total);
      }
      if (p) setPendingPlans(p);
      if (w) setWatches(w);
      if (t) setTasks(t);
      if (inb) {
        setInboxItems(inb);
        setSelectedInboxItem((prev) => {
          if (!prev && inb.length > 0) return inb[0];
          if (prev) {
            const found = inb.find((x) => x.id === prev.id);
            return found || (inb.length > 0 ? inb[0] : null);
          }
          return null;
        });
      }
      if (aud) {
        setShipmentAudits(aud);
        if (!selectedAudit && aud.length > 0) {
          fetchShipmentAudit(aud[0].id).then((full) => setSelectedAudit(full)).catch(() => {});
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with backend service.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paths = auditPathsInput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paths.length === 0) return;
    try {
      setIsAuditing(true);
      setActionNotice('Running TradeSloth cross-audit with exact decimal arithmetic...');
      const res = await runShipmentAudit(paths, auditTitleInput.trim() || undefined);
      setActionNotice(`Audit '${res.title}' completed with status: ${res.status.toUpperCase()}`);
      setSelectedAudit(res);
      setAuditPathsInput('');
      setAuditTitleInput('');
      await loadData();
    } catch (err: any) {
      setActionNotice(`Shipment audit failed: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSelectAudit = async (auditId: string) => {
    try {
      const full = await fetchShipmentAudit(auditId);
      setSelectedAudit(full);
    } catch (err: any) {
      setActionNotice(`Failed to load audit: ${err.message}`);
    }
  };

  const handleExportReport = async (auditId: string) => {
    try {
      setActionNotice('Generating compliance report...');
      const md = await exportAuditReport(auditId);
      setReportModalContent(md);
      setActionNotice('Audit report generated.');
    } catch (err: any) {
      setActionNotice(`Export error: ${err.message}`);
    }
  };

  const handleImportInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxImportPath.trim()) return;
    try {
      setIsImportingInbox(true);
      setActionNotice('Importing and hashing local document...');
      const item = await importInboxFile(inboxImportPath.trim(), inboxImportTitle.trim() || undefined);
      setActionNotice(`Imported '${item.title}' successfully.`);
      setInboxImportPath('');
      setInboxImportTitle('');
      setSelectedInboxItem(item);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Import failed: ${err.message}`);
    } finally {
      setIsImportingInbox(false);
    }
  };

  const handleAnalyzeInbox = async (itemId: string) => {
    try {
      setIsAnalyzingInbox(true);
      setActionNotice('Running local AI analysis: generating summary, extracting obligations and date evidence...');
      const updated = await analyzeInboxItem(itemId, true);
      setSelectedInboxItem(updated);
      setActionNotice(`Analysis complete for '${updated.title}'.`);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Analysis error: ${err.message}`);
    } finally {
      setIsAnalyzingInbox(false);
    }
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const loadCopilotData = async (preferredSessionId?: string) => {
    try {
      const [sessions, tools] = await Promise.all([
        fetchCopilotSessions().catch(() => []),
        fetchCopilotTools().catch(() => [])
      ]);
      setCopilotSessions(sessions);
      setCopilotTools(tools);

      let targetSessionId = preferredSessionId || activeSessionId;
      if (!targetSessionId && sessions.length > 0) {
        targetSessionId = sessions[0].id;
      }
      if (targetSessionId) {
        setActiveSessionId(targetSessionId);
        const msgs = await fetchCopilotMessages(targetSessionId).catch(() => []);
        setCopilotMessages(msgs);
      }
    } catch (err: any) {
      console.error('Failed to load copilot data:', err);
    }
  };

  const handleCreateSession = async () => {
    try {
      const title = `Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const sess = await createCopilotSession(title);
      setCopilotSessions((prev) => [sess, ...prev]);
      setActiveSessionId(sess.id);
      setCopilotMessages([]);
      setActionNotice(`Created new Copilot session '${sess.title}'.`);
    } catch (err: any) {
      setActionNotice(`Failed to create chat session: ${err.message}`);
    }
  };

  const handleSelectSession = async (sessId: string) => {
    setActiveSessionId(sessId);
    try {
      const msgs = await fetchCopilotMessages(sessId);
      setCopilotMessages(msgs);
    } catch (err: any) {
      setActionNotice(`Failed to load messages: ${err.message}`);
    }
  };

  const handleSendPrompt = async (promptToSend?: string) => {
    const text = (promptToSend || copilotPrompt).trim();
    if (!text || isCopilotLoading) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const sess = await createCopilotSession('General Assistant');
        targetSessionId = sess.id;
        setCopilotSessions((prev) => [sess, ...prev]);
        setActiveSessionId(sess.id);
      } catch (err: any) {
        setActionNotice(`Failed to create session: ${err.message}`);
        return;
      }
    }

    setCopilotPrompt('');
    setIsCopilotLoading(true);
    const tempUserMsg: CopilotMessage = {
      id: `temp-${Date.now()}`,
      session_id: targetSessionId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    setCopilotMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await sendCopilotPrompt(targetSessionId, text);
      setCopilotMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        res.user_message,
        res.assistant_message
      ]);
      if (res.assistant_message.tool_calls?.some((t) => t.name === 'propose_file_organization')) {
        setActionNotice('New file organization plan proposed and placed in Approvals queue.');
        await loadData();
      }
    } catch (err: any) {
      setActionNotice(`Copilot prompt error: ${err.message}`);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'copilot') {
      loadCopilotData();
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanFolderInput.trim()) return;
    try {
      setIsScanning(true);
      setActionNotice('Scanning files and computing SHA-256 hashes...');
      const res = await scanFolder(scanFolderInput.trim(), useAiClassification);
      setLatestScanResult(res);
      setActionNotice(`Scan complete: ${res.total_files} files analyzed, ${res.duplicates_found} duplicates found.`);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Scan failed: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApprovePlan = async (planId: string) => {
    try {
      setActionNotice('Revalidating preconditions and executing file moves...');
      const updated = await approvePlan(planId);
      setActionNotice(`Plan '${updated.title}' executed successfully.`);
      setCompletedPlans((prev) => [updated, ...prev.filter((p) => p.id !== updated.id)]);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Approval execution failed: ${err.message}`);
    }
  };

  const handleRejectPlan = async (planId: string) => {
    try {
      await rejectPlan(planId);
      setActionNotice('Plan rejected. Zero filesystem changes were made.');
      await loadData();
    } catch (err: any) {
      setActionNotice(`Rejection failed: ${err.message}`);
    }
  };

  const handleUndoPlan = async (planId: string) => {
    try {
      setActionNotice('Reversing operations and restoring files to original paths...');
      const restored = await undoPlan(planId);
      setActionNotice(`Rollback complete. Files restored safely for plan '${restored.title}'.`);
      setCompletedPlans((prev) => prev.filter((p) => p.id !== planId));
      await loadData();
    } catch (err: any) {
      setActionNotice(`Undo failed: ${err.message}`);
    }
  };

  const handleAddWatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!watchFolderInput.trim()) return;
    try {
      setActionNotice('Starting folder monitor...');
      await addWatch(watchFolderInput.trim());
      setActionNotice(`Started LazyDesk monitoring on ${watchFolderInput}`);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Failed to add watch: ${err.message}`);
    }
  };

  const handleToggleWatchPause = async (watch: FolderWatch) => {
    try {
      if (watch.is_paused) {
        await resumeWatch(watch.id);
        setActionNotice(`Resumed monitoring ${watch.folder_path}`);
      } else {
        await pauseWatch(watch.id);
        setActionNotice(`Paused monitoring ${watch.folder_path}`);
      }
      await loadData();
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const handleRemoveWatch = async (watchId: string) => {
    try {
      await removeWatch(watchId);
      setActionNotice('Folder watch removed.');
      await loadData();
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await cancelTask(taskId);
      setActionNotice(`Task ${taskId.slice(0, 8)} cancelled.`);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Cancel error: ${err.message}`);
    }
  };

  const handleModelChange = async (newModel: string) => {
    try {
      setActionNotice('Updating model...');
      await selectModel(newModel);
      setActionNotice(`Active model switched to ${newModel}`);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const handleAddRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRootPath.trim()) return;
    try {
      setActionNotice('Adding approved root...');
      await addApprovedRoot(newRootPath.trim(), newRootLabel.trim());
      setNewRootPath('');
      setNewRootLabel('');
      setActionNotice('Folder root approved successfully.');
      await loadData();
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const handleRemoveRoot = async (rootId: string) => {
    try {
      setActionNotice('Deactivating root...');
      await removeApprovedRoot(rootId);
      setActionNotice('Folder root deactivated.');
      await loadData();
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const ollamaComponent = readiness?.components.find((c) => c.name === 'ollama');
  const isOllamaConnected = ollamaComponent?.status === 'connected';

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'organizer', label: 'File Organizer', icon: FolderTree },
    { id: 'lazydesk', label: 'LazyDesk Automation', icon: Clock, badge: watches.filter(w => !w.is_paused).length },
    { id: 'inbox', label: 'Inbox & Notes', icon: Inbox, badge: inboxItems.length },
    { id: 'tradesloth', label: 'TradeSloth Auditor', icon: Scale, badge: shipmentAudits.filter(a => a.status === 'discrepancies_found').length },
    { id: 'copilot', label: 'Local Copilot', icon: Bot },
    { id: 'approvals', label: 'Approvals', icon: CheckCircle2, badge: pendingPlans.length },
    { id: 'tasks', label: 'Task History', icon: ListTodo },
    { id: 'settings', label: 'Settings & Audit', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-[#0b0f17] text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#111726] border-r border-slate-800 flex flex-col justify-between select-none">
        <div>
          {/* Logo Brand */}
          <div className="p-5 flex items-center space-x-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/40">
              <span className="text-xl">🦥</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                SlothPilot <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">AI</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">One AI. Less effort.</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Diagnostics Footer */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-900/60 border border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${readiness?.status === 'ready' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400'}`} />
              Core API
            </span>
            <span className="font-mono text-[10px] text-slate-300">
              {readiness?.status === 'ready' ? '127.0.0.1:8000' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-900/60 border border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isOllamaConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
              Ollama
            </span>
            <span className="font-mono text-[10px] text-slate-300 truncate max-w-[90px]" title={systemSettings?.ollama_selected_model}>
              {systemSettings?.ollama_selected_model || (isOllamaConnected ? 'Active' : 'Offline')}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0b0f17] overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-[#111726]/40 backdrop-blur">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-semibold text-slate-200 capitalize">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-slate-400">Offline-first local automation</span>
          </div>

          <div className="flex items-center space-x-3">
            {error && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Backend offline. Check local server.</span>
              </div>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh data"
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {actionNotice && (
            <div className="max-w-5xl mx-auto mb-4 p-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-emerald-400 flex items-center justify-between shadow-lg">
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Hero Status Banner */}
              <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-[#131c2e] to-slate-900 p-6 shadow-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                      Local AI Active
                    </span>
                    <span className="text-xs text-slate-400">v{health?.version || '0.1.0'}</span>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    SlothPilot AI Automation Hub
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Run autonomous file organization, folder watches, document auditing, and notes management entirely on your Windows machine using local open-weight AI. No cloud telemetry, no subscription lock-in.
                  </p>
                </div>

                <div className="hidden md:flex gap-3">
                  <button
                    onClick={() => setActiveTab('organizer')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
                  >
                    <FolderTree className="w-4 h-4" />
                    <span>Organize Folder</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('tradesloth')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-2 border border-slate-700 transition"
                  >
                    <Scale className="w-4 h-4" />
                    <span>Audit Shipment</span>
                  </button>
                </div>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Ollama Status</span>
                    <Cpu className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold text-white truncate" title={systemSettings?.ollama_selected_model}>
                    {systemSettings?.ollama_selected_model || (isOllamaConnected ? 'Active' : 'Offline')}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {modelsData?.count ? `${modelsData.count} models detected locally` : 'Ollama local inference'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Pending Approvals</span>
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-base font-bold text-white">{pendingPlans.length} Actions</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    All file changes require user consent
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Active Folder Watches</span>
                    <Clock className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-base font-bold text-white">
                    {watches.filter((w) => !w.is_paused).length} Active ({watches.length} Total)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    LazyDesk real-time monitoring
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Audit Logs</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold text-white">{totalAuditLogs} Records</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Immutable append-only trail
                  </p>
                </div>
              </div>

              {/* Module Feature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => setActiveTab('organizer')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-emerald-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <FolderTree className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    Smart File Organizer
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Scan approved folders, detect SHA-256 duplicate files, extract document text, and prepare safe approval-gated move plans.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('lazydesk')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-blue-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <Clock className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    LazyDesk Automation
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Monitor approved folders for new downloads or dropped documents. Loop-proof queueing with cooperative pause and resume.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('inbox')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-purple-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <Inbox className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    Inbox & Notes Assistant
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Import notes and EML files locally. Extract action items, date commitments with source quotes, and draft local replies.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('tradesloth')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-amber-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <Scale className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    TradeSloth Auditor
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Cross-audit trade and shipping documents. Extract quantities, weights, and currency totals with high-precision decimal comparison.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('copilot')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-teal-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <Bot className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    Local AI Copilot
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Conversational assistant with tool execution sandboxed by strict Pydantic schemas and approval gates.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('settings')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-emerald-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <SettingsIcon className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    Settings & Security
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Manage approved folder roots, switch local Ollama models, and inspect the tamper-evident audit log.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'organizer' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                    Smart Folder Scan & Organization
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select an approved root directory to index file metadata, detect exact SHA-256 duplicates, and generate proposed move plans.
                  </p>
                </div>

                <form onSubmit={handleScan} className="space-y-3 pt-2">
                  <div className="flex gap-2">
                    <select
                      value={scanFolderInput}
                      onChange={(e) => setScanFolderInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Select an approved root --</option>
                      {systemSettings?.approved_roots.map((r) => (
                        <option key={r.id} value={r.path}>
                          {r.label} ({r.path})
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      disabled={isScanning || !scanFolderInput}
                      className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition disabled:opacity-50"
                    >
                      {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isScanning ? 'Analyzing...' : 'Scan & Plan'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      id="ai-classify"
                      checked={useAiClassification}
                      onChange={(e) => setUseAiClassification(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                    />
                    <label htmlFor="ai-classify" className="cursor-pointer select-none">
                      Enable local open-weight AI classification ({systemSettings?.ollama_selected_model || 'Ollama'})
                    </label>
                  </div>
                </form>
              </div>

              {latestScanResult && latestScanResult.plan && (
                <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-400" />
                        Proposed Action Plan: {latestScanResult.plan.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {latestScanResult.actions_planned} files ready to organize. Review before approving.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectPlan(latestScanResult.plan!.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                      >
                        <X className="w-3.5 h-3.5 text-rose-400" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleApprovePlan(latestScanResult.plan!.id)}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Execute</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {latestScanResult.plan.items.map((item) => (
                      <div key={item.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white truncate max-w-sm" title={item.source_path}>
                              {item.source_path.split('\\').pop() || item.source_path.split('/').pop()}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="font-mono text-[11px] text-emerald-400 truncate max-w-sm" title={item.target_path}>
                              {item.target_path.split('\\').slice(-2).join('/')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">Reason: {item.reason}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {item.action_type.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {completedPlans.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-purple-400" />
                    Executed Plans & Safe Undo
                  </h4>
                  <div className="space-y-2">
                    {completedPlans.map((plan) => (
                      <div key={plan.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{plan.title}</div>
                          <div className="text-[11px] text-slate-400">
                            Executed {plan.items.length} moves • {plan.executed_at?.slice(0, 19).replace('T', ' ')} UTC
                          </div>
                        </div>
                        <button
                          onClick={() => handleUndoPlan(plan.id)}
                          className="px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Undo & Restore</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'lazydesk' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Add Watch Card */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    LazyDesk Folder Monitoring
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automatically monitor approved folders for dropped files. Events are debounced, loop-protected, and converted to approval plans.
                  </p>
                </div>

                <form onSubmit={handleAddWatch} className="flex gap-2 pt-2">
                  <select
                    value={watchFolderInput}
                    onChange={(e) => setWatchFolderInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Select an approved root to watch --</option>
                    {systemSettings?.approved_roots.map((r) => (
                      <option key={r.id} value={r.path}>
                        {r.label} ({r.path})
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={!watchFolderInput}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Start Watch</span>
                  </button>
                </form>
              </div>

              {/* Active Watches List */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Configured Folder Monitors ({watches.length})
                </h4>

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
                  {watches.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No folder watches currently configured. Add one above.
                    </div>
                  ) : (
                    watches.map((w) => (
                      <div key={w.id} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{w.folder_path}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${w.is_paused ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-400'}`}>
                              {w.is_paused ? 'PAUSED' : 'ACTIVE'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Debounce: {w.debounce_seconds}s • Started: {w.created_at.slice(0, 19).replace('T', ' ')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleWatchPause(w)}
                            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition"
                            title={w.is_paused ? 'Resume watch' : 'Pause watch'}
                          >
                            {w.is_paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                          </button>
                          <button
                            onClick={() => handleRemoveWatch(w.id)}
                            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-rose-400 transition"
                            title="Remove watch"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inbox' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Header and Import Section */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-purple-400" />
                      Local Inbox & Notes Assistant
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Import Markdown notes or EML email files for offline summarization, date tracking, and obligation extraction. All replies are stored locally; external network calls are forbidden.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Offline Extraction
                  </span>
                </div>

                {/* Import Form */}
                <form onSubmit={handleImportInbox} className="flex flex-col sm:flex-row gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Full path to .txt, .md, or .eml file within approved roots"
                    value={inboxImportPath}
                    onChange={(e) => setInboxImportPath(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                  <input
                    type="text"
                    placeholder="Custom title (optional)"
                    value={inboxImportTitle}
                    onChange={(e) => setInboxImportTitle(e.target.value)}
                    className="sm:w-56 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={isImportingInbox || !inboxImportPath}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isImportingInbox ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
                    <span>{isImportingInbox ? 'Importing...' : 'Import Document'}</span>
                  </button>
                </form>
              </div>

              {/* Two-Column Explorer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Document List & Search */}
                <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#111726]/60 p-4 space-y-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search title or text..."
                      value={inboxSearchQuery}
                      onChange={(e) => setInboxSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loadData();
                      }}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between px-1">
                    <span>Imported Items ({inboxItems.length})</span>
                    <button
                      onClick={loadData}
                      className="text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {inboxItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 border border-slate-800/80 rounded-lg">
                        No notes or emails imported yet. Provide a path above to import.
                      </div>
                    ) : (
                      inboxItems.map((item) => {
                        const isSelected = selectedInboxItem?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedInboxItem(item)}
                            className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-purple-950/20 border-purple-500/50 shadow-sm'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 ${
                                  item.source_type === 'email'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                {item.source_type === 'email' ? <Mail className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                                {item.source_type.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {item.created_at.slice(5, 10)}
                              </span>
                            </div>

                            <div className="font-semibold text-white truncate" title={item.title}>
                              {item.title}
                            </div>

                            <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                              {item.summary || item.extracted_text.slice(0, 100) || 'No text extracted.'}
                            </p>

                            {item.metadata?.is_duplicate && (
                              <span className="inline-block mt-1.5 px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300">
                                Duplicate Detected
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Selected Item Details & Analysis */}
                <div className="lg:col-span-8 space-y-4">
                  {!selectedInboxItem ? (
                    <div className="rounded-xl border border-slate-800 bg-[#111726]/40 p-12 text-center text-slate-400">
                      <Inbox className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-white">No Item Selected</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Select a document from the left list or import a file above to inspect its summary, action items, dates, and local draft reply.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Document Meta Header */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                                  selectedInboxItem.source_type === 'email'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                {selectedInboxItem.source_type}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                SHA256: {selectedInboxItem.file_hash.slice(0, 12)}...
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white mt-1">
                              {selectedInboxItem.title}
                            </h3>
                            <p className="text-xs text-slate-400 truncate max-w-xl font-mono mt-0.5" title={selectedInboxItem.file_path}>
                              {selectedInboxItem.file_path}
                            </p>
                          </div>

                          <button
                            onClick={() => handleAnalyzeInbox(selectedInboxItem.id)}
                            disabled={isAnalyzingInbox}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                          >
                            {isAnalyzingInbox ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>{isAnalyzingInbox ? 'Analyzing...' : 'Run Local AI Analysis'}</span>
                          </button>
                        </div>

                        {/* Summary Block */}
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            Document Summary
                          </h4>
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-200 leading-relaxed">
                            {selectedInboxItem.summary ? (
                              selectedInboxItem.summary
                            ) : (
                              <span className="text-slate-500 italic">
                                No summary generated yet. Click 'Run Local AI Analysis' above to generate one with Ollama.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Items / Obligations */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <ListChecks className="w-4 h-4 text-amber-400" />
                            Action Items & Obligations ({selectedInboxItem.action_items?.length || 0})
                          </h4>
                          <span className="text-[11px] text-slate-500">Extracted with source quotes</span>
                        </div>

                        {(!selectedInboxItem.action_items || selectedInboxItem.action_items.length === 0) ? (
                          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-500">
                            No action items detected or analysis has not been run.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedInboxItem.action_items.map((act, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-white">{act.description}</span>
                                  <div className="flex items-center gap-1.5">
                                    {act.assignee && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                                        @{act.assignee}
                                      </span>
                                    )}
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                                        act.urgency === 'high'
                                          ? 'bg-rose-500/20 text-rose-300'
                                          : act.urgency === 'medium'
                                          ? 'bg-amber-500/20 text-amber-300'
                                          : 'bg-blue-500/20 text-blue-300'
                                      }`}
                                    >
                                      {act.urgency}
                                    </span>
                                  </div>
                                </div>
                                {act.source_quote && (
                                  <p className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded border border-slate-800/60">
                                    “{act.source_quote}”
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Dates and Commitments */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            Key Dates & Deadlines ({selectedInboxItem.key_dates?.length || 0})
                          </h4>
                          <span className="text-[11px] text-slate-500">With ambiguity detection</span>
                        </div>

                        {(!selectedInboxItem.key_dates || selectedInboxItem.key_dates.length === 0) ? (
                          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-500">
                            No dates identified or analysis has not been run.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedInboxItem.key_dates.map((dateObj, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-semibold text-emerald-400">
                                      {dateObj.normalized_date || dateObj.date_text}
                                    </span>
                                    {dateObj.is_ambiguous && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 flex items-center gap-1">
                                        <AlertTriangle className="w-2.5 h-2.5" /> Ambiguous Date
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-400">{dateObj.context}</span>
                                </div>
                                {dateObj.source_quote && (
                                  <p className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded border border-slate-800/60">
                                    “{dateObj.source_quote}”
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Local Draft Reply */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4 text-purple-400" />
                            Local Response Draft
                          </h4>
                          <span className="text-[11px] text-emerald-400">
                            Stored locally • No email will be sent
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed relative">
                          {selectedInboxItem.draft_reply ? (
                            <>
                              <div className="mb-2 flex justify-end">
                                <button
                                  onClick={() => handleCopyDraft(selectedInboxItem.draft_reply!)}
                                  className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition"
                                >
                                  {copiedDraft ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedDraft ? 'Copied' : 'Copy Draft'}</span>
                                </button>
                              </div>
                              {selectedInboxItem.draft_reply}
                            </>
                          ) : (
                            <span className="text-slate-500 italic">
                              No reply draft generated yet. Click 'Run Local AI Analysis' to generate a response draft.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Extracted Text Viewer */}
                      <details className="rounded-xl border border-slate-800 bg-[#111726]/40 p-4 text-xs">
                        <summary className="font-semibold text-slate-400 cursor-pointer hover:text-white select-none">
                          Inspect Raw Extracted Content ({selectedInboxItem.extracted_text.length} chars)
                        </summary>
                        <div className="mt-3 p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap border border-slate-900">
                          {selectedInboxItem.extracted_text}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tradesloth' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Legal Disclaimer Alert */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-start gap-3 shadow-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-200 uppercase tracking-wider text-[11px]">
                    Statutory & Customs Compliance Notice
                  </div>
                  <p className="leading-relaxed text-amber-300/90 text-[11px]">
                    TradeSloth performs deterministic multi-document text extraction and decimal cross-comparison. It does NOT constitute legal, regulatory, or export/customs compliance verification. Always have shipping documentation reviewed by a licensed customs broker or freight forwarder before filing.
                  </p>
                </div>
              </div>

              {/* Trigger Cross-Audit Card */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Scale className="w-4 h-4 text-amber-400" />
                      Shipment Document Cross-Audit
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cross-compare 2 or more shipment documents (PDF, DOCX, XLSX, TXT) across approved roots. Compares references, package counts, weights, and values with exact decimal arithmetic.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Decimal Arithmetic
                  </span>
                </div>

                <form onSubmit={handleRunAudit} className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Document Paths (one per line, within approved roots)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g.&#10;C:\Users\RAHUL\Documents\Shipments\Commercial_Invoice.pdf&#10;C:\Users\RAHUL\Documents\Shipments\Packing_List.xlsx&#10;C:\Users\RAHUL\Documents\Shipments\Bill_of_Lading.pdf"
                      value={auditPathsInput}
                      onChange={(e) => setAuditPathsInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Audit Title (e.g. Shipment MSCU-440192)"
                      value={auditTitleInput}
                      onChange={(e) => setAuditTitleInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={isAuditing || !auditPathsInput.trim()}
                      className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-amber-500/20"
                    >
                      {isAuditing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
                      <span>{isAuditing ? 'Auditing...' : 'Run Shipment Cross-Audit'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Two-Column Audit Matrix & History */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Audit History */}
                <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#111726]/60 p-4 space-y-3">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between px-1">
                    <span>Audit History ({shipmentAudits.length})</span>
                    <button
                      onClick={loadData}
                      className="text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {shipmentAudits.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 border border-slate-800/80 rounded-lg">
                        No shipment audits performed yet. Enter document paths above to begin.
                      </div>
                    ) : (
                      shipmentAudits.map((aud) => {
                        const isSelected = selectedAudit?.id === aud.id;
                        const isClean = aud.status === 'clean';
                        return (
                          <div
                            key={aud.id}
                            onClick={() => handleSelectAudit(aud.id)}
                            className={`p-3.5 rounded-lg border text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-amber-950/20 border-amber-500/50 shadow-sm'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  isClean
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {isClean ? 'CLEAN (MATCHING)' : 'DISCREPANCIES'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {aud.created_at.slice(5, 10)}
                              </span>
                            </div>

                            <div className="font-semibold text-white truncate" title={aud.title}>
                              {aud.title}
                            </div>

                            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
                              <span>{aud.summary.total_documents} documents</span>
                              <span>{aud.summary.discrepancies} variance(s)</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Selected Audit Matrix Details */}
                <div className="lg:col-span-8 space-y-4">
                  {!selectedAudit ? (
                    <div className="rounded-xl border border-slate-800 bg-[#111726]/40 p-12 text-center text-slate-400">
                      <Scale className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-white">No Audit Selected</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Select a past shipment audit from the list or submit document paths above to view the discrepancy matrix.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Audit Header Card */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                                  selectedAudit.status === 'clean'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {selectedAudit.status.replace('_', ' ')}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                ID: {selectedAudit.id.slice(0, 8)}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white mt-1">
                              {selectedAudit.title}
                            </h3>
                            <p className="text-xs text-slate-400 font-mono">
                              Generated {selectedAudit.created_at.slice(0, 19).replace('T', ' ')} UTC
                            </p>
                          </div>

                          <button
                            onClick={() => handleExportReport(selectedAudit.id)}
                            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
                          >
                            <Download className="w-3.5 h-3.5 text-amber-400" />
                            <span>Export Report (.md)</span>
                          </button>
                        </div>

                        {/* Documents Audited */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2">
                            Audited Shipment Documents ({selectedAudit.summary.documents.length})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedAudit.summary.documents.map((doc, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-white truncate max-w-[180px]" title={doc.filename}>
                                    {doc.filename}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-500/20 text-blue-300">
                                    {doc.document_type}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono truncate" title={doc.path}>
                                  {doc.path}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Summary Metrics */}
                        <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800 text-center">
                          <div className="p-2 rounded bg-slate-900/50">
                            <div className="text-base font-bold text-white">{selectedAudit.summary.total_findings}</div>
                            <div className="text-[10px] text-slate-400">Total Fields</div>
                          </div>
                          <div className="p-2 rounded bg-slate-900/50">
                            <div className="text-base font-bold text-emerald-400">{selectedAudit.summary.verified}</div>
                            <div className="text-[10px] text-slate-400">Verified</div>
                          </div>
                          <div className="p-2 rounded bg-slate-900/50">
                            <div className="text-base font-bold text-rose-400">{selectedAudit.summary.discrepancies}</div>
                            <div className="text-[10px] text-slate-400">Variances</div>
                          </div>
                          <div className="p-2 rounded bg-slate-900/50">
                            <div className="text-base font-bold text-amber-400">{selectedAudit.summary.missing}</div>
                            <div className="text-[10px] text-slate-400">Unpaired</div>
                          </div>
                        </div>
                      </div>

                      {/* Discrepancy Findings Matrix */}
                      <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                            Cross-Document Discrepancy Matrix
                          </h4>
                          <span className="text-[11px] text-slate-500">Deterministic Decimal Comparison</span>
                        </div>

                        {(!selectedAudit.findings || selectedAudit.findings.length === 0) ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No field findings recorded for this audit.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {selectedAudit.findings.map((f, idx) => {
                              const isMatch = f.status === 'verified';
                              const isInconsistent = f.status === 'inconsistent';
                              return (
                                <div
                                  key={idx}
                                  className={`p-4 rounded-xl border text-xs space-y-2.5 transition ${
                                    isMatch
                                      ? 'bg-slate-900/60 border-slate-800'
                                      : isInconsistent
                                      ? 'bg-rose-950/20 border-rose-500/40'
                                      : 'bg-amber-950/20 border-amber-500/30'
                                  }`}
                                >
                                  {/* Finding Header */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-white text-sm capitalize">
                                        {f.field_name.replace(/_/g, ' ')}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                                          isMatch
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : isInconsistent
                                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        }`}
                                      >
                                        {f.status ? f.status.toUpperCase() : f.severity.toUpperCase()}
                                      </span>
                                    </div>

                                    {f.difference && f.difference !== '0' && f.difference !== '0.00' && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40">
                                        Variance: {f.difference}
                                      </span>
                                    )}
                                  </div>

                                  {/* Values Across Audited Documents */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                                    {Object.entries(f.extracted_values).map(([docName, val]) => (
                                      <div key={docName} className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-mono truncate max-w-[160px]" title={docName}>
                                          {docName}:
                                        </span>
                                        <span className="font-semibold text-white font-mono">{val}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Evidence Reference */}
                                  {f.evidence_reference && (
                                    <p className="text-[11px] text-slate-400 italic bg-slate-900/50 p-2 rounded border border-slate-800">
                                      {f.evidence_reference}
                                    </p>
                                  )}

                                  {/* Action Advice */}
                                  <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
                                    <span>→ {f.recommended_action}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Standalone Report Modal */}
              {reportModalContent && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#111726] border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                        Exported TradeSloth Audit Report (Markdown)
                      </h4>
                      <button
                        onClick={() => setReportModalContent(null)}
                        className="p-1 rounded text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-slate-950 whitespace-pre-wrap leading-relaxed select-text">
                      {reportModalContent}
                    </div>

                    <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/40">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(reportModalContent);
                          setActionNotice('Report copied to clipboard.');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Markdown</span>
                      </button>

                      <button
                        onClick={() => setReportModalContent(null)}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'copilot' && (
            <div className="max-w-6xl mx-auto space-y-4 h-[calc(100vh-140px)] flex flex-col">
              {/* Header / Status Banner */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Local AI Copilot & Restricted Tools
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-semibold">
                        Offline-First
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Query system status, explain discrepancy findings, and propose actions through sandboxed tool schemas.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-slate-400">Model:</span>
                    <span className="text-white font-semibold">{systemSettings?.ollama_selected_model || 'None'}</span>
                    <span className={`w-2 h-2 rounded-full ${isOllamaConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  </div>
                  <button
                    onClick={handleCreateSession}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-1.5 transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>New Chat</span>
                  </button>
                </div>
              </div>

              {/* Chat & Tools Container */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
                {/* Left Panel: Sessions & Tool Registry */}
                <div className="lg:col-span-1 rounded-xl border border-slate-800 bg-[#111726]/60 p-4 flex flex-col space-y-4 overflow-hidden">
                  {/* Sessions */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Chat Sessions</span>
                      <span className="text-[11px] text-slate-500">{copilotSessions.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {copilotSessions.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          No sessions yet. Send a prompt to start one.
                        </div>
                      ) : (
                        copilotSessions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleSelectSession(s.id)}
                            className={`w-full text-left p-2.5 rounded-lg text-xs transition border flex items-center justify-between ${
                              s.id === activeSessionId
                                ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                                : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/40'
                            }`}
                          >
                            <span className="truncate max-w-[150px] font-medium" title={s.title}>
                              {s.title}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {s.message_count ?? 0} msgs
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Registered Tools Card */}
                  <div className="border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-purple-400" />
                        Tool Registry ({copilotTools.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {copilotTools.map((t) => (
                        <div key={t.name} className="p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-purple-300 font-semibold truncate max-w-[120px]" title={t.name}>
                              {t.name}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                              t.permission === 'PROPOSE_PLAN'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {t.permission}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1" title={t.description}>
                            {t.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Panel: Messages & Input */}
                <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-[#111726]/60 flex flex-col overflow-hidden">
                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {copilotMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                          <Bot className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white">How can SlothPilot help you today?</h4>
                          <p className="text-xs text-slate-400 max-w-md mt-1">
                            Ask questions, inspect discrepancy findings, or propose organizer actions. Direct filesystem mutations are strictly guarded behind approvals.
                          </p>
                        </div>

                        {/* Suggested Prompts */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full pt-2">
                          <button
                            onClick={() => handleSendPrompt('What is the current system status and connected model?')}
                            className="p-3 text-left rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 text-xs text-slate-300 transition group"
                          >
                            <div className="font-semibold text-white group-hover:text-purple-300">System Status</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">Check health and model connectivity</div>
                          </button>
                          <button
                            onClick={() => handleSendPrompt('List all approved filesystem roots.')}
                            className="p-3 text-left rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 text-xs text-slate-300 transition group"
                          >
                            <div className="font-semibold text-white group-hover:text-purple-300">Approved Roots</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">Inspect directories allowed for file ops</div>
                          </button>
                          <button
                            onClick={() => handleSendPrompt('Summarize any discrepancies in TradeSloth audits.')}
                            className="p-3 text-left rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 text-xs text-slate-300 transition group"
                          >
                            <div className="font-semibold text-white group-hover:text-purple-300">Shipment Audits</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">Cross-document discrepancy overview</div>
                          </button>
                          <button
                            onClick={() => handleSendPrompt('What is the status of running tasks in the background?')}
                            className="p-3 text-left rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900 text-xs text-slate-300 transition group"
                          >
                            <div className="font-semibold text-white group-hover:text-purple-300">Task Queue</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">Inspect queued and completed tasks</div>
                          </button>
                        </div>
                      </div>
                    ) : (
                      copilotMessages.map((m) => {
                        const isUser = m.role === 'user';
                        return (
                          <div
                            key={m.id}
                            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            {!isUser && (
                              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                                <Bot className="w-4 h-4" />
                              </div>
                            )}

                            <div
                              className={`max-w-2xl rounded-2xl p-4 text-xs space-y-2.5 leading-relaxed ${
                                isUser
                                  ? 'bg-purple-600 text-white rounded-br-none shadow-lg shadow-purple-600/10'
                                  : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none'
                              }`}
                            >
                              <div className="whitespace-pre-wrap">{m.content}</div>

                              {/* Tool calls card */}
                              {m.tool_calls && m.tool_calls.length > 0 && (
                                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                                  {m.tool_calls.map((tc, idx) => (
                                    <div
                                      key={idx}
                                      className="p-2.5 rounded-lg bg-slate-950/80 border border-purple-500/30 text-[11px] space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 font-mono text-purple-300 font-bold">
                                          <Wrench className="w-3.5 h-3.5" />
                                          <span>Executed Tool: {tc.name}</span>
                                        </div>
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300">
                                          Sandboxed
                                        </span>
                                      </div>

                                      {/* Arguments */}
                                      {Object.keys(tc.arguments || {}).length > 0 && (
                                        <div className="text-slate-400 font-mono text-[10px] bg-slate-900/60 p-1.5 rounded">
                                          Args: {JSON.stringify(tc.arguments)}
                                        </div>
                                      )}

                                      {/* If propose_file_organization was executed */}
                                      {tc.name === 'propose_file_organization' && (
                                        <div className="flex items-center justify-between pt-1">
                                          <span className="text-emerald-400 text-[10px] font-medium">
                                            ✓ Action plan prepared and sent to Approvals
                                          </span>
                                          <button
                                            onClick={() => setActiveTab('approvals')}
                                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[10px] flex items-center gap-1 transition"
                                          >
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Review in Approvals</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {isUser && (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                                <span className="text-xs font-bold font-mono">U</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {isCopilotLoading && (
                      <div className="flex gap-3 justify-start items-center text-xs text-slate-400">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                          <Bot className="w-4 h-4 animate-spin" />
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                          <span>Copilot reasoning & validating tool constraints...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input Form */}
                  <div className="p-3 border-t border-slate-800 bg-slate-900/40">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendPrompt();
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Ask about shipment audits, request system status, or ask to organize a folder..."
                        value={copilotPrompt}
                        onChange={(e) => setCopilotPrompt(e.target.value)}
                        disabled={isCopilotLoading}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isCopilotLoading || !copilotPrompt.trim()}
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs flex items-center gap-2 transition shadow-lg shadow-purple-600/20"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                    <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-500">
                      <span>Restricted tools obey approval workflows. Zero direct shell or command execution.</span>
                      <span className="font-mono">Local Loopback (127.0.0.1)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      Pending Action Approvals ({pendingPlans.length})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No automated action executes without explicit user consent. Inspect proposed file changes and risk levels.
                    </p>
                  </div>
                </div>

                {pendingPlans.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No pending approval requests. Scan a folder in the File Organizer to create one.
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    {pendingPlans.map((plan) => (
                      <div key={plan.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              {plan.module}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-1">{plan.title}</h4>
                            <p className="text-xs text-slate-400">{plan.description}</p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRejectPlan(plan.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                            >
                              <X className="w-3.5 h-3.5 text-rose-400" />
                              <span>Reject</span>
                            </button>
                            <button
                              onClick={() => handleApprovePlan(plan.id)}
                              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {plan.items.map((item) => (
                            <div key={item.id} className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs">
                              <div className="space-y-0.5 max-w-xl">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-200 truncate max-w-xs" title={item.source_path}>
                                    {item.source_path.split('\\').pop() || item.source_path.split('/').pop()}
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                                  <span className="font-mono text-[11px] text-emerald-400 truncate max-w-xs" title={item.target_path}>
                                    {item.target_path.split('\\').slice(-2).join('/')}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">{item.reason}</div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                                {item.risk_level.toUpperCase()} RISK
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ListTodo className="w-4 h-4 text-purple-400" />
                      Shared Task History & Lifecycle
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cooperative background tasks with progress tracking, error logs, and user cancellation.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                      <tr>
                        <th className="p-2.5">Task ID</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Message / Outcome</th>
                        <th className="p-2.5">Created (UTC)</th>
                        <th className="p-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {tasks.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-500">
                            No tasks executed yet.
                          </td>
                        </tr>
                      ) : (
                        tasks.map((task) => (
                          <tr key={task.id} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5 font-mono text-[11px] text-slate-400">
                              {task.id.slice(0, 8)}
                            </td>
                            <td className="p-2.5 uppercase font-mono text-[10px] text-blue-400">
                              {task.task_type}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                  task.status === 'succeeded'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : task.status === 'failed'
                                    ? 'bg-rose-500/20 text-rose-400'
                                    : task.status === 'running'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : task.status === 'cancelled'
                                    ? 'bg-slate-700 text-slate-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {task.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300 max-w-xs truncate" title={task.error_message || task.message}>
                              {task.error_message ? (
                                <span className="text-rose-400">{task.error_message}</span>
                              ) : (
                                task.message
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-400">
                              {task.created_at.slice(11, 19)}
                            </td>
                            <td className="p-2.5">
                              {(task.status === 'queued' || task.status === 'running') && (
                                <button
                                  onClick={() => handleCancelTask(task.id)}
                                  className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-medium flex items-center gap-1 transition"
                                >
                                  <StopCircle className="w-3 h-3" />
                                  <span>Cancel</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Local Ollama Model Configuration */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      Local Ollama AI Inference
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Open-weight models detected directly from your local Ollama runtime on loopback.
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded text-xs font-mono font-medium ${isOllamaConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {isOllamaConnected ? 'Ollama Online' : 'Ollama Offline'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Endpoint URL (Loopback Only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={systemSettings?.ollama_base_url || 'http://127.0.0.1:11434'}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Active Model
                    </label>
                    <select
                      value={systemSettings?.ollama_selected_model || ''}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={!modelsData?.models.length}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      {modelsData?.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!modelsData?.models.length && (
                        <option value="">No local models detected</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Approved Directory Roots */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    Approved Directory Roots
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Filesystem operations are strictly confined to these user-approved directories. All path traversal is blocked.
                  </p>
                </div>

                {/* Add Root Form */}
                <form onSubmit={handleAddRoot} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="e.g. C:\Users\RAHUL\Documents\Organize"
                    value={newRootPath}
                    onChange={(e) => setNewRootPath(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={newRootLabel}
                    onChange={(e) => setNewRootLabel(e.target.value)}
                    className="w-44 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Approve Root</span>
                  </button>
                </form>

                {/* Roots List */}
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
                  {systemSettings?.approved_roots.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No approved roots registered yet. Add a directory above to allow file scanning.
                    </div>
                  ) : (
                    systemSettings?.approved_roots.map((root) => (
                      <div key={root.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{root.label}</div>
                          <div className="font-mono text-[11px] text-slate-400">{root.path}</div>
                        </div>
                        <button
                          onClick={() => handleRemoveRoot(root.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Deactivate root"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Append-Only Audit Trail */}
              <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      Append-Only Audit Log
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Immutable record of all consequential operations, path validations, and approvals.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {totalAuditLogs} Total Entries
                  </span>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                      <tr>
                        <th className="p-2.5">Time (UTC)</th>
                        <th className="p-2.5">Module</th>
                        <th className="p-2.5">Action</th>
                        <th className="p-2.5">Details</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-500">
                            No audit log events recorded yet.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5 font-mono text-[11px] text-slate-400">
                              {log.timestamp.slice(11, 19)}
                            </td>
                            <td className="p-2.5 uppercase font-mono text-[10px] text-slate-400">
                              {log.module}
                            </td>
                            <td className="p-2.5 font-medium text-white">
                              {log.action}
                            </td>
                            <td className="p-2.5 text-slate-400 truncate max-w-xs" title={log.details}>
                              {log.details}
                            </td>
                            <td className="p-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${log.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {log.success ? 'SUCCESS' : 'BLOCKED'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'overview' && activeTab !== 'settings' && activeTab !== 'organizer' && activeTab !== 'approvals' && activeTab !== 'lazydesk' && activeTab !== 'tasks' && activeTab !== 'inbox' && activeTab !== 'tradesloth' && activeTab !== 'copilot' && (
            <div className="max-w-6xl mx-auto rounded-xl border border-slate-800 bg-[#111726]/40 p-8 text-center text-slate-400">
              <div className="w-12 h-12 mx-auto rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 mb-3">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white capitalize">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
                Connected to backend service. Module controller active on loopback interface.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                API Route: /api/{activeTab}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
