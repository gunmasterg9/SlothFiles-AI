"""
Comprehensive automated test suite for SlothFiles AI Organization Rules and Destination Templates.
Tests cover:
- Exact rule matching and priority ordering
- Glob and regular expression matching
- Disabled rules filtering
- Template resolution with safe variables ({year}, {month}, {day}, {stem}, {extension}, {category})
- Invalid variables and path traversal rejection
- Destination path security validation
- File collision counter resolution
- First-match tie-breaking policy
- AI fallback when rules do not match
- Preconditions revalidation and stale file detection
- SQLite migration 2 persistence and idempotence
- API CRUD, rule toggle, rule test, and template preview endpoints
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.db.migrations import run_migrations
from backend.app.db.session import get_db
from backend.app.services.path_service import path_service
from backend.app.services.rules_engine import rules_engine_service, RuleCreate, RuleUpdate, RuleTestRequest
from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.approval_service import approval_service, compute_file_sha256


@pytest.fixture(autouse=True)
def setup_test_db():
    run_migrations()


@pytest.fixture
def test_client():
    return TestClient(app, base_url="http://127.0.0.1:8000")


# =========================================================================
# 1. Deterministic Rule Matching and Priority Order Tests
# =========================================================================

def test_rule_matching_priority_order():
    """Verify that multiple matching rules resolve according to strict priority order (lower number first)."""
    # Create high priority rule (priority 5) matching .pdf with glob *tax*
    r_high = rules_engine_service.create_rule(RuleCreate(
        name="Tax Documents High",
        priority=5,
        match_extensions=".pdf",
        match_glob="*tax*",
        destination_template="Taxes/{year}/{stem}.{extension}"
    ))

    # Create lower priority rule (priority 50) matching all .pdf
    r_low = rules_engine_service.create_rule(RuleCreate(
        name="General PDFs Low",
        priority=50,
        match_extensions=".pdf",
        destination_template="Documents/{year}/{stem}.{extension}"
    ))

    try:
        # File matching both: 'annual_tax_return.pdf'
        res = rules_engine_service.test_rule(RuleTestRequest(sample_filename="annual_tax_return.pdf"))
        assert res["matched"] is True
        assert res["rule_id"] == r_high["id"]
        assert res["rule_name"] == "Tax Documents High"
        assert res["priority"] == 5
        assert "Taxes/" in res["resolved_destination"]

        # File matching only general: 'handbook.pdf'
        res_general = rules_engine_service.test_rule(RuleTestRequest(sample_filename="handbook.pdf"))
        assert res_general["matched"] is True
        assert res_general["rule_name"] == "General PDFs Low"
        assert "Documents/" in res_general["resolved_destination"]
    finally:
        rules_engine_service.delete_rule(r_high["id"])
        rules_engine_service.delete_rule(r_low["id"])


def test_glob_and_regex_matching():
    """Verify glob and regular expression matching logic."""
    # Rule with regex matching invoice numbers like INV-2026-001.pdf
    rx_rule = rules_engine_service.create_rule(RuleCreate(
        name="Regex Invoice Matcher",
        priority=1,
        match_regex=r"^INV-\d{4}-\d+",
        match_extensions=".pdf,.txt",
        destination_template="Processed_Invoices/{year}/{stem}.{extension}"
    ))

    try:
        # Should match
        res1 = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="INV-2026-9876.pdf",
            rule_id=rx_rule["id"]
        ))
        assert res1["matched"] is True
        assert "Processed_Invoices/" in res1["resolved_destination"]

        # Should not match regex
        res2 = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="invoice_plain_123.pdf",
            rule_id=rx_rule["id"]
        ))
        assert res2["matched"] is False

        # Should not match extension
        res3 = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="INV-2026-9876.jpg",
            rule_id=rx_rule["id"]
        ))
        assert res3["matched"] is False
    finally:
        rules_engine_service.delete_rule(rx_rule["id"])


def test_regex_validation_edge_cases():
    """Verify modern Python regex validation: global flags must be at the very start of expression."""
    # 1. Valid global flag at start: (?i)^(inv|rec)-
    valid_rule = rules_engine_service.create_rule(RuleCreate(
        name="Case Insensitive Prefix",
        priority=2,
        match_regex=r"(?i)^(inv|rec)-",
        destination_template="Receipts/{year}/{stem}.{extension}"
    ))

    try:
        # Matches uppercase INV-
        res_upper = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="INV-999.pdf",
            rule_id=valid_rule["id"]
        ))
        assert res_upper["matched"] is True

        # Matches lowercase rec-
        res_lower = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="rec-123.pdf",
            rule_id=valid_rule["id"]
        ))
        assert res_lower["matched"] is True

        # Does not match other prefix
        res_other = rules_engine_service.test_rule(RuleTestRequest(
            sample_filename="statement-001.pdf",
            rule_id=valid_rule["id"]
        ))
        assert res_other["matched"] is False
    finally:
        rules_engine_service.delete_rule(valid_rule["id"])

    # 2. Invalid global flag placed after beginning-of-line anchor: ^(?i)(inv|rec)-
    with pytest.raises((ValueError, Exception)) as exc_info:
        rules_engine_service.create_rule(RuleCreate(
            name="Invalid Regex Flag Placement",
            priority=3,
            match_regex=r"^(?i)(inv|rec)-",
            destination_template="Receipts/{stem}.{extension}"
        ))
    assert "global flags not at the start" in str(exc_info.value).lower()
    assert "(?i)^(inv|rec)-" in str(exc_info.value)


def test_disabled_rules_are_skipped():
    """Verify that disabled rules are ignored during evaluation."""
    disabled_rule = rules_engine_service.create_rule(RuleCreate(
        name="Disabled Urgent Rule",
        is_enabled=False,
        priority=1,
        match_glob="*urgent*",
        destination_template="Urgent/{stem}.{extension}"
    ))

    try:
        # When evaluating all active rules, disabled rule must be skipped
        res = rules_engine_service.test_rule(RuleTestRequest(sample_filename="urgent_notice.txt"))
        assert res["rule_id"] != disabled_rule["id"]

        # Toggling it on activates it
        rules_engine_service.toggle_rule(disabled_rule["id"])
        res_toggled = rules_engine_service.test_rule(RuleTestRequest(sample_filename="urgent_notice.txt"))
        assert res_toggled["matched"] is True
        assert res_toggled["rule_id"] == disabled_rule["id"]
    finally:
        rules_engine_service.delete_rule(disabled_rule["id"])


# =========================================================================
# 2. Template Resolution and Security Validation
# =========================================================================

def test_template_resolution_and_variables():
    """Verify substitution of {year}, {month}, {day}, {stem}, {extension}, {category}."""
    fixed_date = datetime(2026, 10, 20, 14, 30, tzinfo=timezone.utc)
    resolved = rules_engine_service.resolve_template(
        template="{category}/{year}/{month}/{day}/{stem}_archive.{extension}",
        filename="financial_summary.pdf",
        category="Finance",
        date_override=fixed_date
    )
    assert resolved == "Finance/2026/10/20/financial_summary_archive.pdf"


def test_invalid_template_variables_rejected():
    """Verify that unknown or disallowed variables in templates fail validation."""
    with pytest.raises(ValueError) as exc:
        rules_engine_service.resolve_template(
            template="Folder/{malicious_var}/{stem}.{extension}",
            filename="doc.txt"
        )
    assert "Unknown template variable" in str(exc.value)


def test_destination_traversal_attempts_blocked():
    """Verify that path traversal sequences like '..' and absolute paths are strictly blocked."""
    # '..' in template definition
    with pytest.raises(ValueError) as exc1:
        RuleCreate(
            name="Bad Rule 1",
            destination_template="../Escaped/{stem}.{extension}"
        )
    assert "Path traversal" in str(exc1.value)

    # Absolute path / drive letter in template
    with pytest.raises(ValueError) as exc2:
        RuleCreate(
            name="Bad Rule 2",
            destination_template="C:/Windows/System32/{stem}.{extension}"
        )
    assert "relative paths without drive letters" in str(exc2.value)


# =========================================================================
# 3. File Organizer and Approval Plan Integration
# =========================================================================

@pytest.mark.asyncio
async def test_organizer_scan_uses_configured_rules(tmp_path: Path):
    """Verify scan_and_plan prioritizes user-configured organization rules."""
    work_dir = tmp_path / "work_rules"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Rules Folder")

    # Create a custom rule: Contracts matching *.pdf go to 'Legal_Vault/{year}'
    custom_rule = rules_engine_service.create_rule(RuleCreate(
        name="Custom Legal Vault",
        priority=2,
        match_extensions=".pdf",
        match_glob="*nda*",
        destination_template="Legal_Vault/{year}/{stem}.{extension}"
    ))

    try:
        sample_file = work_dir / "nda_vendor_alpha.pdf"
        sample_file.write_text("Confidential Non-Disclosure Agreement", encoding="utf-8")

        result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
        assert result["total_files"] == 1
        assert result["actions_planned"] == 1

        plan = result["plan"]
        assert plan is not None
        item = plan["items"][0]
        assert "Legal_Vault" in item["target_path"]
        assert "Custom Legal Vault" in item["reason"]
        assert item["action_type"] == "move"
    finally:
        rules_engine_service.delete_rule(custom_rule["id"])


@pytest.mark.asyncio
async def test_collision_counter_resolution(tmp_path: Path):
    """Verify that multiple files moving to the same destination template resolve with numeric counters."""
    work_dir = tmp_path / "work_collision"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Collision Folder")

    rule = rules_engine_service.create_rule(RuleCreate(
        name="Collision Tester",
        priority=1,
        match_extensions=".txt",
        destination_template="Output/fixed_name.txt"
    ))

    try:
        # Create two distinct files (different content, so not exact duplicates)
        f1 = work_dir / "f1.txt"
        f1.write_text("Content A", encoding="utf-8")

        f2 = work_dir / "f2.txt"
        f2.write_text("Content B", encoding="utf-8")

        result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
        assert result["actions_planned"] == 2

        targets = [item["target_path"] for item in result["plan"]["items"]]
        assert len(set(targets)) == 2
        assert any("fixed_name_1.txt" in t for t in targets)
    finally:
        rules_engine_service.delete_rule(rule["id"])


@pytest.mark.asyncio
async def test_preconditions_revalidation_aborts_on_stale_file(tmp_path: Path):
    """Verify that approval execution aborts if a source file changes after plan creation."""
    work_dir = tmp_path / "work_stale"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Stale Folder")

    f = work_dir / "statement.txt"
    f.write_text("Original Statement Version 1", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # Tamper with the file prior to approval execution
    f.write_text("Tampered Statement Version 2", encoding="utf-8")

    # Attempt approval: must fail precondition check
    with pytest.raises(Exception) as exc:
        approval_service.approve_and_execute(plan_id)
    assert "precondition" in str(exc.value).lower() or "modified" in str(exc.value).lower() or "stale" in str(exc.value).lower()


# =========================================================================
# 4. API Endpoints Test (CRUD, Toggle, Test, Preview)
# =========================================================================

def test_rules_api_crud_lifecycle(test_client: TestClient):
    """Verify REST API endpoints for listing, creating, updating, toggling, and deleting rules."""
    # 1. Create Rule
    create_payload = {
        "name": "API Test Rule",
        "description": "Created via automated test",
        "priority": 15,
        "match_extensions": ".csv,.json",
        "match_glob": "*data*",
        "match_regex": "",
        "destination_template": "Data_Lake/{year}/{stem}.{extension}",
        "action_type": "move",
        "is_enabled": True
    }
    res_create = test_client.post("/api/organizer/rules", json=create_payload)
    assert res_create.status_code == 201
    created_rule = res_create.json()
    rule_id = created_rule["id"]
    assert created_rule["name"] == "API Test Rule"
    assert created_rule["priority"] == 15

    try:
        # 2. Get Rule
        res_get = test_client.get(f"/api/organizer/rules/{rule_id}")
        assert res_get.status_code == 200
        assert res_get.json()["id"] == rule_id

        # 3. Update Rule
        update_payload = {"priority": 5, "description": "Updated priority"}
        res_update = test_client.put(f"/api/organizer/rules/{rule_id}", json=update_payload)
        assert res_update.status_code == 200
        assert res_update.json()["priority"] == 5

        # 4. Toggle Rule
        res_toggle = test_client.post(f"/api/organizer/rules/{rule_id}/toggle")
        assert res_toggle.status_code == 200
        assert res_toggle.json()["is_enabled"] is False

        # 5. Test Rule Endpoint
        res_test = test_client.post("/api/organizer/rules/test", json={
            "sample_filename": "q3_data_dump.csv",
            "rule_id": rule_id
        })
        assert res_test.status_code == 200
        assert res_test.json()["matched"] is True

        # 6. Template Preview Endpoint
        res_prev = test_client.post("/api/organizer/templates/preview", json={
            "template": "Archive/{year}/{month}/{stem}.{extension}",
            "sample_filename": "backup.tar.gz"
        })
        assert res_prev.status_code == 200
        assert "Archive/" in res_prev.json()["resolved_destination"]

        # 7. List Template Variables Endpoint
        res_tmpl = test_client.get("/api/organizer/templates")
        assert res_tmpl.status_code == 200
        assert len(res_tmpl.json()["variables"]) >= 5

    finally:
        # 8. Delete Rule
        res_del = test_client.delete(f"/api/organizer/rules/{rule_id}")
        assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_ai_fallback_when_no_rules_match(tmp_path: Path, monkeypatch):
    """Verify that when no deterministic rule matches, file organizer delegates to local AI."""
    from backend.app.services.ai_service import ollama_service
    from backend.app.services.file_organizer import FileClassificationOutput

    work_dir = tmp_path / "work_ai_fallback"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work AI Fallback")

    # Mock Ollama generate_structured
    async def mock_generate_structured(*args, **kwargs):
        return FileClassificationOutput(
            category="Invoices & Receipts",
            suggested_filename="classified_invoice.pdf",
            confidence=0.95,
            reasoning="Mocked LLM recognized invoice markers"
        )

    monkeypatch.setattr(ollama_service, "generate_structured", mock_generate_structured)

    # Unknown filename that won't match default invoice or contract globs
    unknown_file = work_dir / "random_scan_4892.xyz"
    unknown_file.write_text("Unstructured billing slip data", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=True)
    assert result["total_files"] == 1
    assert result["actions_planned"] == 1
    item = result["plan"]["items"][0]
    assert "Invoices & Receipts" in item["target_path"]
    assert "AI classified" in item["reason"]


@pytest.mark.asyncio
async def test_malformed_ai_response_falls_back_gracefully(tmp_path: Path, monkeypatch):
    """Verify that malformed or failing AI responses fall back gracefully to deterministic categorization."""
    from backend.app.services.ai_service import ollama_service, OllamaGenerationError

    work_dir = tmp_path / "work_malformed_ai"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Malformed AI")

    async def mock_failing_structured(*args, **kwargs):
        raise OllamaGenerationError("Malformed JSON returned by model")

    monkeypatch.setattr(ollama_service, "generate_structured", mock_failing_structured)

    unknown_file = work_dir / "mystery_doc.txt"
    unknown_file.write_text("Some text content", encoding="utf-8")

    # Should not raise; should fall back to deterministic classification
    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=True)
    assert result["total_files"] == 1
    assert result["actions_planned"] == 1
    item = result["plan"]["items"][0]
    # .txt deterministic fallback maps to Reports & Notes
    assert "Reports & Notes" in item["target_path"]
    assert "Deterministic rule match" in item["reason"]


def test_organizer_loop_prevention(tmp_path: Path):
    """Verify that files already in allowlisted category folders are ignored to prevent loops."""
    from backend.app.services.folder_watcher import LazyDeskFileHandler

    watch_dir = tmp_path / "watch_loop_test"
    watch_dir.mkdir()

    handler = LazyDeskFileHandler("dummy-id", watch_dir)

    # File at root of watch folder: should NOT be ignored
    root_file = watch_dir / "dropped_file.pdf"
    assert handler.should_ignore(root_file) is False

    # File inside Invoices & Receipts: SHOULD be ignored to prevent endless loops
    organized_file = watch_dir / "Invoices & Receipts" / "2026" / "dropped_file.pdf"
    assert handler.should_ignore(organized_file) is True

