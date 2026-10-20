"""Unit and integration tests for TradeSloth Document Auditor.

Validates multi-document cross-audits, decimal arithmetic comparisons,
unit and currency checks, discrepancy matrix generation, and report export.
"""

from decimal import Decimal
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.services.path_service import path_service
from backend.app.services.tradesloth_service import TradeSlothService, LEGAL_DISCLAIMER


def test_tradesloth_clean_audit(tmp_path: Path):
    """Verifies that matching shipment documents produce verified findings and clean audit status."""
    shipments_dir = tmp_path / "shipments"
    shipments_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(shipments_dir), "Test Shipments")

    # 1. Commercial Invoice
    inv_content = (
        "COMMERCIAL INVOICE\n"
        "Invoice No: INV-2024-889\n"
        "Date: 2024-10-15\n"
        "Currency: USD\n"
        "Shipper: Global Logistics Inc.\n"
        "Consignee: Acme Imports Corp.\n"
        "Packages: 50 cartons\n"
        "Gross Weight: 1250.00 kg\n"
        "Total Amount: 12500.00 USD\n"
    )
    inv_file = shipments_dir / "invoice.txt"
    inv_file.write_text(inv_content, encoding="utf-8")

    # 2. Packing List
    pkl_content = (
        "PACKING LIST\n"
        "Ref: INV-2024-889\n"
        "Shipper: Global Logistics Inc.\n"
        "Consignee: Acme Imports Corp.\n"
        "Packages: 50 cartons\n"
        "Gross Weight: 1250.00 kg\n"
    )
    pkl_file = shipments_dir / "packing_list.txt"
    pkl_file.write_text(pkl_content, encoding="utf-8")

    res = TradeSlothService.audit_documents([str(inv_file), str(pkl_file)], "Test Clean Audit")

    assert res["status"] == "clean"
    assert res["summary"]["total_documents"] == 2
    assert res["summary"]["discrepancies"] == 0

    # Package count check
    pkg_finding = next((f for f in res["findings"] if f["field_name"] == "package_count"), None)
    assert pkg_finding is not None
    assert pkg_finding["status"] == "verified"
    assert pkg_finding["difference"] == "0.00"

    # Gross weight check
    gw_finding = next((f for f in res["findings"] if f["field_name"] == "gross_weight"), None)
    assert gw_finding is not None
    assert gw_finding["status"] == "verified"
    assert gw_finding["difference"] == "0.00"

    # Reference check
    ref_finding = next((f for f in res["findings"] if f["field_name"] == "reference_number"), None)
    assert ref_finding is not None
    assert ref_finding["status"] == "verified"


def test_tradesloth_discrepancy_and_decimal_math(tmp_path: Path):
    """Verifies that quantity variances and unit mismatches are detected with exact Decimal math."""
    shipments_dir = tmp_path / "shipments"
    shipments_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(shipments_dir), "Test Shipments")

    # Doc 1: Invoice claiming 100 packages, 2500.50 kg
    inv_content = (
        "COMMERCIAL INVOICE\n"
        "Invoice Number: BL-99001\n"
        "Packages: 100 cartons\n"
        "Gross Weight: 2500.50 kg\n"
        "Total Amount: 50000.00 USD\n"
    )
    inv_file = shipments_dir / "inv.txt"
    inv_file.write_text(inv_content, encoding="utf-8")

    # Doc 2: Packing List claiming only 95 packages and unit in lbs
    pkl_content = (
        "PACKING LIST\n"
        "Reference: BL-99001\n"
        "Packages: 95 cartons\n"
        "Gross Weight: 2500.50 lbs\n"
    )
    pkl_file = shipments_dir / "pkl.txt"
    pkl_file.write_text(pkl_content, encoding="utf-8")

    res = TradeSlothService.audit_documents([str(inv_file), str(pkl_file)], "Discrepancy Audit")

    assert res["status"] == "discrepancies_found"
    assert res["summary"]["discrepancies"] >= 2

    # Verify decimal arithmetic difference: 100 - 95 = 5
    pkg_finding = next((f for f in res["findings"] if f["field_name"] == "package_count"), None)
    assert pkg_finding is not None
    assert pkg_finding["status"] == "inconsistent"
    assert pkg_finding["difference"] == "5"
    assert pkg_finding["severity"] == "high"

    # Verify unit mismatch: kg vs lbs
    unit_finding = next((f for f in res["findings"] if f["field_name"] == "gross_weight_unit"), None)
    assert unit_finding is not None
    assert unit_finding["status"] == "inconsistent"
    assert "Unit conflict" in unit_finding["difference"]


def test_tradesloth_export_report_and_disclaimer(tmp_path: Path):
    """Verifies that audit reports can be exported to Markdown and contain required legal disclaimers."""
    shipments_dir = tmp_path / "shipments"
    shipments_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(shipments_dir), "Test Shipments")

    doc1 = shipments_dir / "doc1.txt"
    doc1.write_text("BILL OF LADING\nRef: SH-123\nPackages: 10 cartons\n", encoding="utf-8")
    doc2 = shipments_dir / "doc2.txt"
    doc2.write_text("PACKING LIST\nRef: SH-123\nPackages: 10 cartons\n", encoding="utf-8")

    audit = TradeSlothService.audit_documents([str(doc1), str(doc2)], "Export Test")
    report_md = TradeSlothService.export_report_markdown(audit["id"])

    assert "# TradeSloth Shipment Audit Report" in report_md
    assert LEGAL_DISCLAIMER in report_md
    assert "Discrepancy Matrix" in report_md
    assert "SH-123" in report_md


def test_tradesloth_api_routes(tmp_path: Path, client: TestClient):
    """Verifies the FastAPI routes for TradeSloth."""
    shipments_dir = tmp_path / "shipments"
    shipments_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(shipments_dir), "Test Shipments")

    doc1 = shipments_dir / "doc_a.txt"
    doc1.write_text("COMMERCIAL INVOICE\nINV: 777\nTotal: 1000.00 USD\n", encoding="utf-8")
    doc2 = shipments_dir / "doc_b.txt"
    doc2.write_text("PACKING LIST\nINV: 777\nTotal: 1000.00 USD\n", encoding="utf-8")

    # 1. Trigger Audit
    res = client.post(
        "/api/tradesloth/audit",
        json={"document_paths": [str(doc1), str(doc2)], "title": "API Test"}
    )
    assert res.status_code == 200
    data = res.json()
    audit_id = data["id"]
    assert data["status"] == "clean"

    # 2. List Audits
    list_res = client.get("/api/tradesloth/audits")
    assert list_res.status_code == 200
    assert any(a["id"] == audit_id for a in list_res.json())

    # 3. Get Audit by ID
    get_res = client.get(f"/api/tradesloth/audits/{audit_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "API Test"

    # 4. Export Report
    rpt_res = client.get(f"/api/tradesloth/audits/{audit_id}/report")
    assert rpt_res.status_code == 200
    assert "TradeSloth Shipment Audit Report" in rpt_res.text
