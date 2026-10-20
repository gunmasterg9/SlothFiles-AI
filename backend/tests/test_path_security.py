from pathlib import Path
import pytest
from fastapi import HTTPException
from backend.app.services.path_service import path_service, PathSecurityViolation


def test_path_service_approvals(tmp_path: Path):
    """Test registering and deactivating approved roots."""
    approved_dir = tmp_path / "approved_folder"
    approved_dir.mkdir()

    res = path_service.add_approved_root(str(approved_dir), "My Approved Folder")
    assert res["path"] == str(approved_dir.resolve())
    assert res["label"] == "My Approved Folder"

    roots = path_service.get_approved_roots()
    assert any(r["id"] == res["id"] for r in roots)

    # Valid subpath should pass validation
    subfile = approved_dir / "document.txt"
    subfile.write_text("content", encoding="utf-8")
    validated = path_service.validate_path(str(subfile))
    assert validated == subfile.resolve()

    # Deactivating root
    removed = path_service.remove_approved_root(res["id"])
    assert removed is True


def test_path_traversal_blocked(tmp_path: Path):
    """Verify .. traversal attempts are rejected."""
    approved_dir = tmp_path / "safe"
    approved_dir.mkdir()
    path_service.add_approved_root(str(approved_dir), "Safe")

    traversal_candidate = str(approved_dir) + "/../secret.txt"
    with pytest.raises(PathSecurityViolation) as exc:
        path_service.validate_path(traversal_candidate)
    assert "traversal" in str(exc.value.detail).lower()


def test_path_outside_approved_roots(tmp_path: Path):
    """Verify paths outside registered approved roots are rejected with 403."""
    approved_dir = tmp_path / "safe"
    approved_dir.mkdir()
    path_service.add_approved_root(str(approved_dir), "Safe")

    forbidden_dir = tmp_path / "forbidden"
    forbidden_dir.mkdir()
    forbidden_file = forbidden_dir / "passwords.txt"
    forbidden_file.write_text("secret", encoding="utf-8")

    with pytest.raises(PathSecurityViolation) as exc:
        path_service.validate_path(str(forbidden_file))
    assert "outside approved" in str(exc.value.detail).lower()


def test_unc_path_blocked(tmp_path: Path):
    """Verify UNC paths are blocked."""
    approved_dir = tmp_path / "safe"
    approved_dir.mkdir()
    path_service.add_approved_root(str(approved_dir), "Safe")

    with pytest.raises(PathSecurityViolation) as exc:
        path_service.validate_path("\\\\evil-server\\share\\data.txt")
    assert "unc" in str(exc.value.detail).lower()
