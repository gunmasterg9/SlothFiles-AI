/**
 * SlothPilot AI API Client
 * Communicates with FastAPI backend on loopback interface
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  timestamp: string;
}

export interface ReadinessComponent {
  name: string;
  status: string;
  details: string | null;
}

export interface ReadinessResponse {
  status: string;
  timestamp: string;
  components: ReadinessComponent[];
}

export interface ApprovedRoot {
  id: string;
  path: string;
  label: string;
  is_active: number;
  created_at: string;
}

export interface SystemSettings {
  app_name: string;
  app_version: string;
  environment: string;
  host: string;
  port: number;
  ollama_base_url: string;
  ollama_selected_model: string;
  max_file_size_bytes: number;
  extraction_timeout_seconds: number;
  approved_roots: ApprovedRoot[];
}

export interface ModelsResponse {
  status: string;
  selected_model: string;
  models: string[];
  count: number;
  error?: string;
}

export interface ActionItem {
  id: string;
  plan_id: string;
  action_type: 'move' | 'rename' | 'tag' | 'duplicate_resolve';
  source_path: string;
  target_path: string;
  source_hash: string;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
  status: 'pending' | 'executed' | 'rejected' | 'undone';
  executed_at?: string | null;
}

export interface ActionPlan {
  id: string;
  title: string;
  description: string;
  module: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'undone';
  created_at: string;
  approved_at?: string | null;
  executed_at?: string | null;
  items: ActionItem[];
}

export interface ScanResult {
  folder: string;
  total_files: number;
  duplicates_found: number;
  actions_planned: number;
  plan: ActionPlan | null;
  message?: string;
}

export interface OrganizationRule {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
  priority: number;
  match_extensions: string;
  match_glob: string;
  match_regex: string;
  destination_template: string;
  action_type: string;
  created_at: string;
  updated_at: string;
}

export interface RuleCreate {
  name: string;
  description?: string;
  is_enabled?: boolean;
  priority?: number;
  match_extensions?: string;
  match_glob?: string;
  match_regex?: string;
  destination_template: string;
  action_type?: string;
}

export interface RuleUpdate {
  name?: string;
  description?: string;
  is_enabled?: boolean;
  priority?: number;
  match_extensions?: string;
  match_glob?: string;
  match_regex?: string;
  destination_template?: string;
  action_type?: string;
}

export interface RuleTestRequest {
  sample_filename: string;
  sample_category?: string;
  rule_id?: string;
  rule_data?: RuleCreate;
}

export interface RuleTestResponse {
  matched: boolean;
  rule_id?: string | null;
  rule_name?: string | null;
  priority?: number | null;
  reason: string;
  resolved_destination?: string | null;
  template_error?: string | null;
}

export interface TemplateVariableInfo {
  variable: string;
  description: string;
  example: string;
  date_source?: string;
}

export interface TemplatesResponse {
  variables: TemplateVariableInfo[];
  example_templates: string[];
}

export interface TemplatePreviewRequest {
  template: string;
  sample_filename?: string;
  category?: string;
}

export interface TemplatePreviewResponse {
  template: string;
  sample_filename: string;
  resolved_destination: string;
}

export interface FolderWatch {
  id: string;
  folder_path: string;
  is_paused: number;
  recursive: number;
  debounce_seconds: number;
  last_scan_at: string | null;
  created_at: string;
}

export interface WatcherEvent {
  id: string;
  watch_id: string;
  folder_path: string;
  event_type: 'created' | 'modified' | 'moved' | 'deleted';
  path: string;
  relative_path: string;
  previous_path?: string | null;
  previous_relative_path?: string | null;
  is_directory: boolean;
  timestamp: string;
  size_bytes?: number | null;
  suggestion?: any | null;
}

export interface WatcherEventsResponse {
  total: number;
  limit: number;
  offset: number;
  events: WatcherEvent[];
}

export interface TaskRecord {
  id: string;
  task_type: string;
  status: 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
}

export interface ActionObligation {
  description: string;
  assignee: string | null;
  urgency: string;
  source_quote: string;
}

export interface DateEvidence {
  date_text: string;
  normalized_date: string | null;
  is_ambiguous: boolean;
  context: string;
  source_quote: string;
}

export interface InboxItem {
  id: string;
  title: string;
  source_type: 'note' | 'email';
  file_path: string;
  file_hash: string;
  extracted_text: string;
  summary: string | null;
  draft_reply: string | null;
  action_items?: ActionObligation[];
  key_dates?: DateEvidence[];
  created_at: string;
  metadata: Record<string, any>;
}

export interface TradeSlothFinding {
  id?: string;
  field_name: string;
  status?: string;
  source_documents: string[];
  extracted_values: Record<string, string>;
  normalized_value?: string | null;
  difference?: string | null;
  tolerance?: string | null;
  severity: 'info' | 'low' | 'medium' | 'high';
  confidence: number;
  evidence_reference: string;
  recommended_action: string;
}

export interface ShipmentAudit {
  id: string;
  title: string;
  status: 'completed' | 'discrepancies_found' | 'clean';
  created_at: string;
  summary: {
    total_documents: number;
    documents: Array<{
      filename: string;
      path: string;
      document_type: string;
      extraction_status: string;
    }>;
    total_findings: number;
    discrepancies: number;
    verified: number;
    unreadable: number;
    missing: number;
    legal_disclaimer: string;
  };
  findings?: TradeSlothFinding[];
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  module: string;
  actor: string;
  details: string;
  target_hash: string | null;
  success: number;
}

export interface AuditLogResponse {
  total: number;
  limit: number;
  offset: number;
  items: AuditLogEntry[];
}

const API_BASE = '/api';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchReadiness(): Promise<ReadinessResponse> {
  const res = await fetch(`${API_BASE}/ready`);
  if (!res.ok) throw new Error(`Readiness check failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchSettings(): Promise<SystemSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`Fetch settings failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(`Fetch models failed: HTTP ${res.status}`);
  return res.json();
}

export async function selectModel(model: string): Promise<any> {
  const res = await fetch(`${API_BASE}/settings/model`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to update model.');
  }
  return res.json();
}

export async function addApprovedRoot(path: string, label: string): Promise<ApprovedRoot> {
  const res = await fetch(`${API_BASE}/settings/roots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, label })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to add approved root.');
  }
  return res.json();
}

export async function removeApprovedRoot(rootId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/settings/roots/${rootId}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to delete approved root.');
  }
  return res.json();
}

export async function fetchAuditLogs(
  module?: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditLogResponse> {
  const url = new URL(`${window.location.origin}${API_BASE}/audit`);
  if (module) url.searchParams.set('module', module);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Fetch audit logs failed: HTTP ${res.status}`);
  return res.json();
}

export async function scanFolder(folder_path: string, use_ai: boolean = true): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/organizer/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path, use_ai })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Scan failed.');
  }
  return res.json();
}

export async function fetchOrganizationRules(onlyEnabled: boolean = false): Promise<OrganizationRule[]> {
  const url = new URL(`${window.location.origin}${API_BASE}/organizer/rules`);
  if (onlyEnabled) url.searchParams.set('only_enabled', 'true');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Fetch organization rules failed: HTTP ${res.status}`);
  return res.json();
}

export async function createOrganizationRule(rule: RuleCreate): Promise<OrganizationRule> {
  const res = await fetch(`${API_BASE}/organizer/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || 'Failed to create organization rule');
  }
  return res.json();
}

export async function updateOrganizationRule(ruleId: string, rule: RuleUpdate): Promise<OrganizationRule> {
  const res = await fetch(`${API_BASE}/organizer/rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || 'Failed to update organization rule');
  }
  return res.json();
}

export async function deleteOrganizationRule(ruleId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/organizer/rules/${ruleId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`Delete rule failed: HTTP ${res.status}`);
  return res.json();
}

export async function toggleOrganizationRule(ruleId: string): Promise<OrganizationRule> {
  const res = await fetch(`${API_BASE}/organizer/rules/${ruleId}/toggle`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error(`Toggle rule failed: HTTP ${res.status}`);
  return res.json();
}

export async function testOrganizationRule(req: RuleTestRequest): Promise<RuleTestResponse> {
  const res = await fetch(`${API_BASE}/organizer/rules/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || 'Failed to test rule');
  }
  return res.json();
}

export async function fetchTemplateVariables(): Promise<TemplatesResponse> {
  const res = await fetch(`${API_BASE}/organizer/templates`);
  if (!res.ok) throw new Error(`Fetch templates failed: HTTP ${res.status}`);
  return res.json();
}

export async function previewTemplate(req: TemplatePreviewRequest): Promise<TemplatePreviewResponse> {
  const res = await fetch(`${API_BASE}/organizer/templates/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || 'Failed to preview template');
  }
  return res.json();
}

export async function fetchPendingApprovals(): Promise<ActionPlan[]> {
  const res = await fetch(`${API_BASE}/approvals/pending`);
  if (!res.ok) throw new Error(`Fetch pending approvals failed: HTTP ${res.status}`);
  return res.json();
}

export async function approvePlan(planId: string): Promise<ActionPlan> {
  const res = await fetch(`${API_BASE}/approvals/${planId}/approve`, {
    method: 'POST'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Approval failed.');
  }
  return res.json();
}

export async function rejectPlan(planId: string): Promise<ActionPlan> {
  const res = await fetch(`${API_BASE}/approvals/${planId}/reject`, {
    method: 'POST'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Rejection failed.');
  }
  return res.json();
}

export async function undoPlan(planId: string): Promise<ActionPlan> {
  const res = await fetch(`${API_BASE}/approvals/${planId}/undo`, {
    method: 'POST'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Undo failed.');
  }
  return res.json();
}

export async function fetchWatches(): Promise<FolderWatch[]> {
  const res = await fetch(`${API_BASE}/watcher/watches`);
  if (!res.ok) throw new Error(`Fetch folder watches failed: HTTP ${res.status}`);
  return res.json();
}

export async function addWatch(folder_path: string, recursive: boolean = false, debounce_seconds: number = 2.0): Promise<FolderWatch> {
  const res = await fetch(`${API_BASE}/watcher/watches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path, recursive, debounce_seconds })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to start folder watch.');
  }
  return res.json();
}

export async function pauseWatch(watchId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/watcher/watches/${watchId}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(`Pause failed: HTTP ${res.status}`);
  return res.json();
}

export async function resumeWatch(watchId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/watcher/watches/${watchId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(`Resume failed: HTTP ${res.status}`);
  return res.json();
}

export async function removeWatch(watchId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/watcher/watches/${watchId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Remove watch failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchWatcherEvents(
  watchId?: string,
  eventType?: string,
  limit: number = 50,
  offset: number = 0
): Promise<WatcherEventsResponse> {
  const url = new URL(`${window.location.origin}${API_BASE}/watcher/events`);
  if (watchId) url.searchParams.set('watch_id', watchId);
  if (eventType) url.searchParams.set('event_type', eventType);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Fetch watcher events failed: HTTP ${res.status}`);
  return res.json();
}

export async function clearWatcherEvents(): Promise<any> {
  const res = await fetch(`${API_BASE}/watcher/events/clear`, { method: 'POST' });
  if (!res.ok) throw new Error(`Clear watcher events failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchTasks(status?: string, limit: number = 50): Promise<TaskRecord[]> {
  const url = new URL(`${window.location.origin}${API_BASE}/tasks`);
  if (status) url.searchParams.set('status', status);
  url.searchParams.set('limit', limit.toString());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Fetch tasks failed: HTTP ${res.status}`);
  return res.json();
}

export async function cancelTask(taskId: string): Promise<TaskRecord> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cancel task failed: HTTP ${res.status}`);
  return res.json();
}

export async function importInboxFile(file_path: string, title?: string): Promise<InboxItem> {
  const res = await fetch(`${API_BASE}/inbox/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path, title })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to import inbox file.');
  }
  return res.json();
}

export async function fetchInboxItems(query?: string): Promise<InboxItem[]> {
  const url = new URL(`${window.location.origin}${API_BASE}/inbox/items`);
  if (query) url.searchParams.set('query', query);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Fetch inbox items failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchInboxItem(itemId: string): Promise<InboxItem> {
  const res = await fetch(`${API_BASE}/inbox/items/${itemId}`);
  if (!res.ok) throw new Error(`Fetch inbox item failed: HTTP ${res.status}`);
  return res.json();
}

export async function analyzeInboxItem(itemId: string, use_ai: boolean = true): Promise<InboxItem> {
  const res = await fetch(`${API_BASE}/inbox/items/${itemId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ use_ai })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to analyze inbox item.');
  }
  return res.json();
}

export async function runShipmentAudit(document_paths: string[], title?: string): Promise<ShipmentAudit> {
  const res = await fetch(`${API_BASE}/tradesloth/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_paths, title })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Shipment audit failed.');
  }
  return res.json();
}

export async function fetchShipmentAudits(): Promise<ShipmentAudit[]> {
  const res = await fetch(`${API_BASE}/tradesloth/audits`);
  if (!res.ok) throw new Error(`Fetch shipment audits failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchShipmentAudit(auditId: string): Promise<ShipmentAudit> {
  const res = await fetch(`${API_BASE}/tradesloth/audits/${auditId}`);
  if (!res.ok) throw new Error(`Fetch shipment audit failed: HTTP ${res.status}`);
  return res.json();
}

export async function exportAuditReport(auditId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/tradesloth/audits/${auditId}/report`);
  if (!res.ok) throw new Error(`Export report failed: HTTP ${res.status}`);
  return res.text();
}

export interface CopilotToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface CopilotTool {
  name: string;
  description: string;
  permission: 'READ_ONLY' | 'PROPOSE_PLAN';
  parameters: CopilotToolParam[];
}

export interface CopilotMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, any>;
    permission?: string;
  }> | null;
  tool_results?: Array<{
    name: string;
    result: any;
  }> | null;
  created_at: string;
}

export interface CopilotSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export async function fetchCopilotTools(): Promise<CopilotTool[]> {
  const res = await fetch(`${API_BASE}/copilot/tools`);
  if (!res.ok) throw new Error(`Fetch copilot tools failed: HTTP ${res.status}`);
  return res.json();
}

export async function createCopilotSession(title?: string): Promise<CopilotSession> {
  const res = await fetch(`${API_BASE}/copilot/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Failed to create session.');
  }
  return res.json();
}

export async function fetchCopilotSessions(): Promise<CopilotSession[]> {
  const res = await fetch(`${API_BASE}/copilot/sessions`);
  if (!res.ok) throw new Error(`Fetch copilot sessions failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchCopilotMessages(sessionId: string): Promise<CopilotMessage[]> {
  const res = await fetch(`${API_BASE}/copilot/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error(`Fetch copilot messages failed: HTTP ${res.status}`);
  return res.json();
}

export async function sendCopilotPrompt(sessionId: string, prompt: string): Promise<{ user_message: CopilotMessage; assistant_message: CopilotMessage }> {
  const res = await fetch(`${API_BASE}/copilot/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.detail || 'Chat prompt failed.');
  }
  return res.json();
}
