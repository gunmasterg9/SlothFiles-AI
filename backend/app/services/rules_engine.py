"""
SlothFiles AI: Organization Rules and Destination Templates Engine
Provides validated, user-configurable organization rules, reusable destination
templates with safe variable substitution, and deterministic first-match evaluation.
"""

from datetime import datetime, timezone
import fnmatch
import logging
import os
from pathlib import Path
import re
from typing import Any, Optional
import uuid

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service
from backend.app.services.path_service import path_service

logger = logging.getLogger("slothpilot.rules")

ALLOWED_TEMPLATE_VARS = {"year", "month", "day", "stem", "extension", "category"}
SUPPORTED_ACTION_TYPES = {"move"}

# Disallowed characters in Windows path components
ILLEGAL_PATH_CHARS_PATTERN = re.compile(r'[<>:"|?*\x00-\x1f]')


class RuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable rule name")
    description: str = Field(default="", max_length=500, description="Optional rule description")
    is_enabled: bool = Field(default=True, description="Whether rule is active for organization")
    priority: int = Field(default=100, ge=1, le=10000, description="Evaluation priority (lower numbers evaluated first)")
    match_extensions: str = Field(default="", description="Comma-separated extensions to match (e.g. '.pdf,.docx')")
    match_glob: str = Field(default="", max_length=100, description="Filename glob pattern (e.g. '*invoice*')")
    match_regex: str = Field(default="", max_length=200, description="Optional regular expression pattern")
    destination_template: str = Field(..., min_length=1, max_length=250, description="Destination path template")
    action_type: str = Field(default="move", description="Action to perform (move)")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Rule name cannot be empty.")
        return clean

    @field_validator("action_type")
    @classmethod
    def validate_action(cls, v: str) -> str:
        act = v.strip().lower()
        if act not in SUPPORTED_ACTION_TYPES:
            raise ValueError(f"Action type '{v}' is not supported. Supported actions: {', '.join(SUPPORTED_ACTION_TYPES)}")
        return act

    @field_validator("match_regex")
    @classmethod
    def validate_regex(cls, v: str) -> str:
        pattern = v.strip()
        if pattern:
            try:
                re.compile(pattern)
            except re.error as exc:
                err_msg = str(exc)
                if "global flags not at the start" in err_msg:
                    raise ValueError(
                        f"Invalid regular expression: {err_msg}. "
                        "In modern Python, global inline flags such as '(?i)' must appear at the very beginning of the expression "
                        "(e.g. '(?i)^(inv|rec)-' instead of '^(?i)(inv|rec)-')."
                    )
                raise ValueError(f"Invalid regular expression: {exc}")
        return pattern

    @field_validator("destination_template")
    @classmethod
    def validate_template(cls, v: str) -> str:
        template = v.strip()
        if not template:
            raise ValueError("Destination template cannot be empty.")

        # Check for path traversal tokens
        normalized = template.replace("\\", "/")
        if "/../" in normalized or normalized.startswith("../") or normalized.endswith("/..") or normalized == "..":
            raise ValueError("Path traversal sequence '..' is strictly prohibited in destination templates.")

        # Check for absolute path indicators or drive letters
        if normalized.startswith("/") or (len(template) > 1 and template[1] == ":"):
            raise ValueError("Destination templates must be relative paths without drive letters or root slashes.")

        # Validate variables enclosed in {...}
        vars_found = re.findall(r"\{([^{}]+)\}", template)
        if not vars_found:
            # Plain folder name is acceptable (e.g. "Invoices/Receipts")
            pass
        else:
            for var_name in vars_found:
                clean_var = var_name.strip()
                if clean_var not in ALLOWED_TEMPLATE_VARS:
                    raise ValueError(
                        f"Unknown template variable '{{{var_name}}}'. Allowed variables: "
                        + ", ".join(f"{{{v}}}" for v in sorted(ALLOWED_TEMPLATE_VARS))
                    )

        # Check for illegal filesystem characters outside template curly braces
        template_without_vars = re.sub(r"\{[^{}]+\}", "placeholder", template)
        # Strip directory separators before checking illegal characters
        test_chars = template_without_vars.replace("/", "").replace("\\", "")
        if ILLEGAL_PATH_CHARS_PATTERN.search(test_chars):
            raise ValueError("Destination template contains illegal filesystem characters (<>:\"|?*).")

        return template


class RuleCreate(RuleBase):
    pass


class RuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    is_enabled: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=1, le=10000)
    match_extensions: Optional[str] = None
    match_glob: Optional[str] = None
    match_regex: Optional[str] = None
    destination_template: Optional[str] = None
    action_type: Optional[str] = None

    @field_validator("match_regex")
    @classmethod
    def validate_regex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return RuleBase.validate_regex(v)
        return v

    @field_validator("destination_template")
    @classmethod
    def validate_template(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return RuleBase.validate_template(v)
        return v


class OrganizationRule(RuleBase):
    id: str
    created_at: str
    updated_at: str


class RuleTestRequest(BaseModel):
    sample_filename: str = Field(..., min_length=1, description="Sample filename to test (e.g. 'invoice_2026_q3.pdf')")
    sample_category: Optional[str] = Field(default="Invoices & Receipts", description="Optional category for {category} variable")
    rule_id: Optional[str] = Field(default=None, description="Optional rule ID to test against. If omitted, tests all enabled rules.")
    rule_data: Optional[RuleCreate] = Field(default=None, description="Optional inline rule data to test without saving")


class TemplatePreviewRequest(BaseModel):
    template: str = Field(..., description="Destination template to preview")
    sample_filename: str = Field(default="report_october.pdf", description="Sample filename")
    category: str = Field(default="Reports & Notes", description="Sample category name")


class RulesEngineService:
    """Manages organization rules CRUD, template resolution, and deterministic evaluation."""

    @staticmethod
    def get_date_components(file_path: Optional[Path] = None, date_override: Optional[datetime] = None) -> tuple[str, str, str]:
        """
        Derive year, month, and day components from an explicit, documented date source.
        
        Date Source Semantics:
        - Primary source: `st_mtime` (last modified time of the file in UTC).
          Rationale: `st_mtime` represents when the file content was actually saved/created,
          and is preserved accurately across filesystems and download operations, unlike
          Windows `st_ctime` which is reset on copy/download.
        - Fallback: Current UTC timestamp if `file_path` is missing or inaccessible.
        """
        if date_override:
            dt = date_override.astimezone(timezone.utc) if date_override.tzinfo else date_override.replace(tzinfo=timezone.utc)
        elif file_path and file_path.exists():
            try:
                mtime = file_path.stat().st_mtime
                dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
            except Exception:
                dt = datetime.now(timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        return (
            dt.strftime("%Y"),
            dt.strftime("%m"),
            dt.strftime("%d")
        )

    @classmethod
    def resolve_template(
        cls,
        template: str,
        filename: str,
        category: str = "Miscellaneous",
        file_path: Optional[Path] = None,
        date_override: Optional[datetime] = None
    ) -> str:
        """
        Safely substitute variables in a destination template.
        Variables supported:
        - {year}: 4-digit UTC year (e.g. '2026')
        - {month}: 2-digit UTC month (e.g. '10')
        - {day}: 2-digit UTC day (e.g. '20')
        - {stem}: Filename stem without extension (e.g. 'invoice_october')
        - {extension}: Lowercase extension without leading dot (e.g. 'pdf')
        - {category}: Resolved category name
        """
        # Validate template syntax first
        RuleBase.validate_template(template)

        year_str, month_str, day_str = cls.get_date_components(file_path, date_override)
        p = Path(filename)
        stem_raw = p.stem or "unnamed"
        ext_raw = p.suffix.lstrip(".").lower() or "bin"

        # Sanitize components against path traversal and illegal characters
        sanitized_stem = ILLEGAL_PATH_CHARS_PATTERN.sub("_", stem_raw).replace("/", "_").replace("\\", "_").strip()
        sanitized_cat = ILLEGAL_PATH_CHARS_PATTERN.sub("_", category).replace("/", "_").replace("\\", "_").strip()
        sanitized_ext = ILLEGAL_PATH_CHARS_PATTERN.sub("", ext_raw).replace("/", "").replace("\\", "").strip()

        vars_map = {
            "year": year_str,
            "month": month_str,
            "day": day_str,
            "stem": sanitized_stem or "file",
            "extension": sanitized_ext or "bin",
            "category": sanitized_cat or "Miscellaneous"
        }

        resolved = template
        for k, v in vars_map.items():
            resolved = resolved.replace(f"{{{k}}}", v)

        # Normalize slashes and clean duplicate separators
        parts = [part.strip() for part in resolved.replace("\\", "/").split("/") if part.strip()]
        # Verify no segment resolved to '..'
        for seg in parts:
            if seg == "..":
                raise ValueError("Template resolution produced an illegal path traversal segment ('..').")

        return "/".join(parts)

    @classmethod
    def matches_rule(cls, rule: dict | OrganizationRule, filename: str) -> tuple[bool, str]:
        """
        Evaluate if a filename matches an organization rule based on:
        1. match_extensions (case-insensitive extension filter)
        2. match_glob (case-insensitive filename pattern)
        3. match_regex (case-sensitive or insensitive regex pattern)
        
        Returns (is_match, reason).
        """
        rule_dict = rule.dict() if isinstance(rule, OrganizationRule) else rule

        name_lower = filename.lower()
        ext = Path(filename).suffix.lower()

        matched_conditions = []

        # 1. Extension match condition
        ext_field = (rule_dict.get("match_extensions") or "").strip()
        if ext_field:
            # Parse comma or whitespace separated extensions
            raw_exts = [e.strip().lower() for e in re.split(r"[,;\s]+", ext_field) if e.strip()]
            normalized_exts = {e if e.startswith(".") else f".{e}" for e in raw_exts}
            if ext not in normalized_exts:
                return False, f"Extension '{ext}' does not match rule extensions ({', '.join(sorted(normalized_exts))})"
            matched_conditions.append(f"extension '{ext}'")

        # 2. Glob match condition
        glob_pattern = (rule_dict.get("match_glob") or "").strip()
        if glob_pattern:
            if not fnmatch.fnmatch(name_lower, glob_pattern.lower()):
                return False, f"Filename does not match glob pattern '{glob_pattern}'"
            matched_conditions.append(f"glob '{glob_pattern}'")

        # 3. Regex match condition
        regex_pattern = (rule_dict.get("match_regex") or "").strip()
        if regex_pattern:
            try:
                rx = re.compile(regex_pattern)
                if not rx.search(filename):
                    return False, f"Filename does not match regex '{regex_pattern}'"
                matched_conditions.append(f"regex '{regex_pattern}'")
            except re.error as exc:
                return False, f"Rule has invalid regex: {exc}"

        # If rule had no conditions specified, it matches all files
        if not matched_conditions:
            return True, "Default match (no specific filter conditions defined)"

        return True, "Matched " + " and ".join(matched_conditions)

    @classmethod
    def evaluate_file(
        cls,
        file_path: Path,
        folder_root: Path
    ) -> Optional[dict]:
        """
        Evaluate a candidate file against all enabled rules in strict priority order.
        Returns proposed item metadata if a rule matches and destination is valid.
        """
        # Ensure file exists and is within approved bounds
        canonical_src = path_service.validate_path(file_path)
        canonical_root = path_service.validate_path(folder_root)

        rules = cls.list_rules(only_enabled=True)

        for rule in rules:
            matched, reason = cls.matches_rule(rule, canonical_src.name)
            if not matched:
                continue

            # Rule matched! Resolve destination template
            try:
                rel_dest = cls.resolve_template(
                    template=rule["destination_template"],
                    filename=canonical_src.name,
                    category=rule["name"],
                    file_path=canonical_src
                )
            except Exception as exc:
                logger.warning("Failed resolving template for rule %s: %s", rule["name"], exc)
                continue

            target_path = canonical_root / rel_dest

            # Validate target path remains inside approved roots
            try:
                path_service.validate_path(target_path.parent, allow_missing=True)
            except Exception as exc:
                logger.warning("Rule '%s' target path '%s' violated path security: %s", rule["name"], target_path, exc)
                continue

            # Detect self-move
            if target_path.resolve() == canonical_src.resolve():
                logger.debug("File %s already at destination %s. Skipping.", canonical_src.name, target_path)
                return None

            return {
                "rule_id": rule["id"],
                "rule_name": rule["name"],
                "action_type": rule.get("action_type", "move"),
                "source_path": str(canonical_src.resolve()),
                "target_path": str(target_path.resolve()),
                "relative_target": rel_dest,
                "reason": f"Matched Rule '{rule['name']}' ({reason})",
                "priority": rule["priority"]
            }

        return None

    @classmethod
    def _format_rule_row(cls, row: Any) -> dict:
        d = dict(row)
        d["is_enabled"] = bool(d.get("is_enabled", 1))
        return d

    @classmethod
    def list_rules(cls, only_enabled: bool = False) -> list[dict]:
        """Fetch rules ordered by priority ASC, created_at ASC, id ASC for stable deterministic tie-breaking."""
        query = "SELECT * FROM organization_rules"
        params = []
        if only_enabled:
            query += " WHERE is_enabled = 1"
        query += " ORDER BY priority ASC, created_at ASC, id ASC"

        with get_db() as conn:
            rows = conn.execute(query, params).fetchall()
        return [cls._format_rule_row(r) for r in rows]

    @classmethod
    def get_rule(cls, rule_id: str) -> dict:
        """Fetch a single rule by ID."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM organization_rules WHERE id = ?",
                (rule_id,)
            ).fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Organization rule not found: {rule_id}"
                )
        return cls._format_rule_row(row)

    @classmethod
    def create_rule(cls, data: RuleCreate) -> dict:
        """Create a new user-configured organization rule."""
        rule_id = f"rule-{uuid.uuid4().hex[:12]}"
        now_utc = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO organization_rules (
                    id, name, description, is_enabled, priority,
                    match_extensions, match_glob, match_regex,
                    destination_template, action_type, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rule_id,
                    data.name,
                    data.description or "",
                    1 if data.is_enabled else 0,
                    data.priority,
                    data.match_extensions.strip() if data.match_extensions else "",
                    data.match_glob.strip() if data.match_glob else "",
                    data.match_regex.strip() if data.match_regex else "",
                    data.destination_template.strip(),
                    data.action_type,
                    now_utc,
                    now_utc
                )
            )

        audit_service.log(
            action="RULE_CREATED",
            module="organizer",
            actor="user",
            details=f"Created rule '{data.name}' (priority {data.priority})",
            success=True
        )

        return cls.get_rule(rule_id)

    @classmethod
    def update_rule(cls, rule_id: str, data: RuleUpdate) -> dict:
        """Update an existing organization rule."""
        existing = cls.get_rule(rule_id)
        now_utc = datetime.now(timezone.utc).isoformat()

        name = data.name if data.name is not None else existing["name"]
        description = data.description if data.description is not None else existing["description"]
        is_enabled = data.is_enabled if data.is_enabled is not None else bool(existing["is_enabled"])
        priority = data.priority if data.priority is not None else existing["priority"]
        match_extensions = data.match_extensions if data.match_extensions is not None else existing["match_extensions"]
        match_glob = data.match_glob if data.match_glob is not None else existing["match_glob"]
        match_regex = data.match_regex if data.match_regex is not None else existing["match_regex"]
        destination_template = data.destination_template if data.destination_template is not None else existing["destination_template"]
        action_type = data.action_type if data.action_type is not None else existing["action_type"]

        with get_db() as conn:
            conn.execute(
                """
                UPDATE organization_rules SET
                    name = ?,
                    description = ?,
                    is_enabled = ?,
                    priority = ?,
                    match_extensions = ?,
                    match_glob = ?,
                    match_regex = ?,
                    destination_template = ?,
                    action_type = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    name.strip(),
                    description.strip() if description else "",
                    1 if is_enabled else 0,
                    priority,
                    match_extensions.strip() if match_extensions else "",
                    match_glob.strip() if match_glob else "",
                    match_regex.strip() if match_regex else "",
                    destination_template.strip(),
                    action_type,
                    now_utc,
                    rule_id
                )
            )

        audit_service.log(
            action="RULE_UPDATED",
            module="organizer",
            actor="user",
            details=f"Updated rule '{name}' (id={rule_id})",
            success=True
        )

        return cls.get_rule(rule_id)

    @classmethod
    def delete_rule(cls, rule_id: str) -> dict:
        """Delete an organization rule."""
        existing = cls.get_rule(rule_id)
        with get_db() as conn:
            conn.execute("DELETE FROM organization_rules WHERE id = ?", (rule_id,))

        audit_service.log(
            action="RULE_DELETED",
            module="organizer",
            actor="user",
            details=f"Deleted rule '{existing['name']}' (id={rule_id})",
            success=True
        )
        return {"status": "ok", "deleted_id": rule_id}

    @classmethod
    def toggle_rule(cls, rule_id: str) -> dict:
        """Toggle a rule's enabled/disabled state."""
        existing = cls.get_rule(rule_id)
        new_state = 0 if existing["is_enabled"] else 1
        now_utc = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                "UPDATE organization_rules SET is_enabled = ?, updated_at = ? WHERE id = ?",
                (new_state, now_utc, rule_id)
            )

        audit_service.log(
            action="RULE_TOGGLED",
            module="organizer",
            actor="user",
            details=f"Toggled rule '{existing['name']}' -> {'ENABLED' if new_state else 'DISABLED'}",
            success=True
        )
        return cls.get_rule(rule_id)

    @classmethod
    def test_rule(cls, req: RuleTestRequest) -> dict:
        """
        Test matching and template resolution against sample filename.
        Can test a specific rule by ID, inline rule data, or all active rules in priority order.
        """
        sample_name = req.sample_filename.strip()
        if not sample_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sample_filename cannot be empty.")

        # If testing an inline rule
        if req.rule_data:
            rule_dict = req.rule_data.dict()
            rule_dict["id"] = "inline-test"
            matched, reason = cls.matches_rule(rule_dict, sample_name)
            resolved_dest = None
            if matched:
                try:
                    resolved_dest = cls.resolve_template(
                        template=rule_dict["destination_template"],
                        filename=sample_name,
                        category=req.sample_category or rule_dict["name"]
                    )
                except Exception as exc:
                    return {
                        "matched": True,
                        "rule_id": "inline-test",
                        "rule_name": rule_dict["name"],
                        "reason": reason,
                        "template_error": str(exc),
                        "resolved_destination": None
                    }

            return {
                "matched": matched,
                "rule_id": "inline-test",
                "rule_name": rule_dict["name"],
                "reason": reason,
                "resolved_destination": resolved_dest
            }

        # If testing a single specific rule by ID
        if req.rule_id:
            rule = cls.get_rule(req.rule_id)
            matched, reason = cls.matches_rule(rule, sample_name)
            resolved_dest = None
            if matched:
                try:
                    resolved_dest = cls.resolve_template(
                        template=rule["destination_template"],
                        filename=sample_name,
                        category=req.sample_category or rule["name"]
                    )
                except Exception as exc:
                    return {
                        "matched": True,
                        "rule_id": rule["id"],
                        "rule_name": rule["name"],
                        "priority": rule["priority"],
                        "reason": reason,
                        "template_error": str(exc),
                        "resolved_destination": None
                    }

            return {
                "matched": matched,
                "rule_id": rule["id"],
                "rule_name": rule["name"],
                "priority": rule["priority"],
                "reason": reason,
                "resolved_destination": resolved_dest
            }

        # Otherwise: test against all enabled rules in priority order (first match wins)
        rules = cls.list_rules(only_enabled=True)
        for rule in rules:
            matched, reason = cls.matches_rule(rule, sample_name)
            if matched:
                resolved_dest = cls.resolve_template(
                    template=rule["destination_template"],
                    filename=sample_name,
                    category=req.sample_category or rule["name"]
                )
                return {
                    "matched": True,
                    "rule_id": rule["id"],
                    "rule_name": rule["name"],
                    "priority": rule["priority"],
                    "reason": reason,
                    "resolved_destination": resolved_dest
                }

        return {
            "matched": False,
            "rule_id": None,
            "rule_name": None,
            "reason": "No enabled rule matched the sample filename criteria. Local AI or default categorization would apply.",
            "resolved_destination": None
        }

    @classmethod
    def get_template_variables_info(cls) -> list[dict]:
        """Return reference list of supported template variables with explicit semantics."""
        return [
            {
                "variable": "{year}",
                "description": "4-digit UTC year (e.g. '2026') derived from the file modification timestamp (st_mtime).",
                "example": "2026"
            },
            {
                "variable": "{month}",
                "description": "2-digit UTC month (01-12) derived from the file modification timestamp (st_mtime).",
                "example": "10"
            },
            {
                "variable": "{day}",
                "description": "2-digit UTC day (01-31) derived from the file modification timestamp (st_mtime).",
                "example": "20"
            },
            {
                "variable": "{stem}",
                "description": "Filename without extension, sanitized against illegal filesystem characters.",
                "example": "invoice_1001"
            },
            {
                "variable": "{extension}",
                "description": "File extension in lowercase without leading dot.",
                "example": "pdf"
            },
            {
                "variable": "{category}",
                "description": "Matched rule category or AI-classified category.",
                "example": "Invoices & Receipts"
            }
        ]


rules_engine_service = RulesEngineService()
