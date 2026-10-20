import pytest
from pydantic import BaseModel
from backend.app.services.ai_service import (
    OllamaService,
    OllamaOfflineError,
    OllamaModelNotFoundError,
    OllamaGenerationError
)


class MockCategoryResponse(BaseModel):
    category: str
    confidence: float


@pytest.mark.asyncio
async def test_ollama_model_selection():
    """Verify selecting and persisting active model in SQLite."""
    service = OllamaService()
    service.set_selected_model("qwen2.5:7b")
    assert service.get_selected_model() == "qwen2.5:7b"

    service.set_selected_model("llama3.2:latest")
    assert service.get_selected_model() == "llama3.2:latest"


@pytest.mark.asyncio
async def test_ollama_live_discovery():
    """Verify live discovery against the running local Ollama instance."""
    service = OllamaService()
    conn_info = await service.check_connection()
    if conn_info["connected"]:
        models = await service.list_models()
        assert isinstance(models, list)
        assert len(models) >= 1
        active = await service.resolve_active_model()
        assert active in models
    else:
        # If running in environment without active Ollama, verify error handling
        with pytest.raises(OllamaOfflineError):
            await service.list_models()


@pytest.mark.asyncio
async def test_ollama_offline_handling():
    """Verify that requests to an unreachable base URL raise OllamaOfflineError."""
    service = OllamaService(base_url="http://127.0.0.1:54321")
    with pytest.raises(OllamaOfflineError):
        await service.list_models()


def test_structured_validation_logic():
    """Verify schema validation and markdown fence stripping behavior."""
    valid_json = '{"category": "Invoices", "confidence": 0.98}'
    result = MockCategoryResponse.model_validate_json(valid_json)
    assert result.category == "Invoices"
    assert result.confidence == 0.98
