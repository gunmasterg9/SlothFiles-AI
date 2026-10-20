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

export interface SystemSettings {
  app_name: string;
  app_version: string;
  environment: string;
  host: string;
  port: number;
  ollama_base_url: string;
  ollama_selected_model: string;
  ollama_available_models: string[];
  max_file_size_bytes: number;
  extraction_timeout_seconds: number;
  approved_roots: string[];
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
  success: boolean;
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
