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
  ArrowRight
} from 'lucide-react';
import {
  fetchHealth,
  fetchReadiness,
  type HealthResponse,
  type ReadinessResponse
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, r] = await Promise.all([fetchHealth(), fetchReadiness()]);
      setHealth(h);
      setReadiness(r);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const ollamaComponent = readiness?.components.find((c) => c.name === 'ollama');
  const isOllamaConnected = ollamaComponent?.status === 'connected';

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'organizer', label: 'File Organizer', icon: FolderTree },
    { id: 'lazydesk', label: 'LazyDesk Automation', icon: Clock },
    { id: 'inbox', label: 'Inbox & Notes', icon: Inbox },
    { id: 'tradesloth', label: 'TradeSloth Auditor', icon: Scale },
    { id: 'copilot', label: 'Local Copilot', icon: Bot },
    { id: 'approvals', label: 'Approvals', icon: CheckCircle2, badge: 0 },
    { id: 'tasks', label: 'Task History', icon: ListTodo },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
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

        {/* Runtime Diagnostics Footer */}
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
              Ollama Engine
            </span>
            <span className="font-mono text-[10px] text-slate-300">
              {isOllamaConnected ? 'Active' : 'Offline / Waiting'}
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
              onClick={checkStatus}
              disabled={loading}
              title="Refresh health checks"
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Hero Status Banner */}
              <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-[#131c2e] to-slate-900 p-6 shadow-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                      Local AI Ready
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
                  <div className="text-base font-bold text-white">
                    {isOllamaConnected ? 'Active on 11434' : 'Offline / Standby'}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {ollamaComponent?.details || 'Local models available'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Pending Approvals</span>
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-base font-bold text-white">0 Actions</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    All file changes require user consent
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Active Folder Watches</span>
                    <Clock className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-base font-bold text-white">0 Folders</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    LazyDesk watch queue standby
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Audit Logs</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold text-white">Append-Only</div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Immutable SQLite audit record
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
                    Scan folders, compute SHA-256 duplicate hashes, extract text from PDFs and Office docs, and review deterministic move plans.
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
                    Watch folders continuously for downloads or invoice drops. Features event loop prevention and auto-summaries.
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
                    Import notes and EML email files offline. Extract action items, date obligations with source quotes, and draft local replies.
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
                    Audit multi-document shipments (Bill of Lading, Commercial Invoice, Packing List). High-precision decimal arithmetic.
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
                    Chat with your offline models. Registered tools with strict Pydantic schemas, permission boundaries, and offline fallbacks.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('approvals')}
                  className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 hover:border-emerald-500/40 cursor-pointer transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 flex items-center justify-between">
                    Action Approvals
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition" />
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Inspect pending file moves, renames, and batch reorganizations. Check preconditions, risk levels, and safe rollback history.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'overview' && (
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
                API Route: /api/{activeTab === 'organizer' ? 'organizer' : activeTab}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
