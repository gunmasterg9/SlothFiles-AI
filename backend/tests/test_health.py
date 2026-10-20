from fastapi import status


def test_health_endpoint(client):
    """Verify /api/health returns valid liveness response."""
    response = client.get("/api/health")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "ok"
    assert data["app_name"] == "SlothPilot AI"
    assert "version" in data
    assert "timestamp" in data


def test_ready_endpoint(client):
    """Verify /api/ready performs component checks."""
    response = client.get("/api/ready")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] in ("ready", "degraded")
    assert "components" in data
    component_names = [c["name"] for c in data["components"]]
    assert "storage" in component_names
    assert "database" in component_names
    assert "ollama" in component_names


def test_dns_rebinding_protection(client):
    """Verify non-loopback host headers are rejected with 403."""
    response = client.get("/api/health", headers={"host": "attacker.com"})
    assert response.status_code == status.HTTP_403_FORBIDDEN
    data = response.json()
    assert data["error"]["code"] == "FORBIDDEN_HOST"


def test_structured_404_error(client):
    """Verify unknown routes return structured JSON errors without raw stack traces."""
    response = client.get("/api/non-existent-endpoint")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
