import { useState, useEffect, useRef, useCallback } from 'react';
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
  Wrench,
  FilePlus,
  FileEdit,
  FileX,
  ArrowRightLeft,
  Folder,
  Filter,
  Sliders,
  HelpCircle,
  Plus,
  Pencil,
  Eye
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
  fetchOrganizationRules,
  createOrganizationRule,
  updateOrganizationRule,
  deleteOrganizationRule,
  toggleOrganizationRule,
  testOrganizationRule,
  fetchTemplateVariables,
  previewTemplate,
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
  fetchWatcherEvents,
  clearWatcherEvents,
  type HealthResponse,
  type ReadinessResponse,
  type SystemSettings,
  type ModelsResponse,
  type AuditLogEntry,
  type ActionPlan,
  type ScanResult,
  type OrganizationRule,
  type RuleCreate,
  type RuleTestResponse,
  type TemplateVariableInfo,
  type FolderWatch,
  type TaskRecord,
  type InboxItem,
  type ShipmentAudit,
  type CopilotTool,
  type CopilotSession,
  type CopilotMessage,
  type WatcherEvent
} from './services/api';

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFilename(pathStr?: string | null): string {
  if (!pathStr) return '';
  const normalized = pathStr.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || pathStr;
}

function formatLocaleTime(isoStr: string): { time: string; full: string } {
  try {
    const d = new Date(isoStr);
    return {
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      full: d.toLocaleString()
    };
  } catch {
    return { time: isoStr, full: isoStr };
  }
}

function getEventBadge(eventType: string, isDirectory: boolean) {
  switch (eventType) {
    case 'created':
      return {
        label: isDirectory ? 'FOLDER CREATED' : 'FILE CREATED',
        icon: isDirectory ? FolderPlus : FilePlus,
        badgeStyle: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
        cardBorder: 'hover:border-emerald-500/30'
      };
    case 'modified':
      return {
        label: isDirectory ? 'DIR MODIFIED' : 'FILE MODIFIED',
        icon: FileEdit,
        badgeStyle: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
        cardBorder: 'hover:border-amber-500/30'
      };
    case 'moved':
      return {
        label: isDirectory ? 'FOLDER MOVED' : 'RENAMED / MOVED',
        icon: ArrowRightLeft,
        badgeStyle: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
        cardBorder: 'hover:border-sky-500/30'
      };
    case 'deleted':
      return {
        label: isDirectory ? 'FOLDER DELETED' : 'FILE DELETED',
        icon: FileX,
        badgeStyle: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
        cardBorder: 'hover:border-rose-500/30'
      };
    default:
      return {
        label: eventType.toUpperCase(),
        icon: Activity,
        badgeStyle: 'bg-slate-500/15 border-slate-500/30 text-slate-400',
        cardBorder: 'hover:border-slate-700'
      };
  }
}

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

  // Organizer scan & rules states
  const [organizerSubTab, setOrganizerSubTab] = useState<'scan' | 'rules'>('scan');
  const [scanFolderInput, setScanFolderInput] = useState<string>('');
  const [useAiClassification, setUseAiClassification] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [latestScanResult, setLatestScanResult] = useState<ScanResult | null>(null);

  // Organization Rules & Templates states
  const [rules, setRules] = useState<OrganizationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState<boolean>(false);
  const [templateVariables, setTemplateVariables] = useState<TemplateVariableInfo[]>([]);
  const [exampleTemplates, setExampleTemplates] = useState<string[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Form states for Create/Edit Rule
  const [ruleFormName, setRuleFormName] = useState<string>('');
  const [ruleFormDescription, setRuleFormDescription] = useState<string>('');
  const [ruleFormPriority, setRuleFormPriority] = useState<number>(100);
  const [ruleFormEnabled, setRuleFormEnabled] = useState<boolean>(true);
  const [ruleFormExtensions, setRuleFormExtensions] = useState<string>('');
  const [ruleFormGlob, setRuleFormGlob] = useState<string>('');
  const [ruleFormRegex, setRuleFormRegex] = useState<string>('');
  const [ruleFormTemplate, setRuleFormTemplate] = useState<string>('{year}/{month}/{stem}.{extension}');
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);
  const [ruleFormSaving, setRuleFormSaving] = useState<boolean>(false);

  // Live destination preview inside modal
  const [modalPreviewFilename, setModalPreviewFilename] = useState<string>('invoice_2026_q3.pdf');
  const [modalPreviewCategory, setModalPreviewCategory] = useState<string>('Invoices & Receipts');
  const [modalPreviewDestination, setModalPreviewDestination] = useState<string>('');
  const [modalPreviewError, setModalPreviewError] = useState<string | null>(null);

  // Interactive Test-a-Rule Sandbox
  const [showTestSandbox, setShowTestSandbox] = useState<boolean>(true);
  const [showVariableGuide, setShowVariableGuide] = useState<boolean>(false);
  const [testFilename, setTestFilename] = useState<string>('contract_agreement_v2.pdf');
  const [testCategory, setTestCategory] = useState<string>('Contracts & Legal');
  const [testSelectedRuleId, setTestSelectedRuleId] = useState<string>('all');
  const [testResult, setTestResult] = useState<RuleTestResponse | null>(null);
  const [isTestingRule, setIsTestingRule] = useState<boolean>(false);
  const [testRuleError, setTestRuleError] = useState<string | null>(null);

  // Delete Rule confirmation
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<OrganizationRule | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState<boolean>(false);

  // LazyDesk & Activity Timeline states
  const [lazyDeskSubTab, setLazyDeskSubTab] = useState<'activity' | 'monitors'>('activity');
  const [watchFolderInput, setWatchFolderInput] = useState<string>('');
  const [watcherEvents, setWatcherEvents] = useState<WatcherEvent[]>([]);
  const [isWatcherLoading, setIsWatcherLoading] = useState<boolean>(false);
  const [isWatcherFetching, setIsWatcherFetching] = useState<boolean>(false);
  const [isWatcherPolling, setIsWatcherPolling] = useState<boolean>(true);
  const [watcherError, setWatcherError] = useState<string | null>(null);
  const [watcherEventTypeFilter, setWatcherEventTypeFilter] = useState<string>('all');
  const [watcherFolderFilter, setWatcherFolderFilter] = useState<string>('all');
  const [watcherSearchQuery, setWatcherSearchQuery] = useState<string>('');
  const [confirmClearFeedModal, setConfirmClearFeedModal] = useState<boolean>(false);
  const [isClearingFeed, setIsClearingFeed] = useState<boolean>(false);
  const isFetchingWatcherRef = useRef<boolean>(false);

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
      const [h, r, s, m, a, p, w, t, inb, aud, rls, tpls] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchReadiness().catch(() => null),
        fetchSettings().catch(() => null),
        fetchModels().catch(() => null),
        fetchAuditLogs(undefined, 10, 0).catch(() => ({ total: 0, items: [] })),
        fetchPendingApprovals().catch(() => []),
        fetchWatches().catch(() => []),
        fetchTasks(undefined, 20).catch(() => []),
        fetchInboxItems(inboxSearchQuery || undefined).catch(() => []),
        fetchShipmentAudits().catch(() => []),
        fetchOrganizationRules().catch(() => []),
        fetchTemplateVariables().catch(() => null)
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
      if (rls) setRules(rls);
      if (tpls) {
        setTemplateVariables(tpls.variables || []);
        setExampleTemplates(tpls.example_templates || []);
      }
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

  const loadRules = async () => {
    try {
      setRulesLoading(true);
      const data = await fetchOrganizationRules();
      setRules(data);
    } catch (err: any) {
      console.error('Failed to load rules:', err);
    } finally {
      setRulesLoading(false);
    }
  };

  const triggerModalPreview = async (templateStr: string, sampleFilename: string, catName: string) => {
    if (!templateStr.trim()) {
      setModalPreviewDestination('');
      setModalPreviewError('Destination template cannot be empty.');
      return;
    }
    try {
      const res = await previewTemplate({
        template: templateStr.trim(),
        sample_filename: sampleFilename.trim() || 'sample_document.pdf',
        category: catName.trim() || 'Invoices & Receipts'
      });
      setModalPreviewDestination(res.resolved_destination);
      setModalPreviewError(null);
    } catch (err: any) {
      setModalPreviewDestination('');
      setModalPreviewError(err.message || 'Invalid template syntax.');
    }
  };

  const handleOpenCreateRule = () => {
    setEditingRuleId(null);
    setRuleFormName('');
    setRuleFormDescription('');
    setRuleFormPriority(100);
    setRuleFormEnabled(true);
    setRuleFormExtensions('');
    setRuleFormGlob('');
    setRuleFormRegex('');
    const defaultTemplate = '{year}/{month}/{stem}.{extension}';
    setRuleFormTemplate(defaultTemplate);
    setRuleFormError(null);
    setModalPreviewFilename('invoice_2026_q3.pdf');
    setModalPreviewCategory('Invoices & Receipts');
    setRuleModalOpen(true);
    triggerModalPreview(defaultTemplate, 'invoice_2026_q3.pdf', 'Invoices & Receipts');
  };

  const handleOpenEditRule = (rule: OrganizationRule) => {
    setEditingRuleId(rule.id);
    setRuleFormName(rule.name);
    setRuleFormDescription(rule.description || '');
    setRuleFormPriority(rule.priority);
    setRuleFormEnabled(rule.is_enabled);
    setRuleFormExtensions(rule.match_extensions || '');
    setRuleFormGlob(rule.match_glob || '');
    setRuleFormRegex(rule.match_regex || '');
    setRuleFormTemplate(rule.destination_template);
    setRuleFormError(null);
    setModalPreviewFilename('sample_document.pdf');
    setModalPreviewCategory(rule.name);
    setRuleModalOpen(true);
    triggerModalPreview(rule.destination_template, 'sample_document.pdf', rule.name);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleFormName.trim()) {
      setRuleFormError('Rule name is required.');
      return;
    }
    if (!ruleFormTemplate.trim()) {
      setRuleFormError('Destination template is required.');
      return;
    }

    try {
      setRuleFormSaving(true);
      setRuleFormError(null);

      const payload: RuleCreate = {
        name: ruleFormName.trim(),
        description: ruleFormDescription.trim(),
        priority: Number(ruleFormPriority) || 100,
        is_enabled: ruleFormEnabled,
        match_extensions: ruleFormExtensions.trim(),
        match_glob: ruleFormGlob.trim(),
        match_regex: ruleFormRegex.trim(),
        destination_template: ruleFormTemplate.trim(),
        action_type: 'move'
      };

      if (editingRuleId) {
        await updateOrganizationRule(editingRuleId, payload);
        setActionNotice(`Organization rule '${ruleFormName}' updated successfully.`);
      } else {
        await createOrganizationRule(payload);
        setActionNotice(`New organization rule '${ruleFormName}' created.`);
      }

      setRuleModalOpen(false);
      await loadRules();
    } catch (err: any) {
      setRuleFormError(err.message || 'Failed to save organization rule.');
    } finally {
      setRuleFormSaving(false);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      const updated = await toggleOrganizationRule(ruleId);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      setActionNotice(`Rule '${updated.name}' is now ${updated.is_enabled ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setActionNotice(`Failed to toggle rule: ${err.message}`);
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleTarget) return;
    try {
      setIsDeletingRule(true);
      await deleteOrganizationRule(deleteRuleTarget.id);
      setActionNotice(`Organization rule '${deleteRuleTarget.name}' deleted.`);
      setRules((prev) => prev.filter((r) => r.id !== deleteRuleTarget.id));
      setDeleteRuleTarget(null);
    } catch (err: any) {
      setActionNotice(`Failed to delete rule: ${err.message}`);
    } finally {
      setIsDeletingRule(false);
    }
  };

  const handleRunRuleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testFilename.trim()) return;

    try {
      setIsTestingRule(true);
      setTestRuleError(null);
      const res = await testOrganizationRule({
        sample_filename: testFilename.trim(),
        sample_category: testCategory.trim() || undefined,
        rule_id: testSelectedRuleId === 'all' ? undefined : testSelectedRuleId
      });
      setTestResult(res);
    } catch (err: any) {
      setTestRuleError(err.message || 'Rule testing failed.');
      setTestResult(null);
    } finally {
      setIsTestingRule(false);
    }
  };

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

  const fetchEvents = useCallback(async (isInitial = false) => {
    if (isFetchingWatcherRef.current) return;
    isFetchingWatcherRef.current = true;
    if (isInitial) setIsWatcherLoading(true);
    setIsWatcherFetching(true);
    try {
      const resp = await fetchWatcherEvents(undefined, undefined, 1000, 0);
      setWatcherEvents(resp.events || []);
      setWatcherError(null);
    } catch (err: any) {
      setWatcherError(err.message || 'Failed to fetch watcher events.');
    } finally {
      isFetchingWatcherRef.current = false;
      if (isInitial) setIsWatcherLoading(false);
      setIsWatcherFetching(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'lazydesk' || !isWatcherPolling) {
      return;
    }

    // Trigger immediate fetch upon opening LazyDesk or resuming polling
    fetchEvents(true);

    const intervalId = setInterval(() => {
      fetchEvents(false);
    }, 1500);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTab, isWatcherPolling, fetchEvents]);

  const handleClearWatcherFeed = async () => {
    try {
      setIsClearingFeed(true);
      await clearWatcherEvents();
      setWatcherEvents([]);
      setConfirmClearFeedModal(false);
      setActionNotice('In-memory watcher activity feed cleared. Permanent SQLite audit logs remain untouched.');
    } catch (err: any) {
      setActionNotice(`Failed to clear watcher activity: ${err.message}`);
    } finally {
      setIsClearingFeed(false);
    }
  };

  const filteredWatcherEvents = watcherEvents.filter((ev) => {
    if (watcherEventTypeFilter !== 'all' && ev.event_type !== watcherEventTypeFilter) {
      return false;
    }
    if (watcherFolderFilter !== 'all' && ev.watch_id !== watcherFolderFilter && ev.folder_path !== watcherFolderFilter) {
      return false;
    }
    if (watcherSearchQuery.trim()) {
      const q = watcherSearchQuery.toLowerCase().trim();
      const pathMatch = ev.path?.toLowerCase().includes(q);
      const relMatch = ev.relative_path?.toLowerCase().includes(q);
      const prevPathMatch = ev.previous_path?.toLowerCase().includes(q);
      const prevRelMatch = ev.previous_relative_path?.toLowerCase().includes(q);
      const fn = getFilename(ev.path || ev.relative_path).toLowerCase();
      const fnMatch = fn.includes(q);
      if (!pathMatch && !relMatch && !prevPathMatch && !prevRelMatch && !fnMatch) {
        return false;
      }
    }
    return true;
  });

  const watcherEventCounts = {
    all: watcherEvents.length,
    created: watcherEvents.filter((e) => e.event_type === 'created').length,
    modified: watcherEvents.filter((e) => e.event_type === 'modified').length,
    moved: watcherEvents.filter((e) => e.event_type === 'moved').length,
    deleted: watcherEvents.filter((e) => e.event_type === 'deleted').length
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
            <div className="space-y-6 max-w-6xl mx-auto pb-10">
              {/* Organizer Header and Sub-tab Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-emerald-400" />
                    Smart File Organizer
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Deterministic organization rules, reusable destination templates, and local AI fallback.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                  <button
                    onClick={() => setOrganizerSubTab('scan')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                      organizerSubTab === 'scan'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Folder Scanner & Plans</span>
                  </button>

                  <button
                    onClick={() => setOrganizerSubTab('rules')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                      organizerSubTab === 'rules'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Rules & Templates</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-200 border border-emerald-400/30">
                      {rules.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: Folder Scanner & Execution Plans */}
              {organizerSubTab === 'scan' && (
                <div className="space-y-6 max-w-5xl mx-auto">
                  <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-emerald-400" />
                        Smart Folder Scan & Organization
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Select an approved root directory to index file metadata, detect exact SHA-256 duplicates, evaluate deterministic organization rules, and generate proposed move plans.
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
                          Enable local open-weight AI fallback classification ({systemSettings?.ollama_selected_model || 'Ollama'}) if no rules match
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

              {/* Sub-tab 2: Rules & Reusable Templates */}
              {organizerSubTab === 'rules' && (
                <div className="space-y-6">
                  {/* Action Bar & Quick Controls */}
                  <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-emerald-400" />
                        Deterministic Organization Rules
                      </h3>
                      <p className="text-xs text-slate-400">
                        Priority-ordered rules evaluate filename patterns and file extensions first. Unmatched files fallback to local AI.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowVariableGuide(!showVariableGuide)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
                          showVariableGuide
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Variable Guide</span>
                      </button>

                      <button
                        onClick={() => setShowTestSandbox(!showTestSandbox)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
                          showTestSandbox
                            ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Test-a-Rule Sandbox</span>
                      </button>

                      <button
                        onClick={handleOpenCreateRule}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Organization Rule</span>
                      </button>
                    </div>
                  </div>

                  {/* Variable Reference Guide Drawer */}
                  {showVariableGuide && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-400">
                          <HelpCircle className="w-4 h-4" />
                          <h4 className="text-xs font-bold uppercase tracking-wider">Template Variables & Date Semantics</h4>
                        </div>
                        <span className="text-[11px] text-amber-300/80 font-mono">Date Source: st_mtime (UTC)</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {templateVariables.map((v) => (
                          <div key={v.variable} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                {v.variable}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">e.g. {v.example}</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">{v.description}</p>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="text-[11px] font-semibold text-slate-300 block mb-2">Click an example template to load into rule builder:</span>
                        <div className="flex flex-wrap gap-2">
                          {exampleTemplates.map((tpl) => (
                            <button
                              key={tpl}
                              onClick={() => {
                                handleOpenCreateRule();
                                setRuleFormTemplate(tpl);
                                triggerModalPreview(tpl, 'sample.pdf', 'General');
                              }}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-emerald-300 transition"
                            >
                              {tpl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Interactive Test-a-Rule Sandbox */}
                  {showTestSandbox && (
                    <div className="rounded-xl border border-sky-500/30 bg-[#111726]/80 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sky-400">
                          <Eye className="w-4 h-4" />
                          <h4 className="text-xs font-bold uppercase tracking-wider">Test-a-Rule Interactive Sandbox</h4>
                        </div>
                        <span className="text-[11px] text-slate-400">Evaluate sample filenames against active rules without modifying files</span>
                      </div>

                      <form onSubmit={handleRunRuleTest} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-4 space-y-1">
                          <label className="text-[11px] text-slate-400 block font-medium">Sample Filename to Test</label>
                          <input
                            type="text"
                            value={testFilename}
                            onChange={(e) => setTestFilename(e.target.value)}
                            placeholder="e.g. invoice_2026_10.pdf"
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                          <label className="text-[11px] text-slate-400 block font-medium">Sample Category ({'{category}'})</label>
                          <input
                            type="text"
                            value={testCategory}
                            onChange={(e) => setTestCategory(e.target.value)}
                            placeholder="e.g. Invoices & Receipts"
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                          <label className="text-[11px] text-slate-400 block font-medium">Evaluation Scope</label>
                          <select
                            value={testSelectedRuleId}
                            onChange={(e) => setTestSelectedRuleId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                          >
                            <option value="all">Evaluate All Active Rules (First Match)</option>
                            {rules.map((r) => (
                              <option key={r.id} value={r.id}>
                                #{r.priority} - {r.name} {r.is_enabled ? '' : '(Disabled)'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={isTestingRule || !testFilename.trim()}
                            className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                          >
                            {isTestingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            <span>Test Match</span>
                          </button>
                        </div>
                      </form>

                      {testRuleError && (
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          {testRuleError}
                        </div>
                      )}

                      {testResult && (
                        <div className={`p-4 rounded-lg border text-xs space-y-2 ${
                          testResult.matched
                            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                            : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5">
                              {testResult.matched ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  <span className="text-emerald-300">RULE MATCHED: {testResult.rule_name}</span>
                                  {testResult.priority && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                                      Priority #{testResult.priority}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                                  <span className="text-amber-300">NO RULE MATCHED</span>
                                </>
                              )}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">{testFilename}</span>
                          </div>

                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            <strong>Reason:</strong> {testResult.reason}
                          </p>

                          {testResult.resolved_destination && (
                            <div className="pt-2 border-t border-emerald-500/20 flex items-center gap-2">
                              <span className="text-[11px] text-slate-400 font-semibold">Resolved Destination:</span>
                              <span className="font-mono text-emerald-300 font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/30">
                                {testResult.resolved_destination}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rules List / Table */}
                  <div className="rounded-xl border border-slate-800 bg-[#111726]/60 overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Active Rule Pipeline</span>
                        {rulesLoading && <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                          {rules.filter((r) => r.is_enabled).length} of {rules.length} Enabled
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">Evaluated in ascending priority order (1 = highest)</span>
                    </div>

                    {rules.length === 0 ? (
                      <div className="p-12 text-center space-y-3">
                        <Sliders className="w-8 h-8 text-slate-600 mx-auto" />
                        <h4 className="text-sm font-semibold text-white">No organization rules defined</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Create your first rule to automatically categorize and route files to safe destination templates.
                        </p>
                        <button
                          onClick={handleOpenCreateRule}
                          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create First Rule</span>
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/80">
                        {rules.map((rule) => (
                          <div
                            key={rule.id}
                            className={`p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                              rule.is_enabled ? 'bg-slate-900/30 hover:bg-slate-900/60' : 'bg-slate-950/40 opacity-70'
                            }`}
                          >
                            <div className="space-y-1.5 max-w-xl">
                              <div className="flex items-center gap-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                  rule.is_enabled
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}>
                                  #{rule.priority}
                                </span>
                                <span className="font-semibold text-white text-xs">{rule.name}</span>
                                {rule.action_type && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                    {rule.action_type.toUpperCase()}
                                  </span>
                                )}
                              </div>

                              {rule.description && (
                                <p className="text-[11px] text-slate-400">{rule.description}</p>
                              )}

                              {/* Match Criteria Badges */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {rule.match_extensions && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300">
                                    ext: {rule.match_extensions}
                                  </span>
                                )}
                                {rule.match_glob && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-300">
                                    glob: {rule.match_glob}
                                  </span>
                                )}
                                {rule.match_regex && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                    regex: {rule.match_regex}
                                  </span>
                                )}
                                {!rule.match_extensions && !rule.match_glob && !rule.match_regex && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400">
                                    all files
                                  </span>
                                )}
                                <ChevronRight className="w-3 h-3 text-slate-600" />
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-emerald-500/30 text-emerald-300 font-bold">
                                  {rule.destination_template}
                                </span>
                              </div>
                            </div>

                            {/* Actions and Toggle */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleRule(rule.id)}
                                title={rule.is_enabled ? 'Click to disable' : 'Click to enable'}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition flex items-center gap-1.5 ${
                                  rule.is_enabled
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                {rule.is_enabled ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    <span>Enabled</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                    <span>Disabled</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  setShowTestSandbox(true);
                                  setTestSelectedRuleId(rule.id);
                                  handleRunRuleTest();
                                }}
                                title="Test rule in sandbox"
                                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              >
                                <Play className="w-3.5 h-3.5 text-sky-400" />
                              </button>

                              <button
                                onClick={() => handleOpenEditRule(rule)}
                                title="Edit rule"
                                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              >
                                <Pencil className="w-3.5 h-3.5 text-amber-400" />
                              </button>

                              <button
                                onClick={() => setDeleteRuleTarget(rule)}
                                title="Delete rule"
                                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Create / Edit Rule Modal */}
              {ruleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
                  <div className="bg-[#111726] border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl my-8">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">
                          {editingRuleId ? `Edit Rule: ${ruleFormName}` : 'Create Organization Rule'}
                        </h3>
                      </div>
                      <button
                        onClick={() => setRuleModalOpen(false)}
                        className="text-slate-400 hover:text-white transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveRule} className="space-y-4">
                      {ruleFormError && (
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          {ruleFormError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-8 space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium block">
                            Rule Name <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={ruleFormName}
                            onChange={(e) => {
                              setRuleFormName(e.target.value);
                              triggerModalPreview(ruleFormTemplate, modalPreviewFilename, e.target.value);
                            }}
                            placeholder="e.g. Invoices & Receipts"
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="sm:col-span-4 space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium block">
                            Priority <span className="text-slate-500">(1-10000)</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={ruleFormPriority}
                            onChange={(e) => setRuleFormPriority(parseInt(e.target.value, 10) || 100)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-300 font-medium block">Description</label>
                        <input
                          type="text"
                          value={ruleFormDescription}
                          onChange={(e) => setRuleFormDescription(e.target.value)}
                          placeholder="Optional explanation of what this rule categorizes"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                          Match Criteria (Evaluated Together)
                        </span>

                        <div className="space-y-2 text-xs">
                          <div>
                            <label className="text-[11px] text-slate-400 block mb-0.5">
                              Extensions <span className="text-slate-500">(comma-separated, e.g. .pdf, .docx, .xlsx)</span>
                            </label>
                            <input
                              type="text"
                              value={ruleFormExtensions}
                              onChange={(e) => setRuleFormExtensions(e.target.value)}
                              placeholder=".pdf, .docx, .xlsx"
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] text-slate-400 block mb-0.5">
                              Filename Glob Pattern <span className="text-slate-500">(e.g. *invoice*, report_????_*)</span>
                            </label>
                            <input
                              type="text"
                              value={ruleFormGlob}
                              onChange={(e) => setRuleFormGlob(e.target.value)}
                              placeholder="*invoice*"
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] text-slate-400 block mb-0.5">
                              Regular Expression <span className="text-slate-500">(optional, e.g. (?i)^(inv|rec)-)</span>
                            </label>
                            <input
                              type="text"
                              value={ruleFormRegex}
                              onChange={(e) => setRuleFormRegex(e.target.value)}
                              placeholder="(?i)^(inv|rec)-"
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Destination Template & Variables */}
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-300 font-medium block">
                          Destination Template <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={ruleFormTemplate}
                          onChange={(e) => {
                            setRuleFormTemplate(e.target.value);
                            triggerModalPreview(e.target.value, modalPreviewFilename, ruleFormName);
                          }}
                          placeholder="{year}/{month}/{stem}.{extension}"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 font-mono"
                        />

                        {/* Quick Variable Insert Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 mr-1">Insert variable:</span>
                          {['{year}', '{month}', '{day}', '{stem}', '{extension}', '{category}'].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                const updated = ruleFormTemplate ? `${ruleFormTemplate}/${v}` : v;
                                setRuleFormTemplate(updated);
                                triggerModalPreview(updated, modalPreviewFilename, ruleFormName);
                              }}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-emerald-300 border border-slate-700 transition"
                            >
                              + {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live Destination Resolution Preview */}
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Eye className="w-3 h-3 text-emerald-400" />
                            Live Destination Preview
                          </span>
                          <span className="text-[10px] text-slate-500">Dates resolved from st_mtime (UTC)</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 block mb-0.5">Sample Filename:</span>
                            <input
                              type="text"
                              value={modalPreviewFilename}
                              onChange={(e) => {
                                setModalPreviewFilename(e.target.value);
                                triggerModalPreview(ruleFormTemplate, e.target.value, modalPreviewCategory);
                              }}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono focus:outline-none"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block mb-0.5">Category ({'{category}'}):</span>
                            <input
                              type="text"
                              value={modalPreviewCategory}
                              onChange={(e) => {
                                setModalPreviewCategory(e.target.value);
                                triggerModalPreview(ruleFormTemplate, modalPreviewFilename, e.target.value);
                              }}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 focus:outline-none"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block mb-0.5">Resolved Path:</span>
                            <div className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono truncate">
                              {modalPreviewError ? (
                                <span className="text-rose-400">{modalPreviewError}</span>
                              ) : (
                                <span className="text-emerald-400 font-semibold">{modalPreviewDestination || '-'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="rule-enabled-chk"
                          checked={ruleFormEnabled}
                          onChange={(e) => setRuleFormEnabled(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                        />
                        <label htmlFor="rule-enabled-chk" className="text-xs text-slate-300 select-none cursor-pointer">
                          Enable this rule for active organization
                        </label>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setRuleModalOpen(false)}
                          disabled={ruleFormSaving}
                          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={ruleFormSaving || !ruleFormName.trim() || !ruleFormTemplate.trim()}
                          className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          {ruleFormSaving ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>{editingRuleId ? 'Update Rule' : 'Save Rule'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Delete Rule Confirmation Modal */}
              {deleteRuleTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                  <div className="bg-[#111726] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center gap-3 text-rose-400">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-rose-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Delete Organization Rule?</h3>
                        <p className="text-[11px] text-slate-400">Rule: {deleteRuleTarget.name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Are you sure you want to delete this rule? Any files previously organized by this rule will remain intact, but future scans will no longer apply this rule.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteRuleTarget(null)}
                        disabled={isDeletingRule}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteRule}
                        disabled={isDeletingRule}
                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition flex items-center gap-1.5 shadow disabled:opacity-50"
                      >
                        {isDeletingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>Delete Rule</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'lazydesk' && (
            <div className="space-y-6 max-w-6xl mx-auto pb-10">
              {/* Header and Subtab Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    LazyDesk Automation & Activity
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Real-time file observer with debouncing, loop prevention, and approval-driven organization.
                  </p>
                </div>

                {/* Subtab Segmented Switcher */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto">
                  <button
                    onClick={() => setLazyDeskSubTab('activity')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                      lazyDeskSubTab === 'activity'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Activity Timeline</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-blue-950 text-blue-200 border border-blue-400/30">
                      {watcherEvents.length}
                    </span>
                    {isWatcherPolling && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setLazyDeskSubTab('monitors')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                      lazyDeskSubTab === 'monitors'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>Folder Monitors</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                      {watches.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Subtab 1: Activity Timeline */}
              {lazyDeskSubTab === 'activity' && (
                <div className="space-y-5">
                  {/* Notice if no watches are configured */}
                  {watches.length === 0 && (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>No folders are actively being monitored yet. Add a watched folder to start recording real-time events.</span>
                      </div>
                      <button
                        onClick={() => setLazyDeskSubTab('monitors')}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shrink-0 self-start sm:self-auto"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Configure Monitors</span>
                      </button>
                    </div>
                  )}

                  {/* Activity Toolbar: Live Status, Polling, Refresh, Clear */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-[#111726]/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Live / Paused Status Toggle */}
                      {isWatcherPolling ? (
                        <button
                          onClick={() => setIsWatcherPolling(false)}
                          className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center gap-2 transition"
                          title="Click to pause real-time feed updates"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="font-semibold">LIVE</span>
                          <span className="text-[10px] text-emerald-400/70 font-mono">(1.5s poll)</span>
                          <Pause className="w-3 h-3 text-emerald-400 ml-0.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setIsWatcherPolling(true)}
                          className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-2 transition"
                          title="Click to resume real-time updates"
                        >
                          <Play className="w-3 h-3 text-amber-400" />
                          <span className="font-semibold">PAUSED</span>
                          <span className="text-[10px] text-amber-400/70">Click to resume</span>
                        </button>
                      )}

                      {/* Manual Refresh Button */}
                      <button
                        onClick={() => fetchEvents(false)}
                        disabled={isWatcherFetching}
                        className="p-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                        title="Manually poll watcher events from backend"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isWatcherFetching ? 'animate-spin text-blue-400' : ''}`} />
                        <span>{isWatcherFetching ? 'Syncing...' : 'Refresh'}</span>
                      </button>

                      {/* Buffer Info Badge */}
                      <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                        Ring buffer: {watcherEvents.length} / 1,000 events
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Clear Activity Button */}
                      <button
                        onClick={() => setConfirmClearFeedModal(true)}
                        disabled={watcherEvents.length === 0}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500/40 bg-slate-800/80 hover:bg-rose-500/10 text-slate-300 hover:text-rose-300 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-300"
                        title="Clear in-memory activity feed"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Clear Feed</span>
                      </button>
                    </div>
                  </div>

                  {/* Search and Filters Controls */}
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[240px]">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search events by filename or path..."
                        value={watcherSearchQuery}
                        onChange={(e) => setWatcherSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                      {watcherSearchQuery && (
                        <button
                          onClick={() => setWatcherSearchQuery('')}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Watched Folder Filter Dropdown (if multiple watches) */}
                    {watches.length > 1 && (
                      <select
                        value={watcherFolderFilter}
                        onChange={(e) => setWatcherFolderFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition"
                      >
                        <option value="all">All Watched Folders ({watches.length})</option>
                        {watches.map((w) => (
                          <option key={w.id} value={w.id}>
                            {getFilename(w.folder_path)} ({w.folder_path})
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Event Type Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                      <span className="text-slate-500 text-xs hidden lg:flex items-center gap-1 font-medium mr-1">
                        <Filter className="w-3.5 h-3.5 text-slate-500" />
                      </span>
                      <button
                        onClick={() => setWatcherEventTypeFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                          watcherEventTypeFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        <span>All</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/30">
                          {watcherEventCounts.all}
                        </span>
                      </button>

                      <button
                        onClick={() => setWatcherEventTypeFilter('created')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                          watcherEventTypeFilter === 'created'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900/80 text-emerald-400 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        <FilePlus className="w-3.5 h-3.5" />
                        <span>Created</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/30">
                          {watcherEventCounts.created}
                        </span>
                      </button>

                      <button
                        onClick={() => setWatcherEventTypeFilter('modified')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                          watcherEventTypeFilter === 'modified'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-900/80 text-amber-400 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Modified</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/30">
                          {watcherEventCounts.modified}
                        </span>
                      </button>

                      <button
                        onClick={() => setWatcherEventTypeFilter('moved')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                          watcherEventTypeFilter === 'moved'
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-900/80 text-sky-400 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Renamed</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/30">
                          {watcherEventCounts.moved}
                        </span>
                      </button>

                      <button
                        onClick={() => setWatcherEventTypeFilter('deleted')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                          watcherEventTypeFilter === 'deleted'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900/80 text-rose-400 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        <FileX className="w-3.5 h-3.5" />
                        <span>Deleted</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/30">
                          {watcherEventCounts.deleted}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Recoverable Error Banner */}
                  {watcherError && (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Watcher API Error: {watcherError}</span>
                      </div>
                      <button
                        onClick={() => fetchEvents(false)}
                        className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition shrink-0"
                      >
                        Retry Connection
                      </button>
                    </div>
                  )}

                  {/* Initial Loading Skeleton */}
                  {isWatcherLoading && watcherEvents.length === 0 && (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="animate-pulse rounded-xl border border-slate-800 bg-[#111726]/40 p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="h-4 w-32 bg-slate-800 rounded"></div>
                            <div className="h-3 w-24 bg-slate-800 rounded"></div>
                          </div>
                          <div className="h-5 w-3/4 bg-slate-800 rounded"></div>
                          <div className="h-3 w-1/2 bg-slate-800 rounded"></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty States */}
                  {!isWatcherLoading && filteredWatcherEvents.length === 0 && (
                    <div className="rounded-xl border border-slate-800 bg-[#111726]/40 p-10 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                        <Activity className="w-6 h-6 text-blue-400" />
                      </div>
                      {watcherEvents.length === 0 ? (
                        <>
                          <h4 className="text-sm font-bold text-white">No File Activity Detected Yet</h4>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            Files added, modified, renamed, or deleted within your configured watched folders will appear here in real-time.
                          </p>
                          {watches.length === 0 && (
                            <div className="pt-2">
                              <button
                                onClick={() => setLazyDeskSubTab('monitors')}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition"
                              >
                                <FolderPlus className="w-3.5 h-3.5" />
                                <span>Add Watched Folder</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <h4 className="text-sm font-bold text-white">No Matching Events Found</h4>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            No recorded events match the selected filters or search query.
                          </p>
                          <div className="pt-2">
                            <button
                              onClick={() => {
                                setWatcherEventTypeFilter('all');
                                setWatcherFolderFilter('all');
                                setWatcherSearchQuery('');
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset Filters</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Real-Time Events Feed */}
                  {filteredWatcherEvents.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                        <span>Showing {filteredWatcherEvents.length} event(s) • Newest first</span>
                        <span className="font-mono text-[11px] text-slate-500">Live feed active</span>
                      </div>

                      {filteredWatcherEvents.map((ev) => {
                        const badgeInfo = getEventBadge(ev.event_type, ev.is_directory);
                        const EventIcon = badgeInfo.icon;
                        const timeInfo = formatLocaleTime(ev.timestamp);
                        const filename = getFilename(ev.relative_path || ev.path);

                        return (
                          <div
                            key={ev.id}
                            className={`rounded-xl border border-slate-800/90 bg-[#111726]/70 hover:bg-[#111726] p-4 transition-all space-y-2.5 ${badgeInfo.cardBorder}`}
                          >
                            {/* Card Header */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Event Type Pill */}
                                <span
                                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1.5 ${badgeInfo.badgeStyle}`}
                                >
                                  <EventIcon className="w-3.5 h-3.5" />
                                  <span>{badgeInfo.label}</span>
                                </span>

                                {/* Directory Indicator */}
                                {ev.is_directory && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                    <Folder className="w-3 h-3" />
                                    <span>FOLDER</span>
                                  </span>
                                )}

                                {/* Watched Folder Origin Identity */}
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-800/90 text-slate-300 border border-slate-700/60 truncate max-w-[200px]"
                                  title={`Watch Root: ${ev.folder_path}`}
                                >
                                  📁 {getFilename(ev.folder_path) || 'Watched Root'}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* File Size (when available) */}
                                {ev.size_bytes !== undefined && ev.size_bytes !== null && (
                                  <span className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                                    {formatBytes(ev.size_bytes)}
                                  </span>
                                )}

                                {/* Exact Locale Timestamp */}
                                <div
                                  className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5"
                                  title={`Full timestamp: ${timeInfo.full}`}
                                >
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  <span>{timeInfo.time}</span>
                                </div>
                              </div>
                            </div>

                            {/* Card Body: Paths and Filenames */}
                            {ev.event_type === 'moved' ? (
                              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1.5">
                                <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                                  Path Transition (Rename / Move):
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                                  <div className="flex items-center gap-1.5 text-rose-300/90 truncate max-w-full">
                                    <span className="text-[10px] text-slate-500 uppercase font-sans">From:</span>
                                    <span className="truncate" title={ev.previous_path || undefined}>
                                      {ev.previous_relative_path || ev.previous_path || '(unknown)'}
                                    </span>
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-sky-400 shrink-0 mx-1" />
                                  <div className="flex items-center gap-1.5 text-emerald-300 font-semibold truncate max-w-full">
                                    <span className="text-[10px] text-slate-500 uppercase font-sans">To:</span>
                                    <span className="truncate" title={ev.path}>
                                      {ev.relative_path || ev.path}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="font-semibold text-white text-sm font-mono truncate" title={ev.path}>
                                  {filename}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 truncate">
                                  <span className="text-[10px] text-slate-500 uppercase font-sans">Relative:</span>
                                  <span className="text-slate-300 truncate" title={ev.path}>
                                    {ev.relative_path || ev.path}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Automation / Rule Suggestion Badge (if present) */}
                            {ev.suggestion && (
                              <div className="pt-1">
                                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
                                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                  <span>
                                    Action Plan: {ev.suggestion.rule_name || ev.suggestion.action || 'Auto-categorization plan generated'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Subtab 2: Folder Monitors Configuration */}
              {lazyDeskSubTab === 'monitors' && (
                <div className="space-y-6">
                  {/* Add Watch Card */}
                  <div className="rounded-xl border border-slate-800 bg-[#111726]/60 p-6 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        Configure Folder Monitoring
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

              {/* Confirmation Modal for Clearing In-Memory Activity Feed */}
              {confirmClearFeedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                  <div className="bg-[#111726] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center gap-3 text-rose-400">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-rose-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Clear Watcher Activity Feed?</h3>
                        <p className="text-[11px] text-slate-400">In-Memory Timeline Buffer</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      This will clear the current in-memory watcher event buffer (up to 1,000 events) for this session.
                    </p>
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-emerald-200">Security Guarantee:</strong>
                        <p className="text-emerald-400/80 mt-0.5">
                          Permanent SQLite audit logs, pending approvals, and historical task records are stored securely in the database and will <strong>not</strong> be deleted.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmClearFeedModal(false)}
                        disabled={isClearingFeed}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleClearWatcherFeed}
                        disabled={isClearingFeed}
                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition flex items-center gap-1.5 shadow disabled:opacity-50"
                      >
                        {isClearingFeed ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isClearingFeed ? 'Clearing...' : 'Clear Activity Feed'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
