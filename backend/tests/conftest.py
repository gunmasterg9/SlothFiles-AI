from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.db.migrations import run_migrations
from backend.app.main import app


@pytest.fixture(autouse=True)
def isolate_test_data_dir(tmp_path: Path, monkeypatch):
    """Ensure all tests operate in isolated synthetic temporary directories with applied schema."""
    test_data = tmp_path / "data"
    test_data.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "data_dir", test_data)
    run_migrations()
    yield test_data


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    with TestClient(app, base_url="http://testclient") as test_client:
        yield test_client
