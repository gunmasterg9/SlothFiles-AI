import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from backend.app.db.session import get_db

logger = logging.getLogger("slothpilot.migrations")

MIGRATIONS: list[tuple[int, str, str]] = [
    (
        1,
        "initial_schema",
        """
        -- Schema migrations tracking
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );

        -- Key-value settings table
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Approved directory roots for restricted filesystem operations
        CREATE TABLE IF NOT EXISTS approved_roots (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        -- Append-only audit logs table
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            action TEXT NOT NULL,
            module TEXT NOT NULL,
            actor TEXT NOT NULL,
            details TEXT NOT NULL,
            target_hash TEXT,
            success INTEGER NOT NULL DEFAULT 1
        );

        -- Index for timestamp and module lookups
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);

        -- Enforce append-only integrity via SQLite triggers
        CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_update
        BEFORE UPDATE ON audit_logs
        BEGIN
            SELECT RAISE(FAIL, 'Audit log entries are immutable and cannot be updated.');
        END;

        CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_delete
        BEFORE DELETE ON audit_logs
        BEGIN
            SELECT RAISE(FAIL, 'Audit log entries are immutable and cannot be deleted.');
        END;

        -- Task lifecycle management
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            status TEXT NOT NULL, -- queued, running, awaiting_approval, succeeded, failed, cancelled
            progress REAL NOT NULL DEFAULT 0.0,
            message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

        -- Task events / timeline
        CREATE TABLE IF NOT EXISTS task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            details TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        -- Consequential action plans requiring user approval
        CREATE TABLE IF NOT EXISTS action_plans (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            module TEXT NOT NULL,
            status TEXT NOT NULL, -- pending, approved, rejected, completed, cancelled
            created_at TEXT NOT NULL,
            approved_at TEXT,
            executed_at TEXT,
            revalidation_hash TEXT
        );

        -- Action items inside plans
        CREATE TABLE IF NOT EXISTS action_items (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL,
            action_type TEXT NOT NULL, -- move, rename, tag, duplicate_resolve
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            risk_level TEXT NOT NULL, -- low, medium, high
            reason TEXT NOT NULL,
            status TEXT NOT NULL, -- pending, executed, rejected, undone
            executed_at TEXT,
            undo_data_json TEXT,
            FOREIGN KEY (plan_id) REFERENCES action_plans(id) ON DELETE CASCADE
        );

        -- LazyDesk folder watches
        CREATE TABLE IF NOT EXISTS folder_watches (
            id TEXT PRIMARY KEY,
            folder_path TEXT NOT NULL UNIQUE,
            is_paused INTEGER NOT NULL DEFAULT 0,
            recursive INTEGER NOT NULL DEFAULT 0,
            debounce_seconds REAL NOT NULL DEFAULT 2.0,
            last_scan_at TEXT,
            created_at TEXT NOT NULL
        );

        -- Inbox & Notes items
        CREATE TABLE IF NOT EXISTS inbox_items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL, -- note, email, txt, markdown
            file_path TEXT,
            file_hash TEXT,
            extracted_text TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        -- Inbox item analysis summaries and drafts
        CREATE TABLE IF NOT EXISTS inbox_summaries (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL UNIQUE,
            summary TEXT NOT NULL,
            action_items_json TEXT NOT NULL DEFAULT '[]',
            key_dates_json TEXT NOT NULL DEFAULT '[]',
            draft_reply TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES inbox_items(id) ON DELETE CASCADE
        );

        -- TradeSloth shipment audits
        CREATE TABLE IF NOT EXISTS shipment_audits (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL, -- completed, discrepancies_found, clean
            created_at TEXT NOT NULL,
            summary_json TEXT NOT NULL DEFAULT '{}'
        );

        -- TradeSloth discrepancies and verified findings
        CREATE TABLE IF NOT EXISTS shipment_findings (
            id TEXT PRIMARY KEY,
            audit_id TEXT NOT NULL,
            field_name TEXT NOT NULL,
            source_documents_json TEXT NOT NULL,
            extracted_values_json TEXT NOT NULL,
            normalized_value TEXT,
            difference TEXT,
            tolerance TEXT,
            severity TEXT NOT NULL, -- info, low, medium, high
            confidence REAL NOT NULL DEFAULT 1.0,
            evidence_reference TEXT NOT NULL,
            recommended_action TEXT NOT NULL,
            FOREIGN KEY (audit_id) REFERENCES shipment_audits(id) ON DELETE CASCADE
        );

        -- Local AI Copilot sessions & messages
        CREATE TABLE IF NOT EXISTS copilot_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS copilot_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL, -- user, assistant, system
            content TEXT NOT NULL,
            tool_calls_json TEXT,
            tool_results_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE
        );
        """
    ),
    (
        2,
        "organization_rules_and_templates",
        """
        -- User-configurable organization rules
        CREATE TABLE IF NOT EXISTS organization_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            is_enabled INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 100,
            match_extensions TEXT NOT NULL DEFAULT '',
            match_glob TEXT NOT NULL DEFAULT '',
            match_regex TEXT NOT NULL DEFAULT '',
            destination_template TEXT NOT NULL,
            action_type TEXT NOT NULL DEFAULT 'move',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_rules_priority ON organization_rules(priority ASC, created_at ASC);
        CREATE INDEX IF NOT EXISTS idx_rules_enabled ON organization_rules(is_enabled);

        -- Initial seed organization rules for deterministic categorization
        INSERT OR IGNORE INTO organization_rules (
            id, name, description, is_enabled, priority,
            match_extensions, match_glob, match_regex,
            destination_template, action_type, created_at, updated_at
        ) VALUES
        (
            'rule-invoices-default',
            'Invoices & Receipts',
            'Sorts receipts, billing statements, and invoices into date-stamped folders.',
            1,
            10,
            '.pdf,.png,.jpg,.jpeg,.txt',
            '*invoice*',
            '',
            'Invoices & Receipts/{year}/{month}/{stem}.{extension}',
            'move',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z'
        ),
        (
            'rule-contracts-default',
            'Contracts & Legal',
            'Routes agreements, NDAs, and legal filings into legal folders.',
            1,
            20,
            '.pdf,.docx,.txt',
            '*contract*',
            '',
            'Contracts & Legal/{year}/{stem}.{extension}',
            'move',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z'
        ),
        (
            'rule-code-default',
            'Code & Data Assets',
            'Organizes scripts, database exports, and source code by extension.',
            1,
            30,
            '.py,.ts,.js,.json,.sql,.csv,.yaml,.yml',
            '',
            '',
            'Code & Data/{extension}/{stem}.{extension}',
            'move',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z'
        ),
        (
            'rule-media-default',
            'Media & Assets',
            'Organizes images, vector graphics, and audio recordings.',
            1,
            40,
            '.png,.jpg,.jpeg,.svg,.mp4,.mp3,.wav',
            '',
            '',
            'Media & Assets/{year}/{month}/{stem}.{extension}',
            'move',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z'
        ),
        (
            'rule-archives-default',
            'Compressed Archives',
            'Organizes zip and compressed archives by year.',
            1,
            50,
            '.zip,.tar,.gz,.7z,.rar',
            '',
            '',
            'Archives/{year}/{stem}.{extension}',
            'move',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z'
        );
        """
    )
]


def run_migrations(db_path: Path | None = None) -> int:
    """Execute all pending non-destructive schema migrations."""
    with get_db(db_path) as conn:
        # Create migration tracking table if not exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
        """)

        applied_versions = {
            row["version"]
            for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
        }

        applied_count = 0
        for version, name, sql in MIGRATIONS:
            if version not in applied_versions:
                logger.info("Applying migration %03d: %s", version, name)
                conn.executescript(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                    (version, name, datetime.now(timezone.utc).isoformat())
                )
                applied_count += 1

        logger.info("Database schema is up to date (%d migrations applied).", applied_count)
        return applied_count
