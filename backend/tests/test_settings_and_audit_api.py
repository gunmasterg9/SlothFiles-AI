from pathlib import Path
from fastapi import status


def test_settings_api(client, tmp_path: Path):
    """Test reading settings and adding/removing approved roots via API."""
    # 1. Get initial settings
    resp = client.get("/api/settings")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["app_name"] == "SlothPilot AI"
    assert "approved_roots" in data

    # 2. Add an approved root
    new_dir = tmp_path / "test_root"
    new_dir.mkdir()
    add_resp = client.post(
        "/api/settings/roots",
        json={"path": str(new_dir), "label": "Test Root"}
    )
    assert add_resp.status_code == status.HTTP_201_CREATED
    root_data = add_resp.json()
    assert root_data["path"] == str(new_dir.resolve())
    root_id = root_data["id"]

    # 3. Verify in settings
    resp2 = client.get("/api/settings")
    roots = resp2.json()["approved_roots"]
    assert any(r["id"] == root_id for r in roots)

    # 4. Remove approved root
    del_resp = client.delete(f"/api/settings/roots/{root_id}")
    assert del_resp.status_code == status.HTTP_200_OK

    # 5. Verify removed
    resp3 = client.get("/api/settings")
    roots_after = resp3.json()["approved_roots"]
    assert not any(r["id"] == root_id for r in roots_after)


def test_models_api(client):
    """Test discovering Ollama models via API."""
    resp = client.get("/api/models")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "status" in data
    assert "models" in data
    assert "selected_model" in data


def test_audit_api(client):
    """Test retrieving audit logs via API."""
    resp = client.get("/api/audit?limit=10")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)
