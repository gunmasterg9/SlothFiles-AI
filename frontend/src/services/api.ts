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

export interface TaskRecord {
  id: string;
  task_type: string;
  status: 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata?: Record<string, any>;
}

export interface ActionItem {
  id: string;
  action_type: 'move' | 'rename' | 'tag' | 'delete_duplicate';
  source_path: string;
  target_path: string;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
  status: 'pending' | 'executed' | 'rejected' | 'undone';
}

export interface ActionPlan {
  id: string;
  title: string;
  description: string;
  module: string;
  items: ActionItem[];
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
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
