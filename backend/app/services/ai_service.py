import json
import logging
import re
from typing import TypeVar
import httpx
from pydantic import BaseModel, ValidationError

from backend.app.config import settings
from backend.app.db.session import get_db

logger = logging.getLogger("slothpilot.ai")

T = TypeVar("T", bound=BaseModel)


class OllamaError(Exception):
    """Base exception for Ollama client errors."""
    pass


class OllamaOfflineError(OllamaError):
    """Raised when Ollama is unreachable on loopback."""
    pass


class OllamaModelNotFoundError(OllamaError):
    """Raised when requested model is not installed in local Ollama."""
    pass


class OllamaTimeoutError(OllamaError):
    """Raised when inference exceeds configured timeout."""
    pass


class OllamaGenerationError(OllamaError):
    """Raised when inference generation fails or returns empty."""
    pass


class OllamaService:
    """Offline-first local AI inference service backed by Ollama."""

    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.timeout = timeout or settings.ollama_timeout_seconds

    async def check_connection(self) -> dict:
        """Query Ollama local runtime for connection status and installed models."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return {
                        "connected": True,
                        "base_url": self.base_url,
                        "models": models,
                        "count": len(models)
                    }
                return {
                    "connected": False,
                    "base_url": self.base_url,
                    "models": [],
                    "count": 0,
                    "error": f"HTTP {res.status_code}"
                }
        except httpx.RequestError as exc:
            return {
                "connected": False,
                "base_url": self.base_url,
                "models": [],
                "count": 0,
                "error": str(exc)
            }

    async def list_models(self) -> list[str]:
        """Return list of model tags available in the local Ollama runtime."""
        status_info = await self.check_connection()
        if not status_info["connected"]:
            raise OllamaOfflineError(
                f"Ollama local service is not reachable at {self.base_url}. "
                "Ensure Ollama is started locally."
            )
        return status_info["models"]

    def get_selected_model(self) -> str:
        """Fetch user-selected model from database or fallback to configured default."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'selected_model'"
            ).fetchone()
            if row and row["value"]:
                return row["value"]
        return settings.ollama_default_model

    def set_selected_model(self, model_name: str) -> None:
        """Persist selected model to app_settings."""
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value, updated_at)
                VALUES ('selected_model', ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (model_name,)
            )

    async def resolve_active_model(self) -> str:
        """Determine an active model from installed candidates."""
        available = await self.list_models()
        if not available:
            raise OllamaModelNotFoundError(
                "No open-weight models found in local Ollama runtime. "
                "Run 'ollama pull qwen2.5:7b' or your preferred model."
            )

        saved = self.get_selected_model()
        if saved in available:
            return saved

        # If saved candidate is not found, check standard supported candidates
        priority_candidates = ["qwen2.5:7b", "llama3.2:latest", "smollm2:latest"]
        for candidate in priority_candidates:
            if candidate in available:
                self.set_selected_model(candidate)
                return candidate

        # Fallback to the first installed local model
        fallback = available[0]
        self.set_selected_model(fallback)
        return fallback

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        model: str | None = None,
        format_json: bool = False,
        temperature: float = 0.1
    ) -> str:
        """Run text completion against the local Ollama model."""
        target_model = model or await self.resolve_active_model()

        # Input bounding to avoid unbounded local resource consumption
        bounded_prompt = prompt[:32000]

        payload: dict = {
            "model": target_model,
            "prompt": bounded_prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": 4096
            }
        }
        if system:
            payload["system"] = system[:8000]
        if format_json:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.base_url}/api/generate", json=payload)

                if res.status_code == 404:
                    raise OllamaModelNotFoundError(
                        f"Model '{target_model}' is not installed in local Ollama."
                    )
                if res.status_code != 200:
                    raise OllamaGenerationError(
                        f"Ollama returned HTTP {res.status_code}: {res.text}"
                    )

                response_data = res.json()
                response_text = response_data.get("response", "").strip()
                if not response_text:
                    raise OllamaGenerationError("Model returned an empty response.")
                return response_text

        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(
                f"Ollama request timed out after {self.timeout}s: {exc}"
            ) from exc
        except httpx.RequestError as exc:
            raise OllamaOfflineError(
                f"Failed to communicate with Ollama at {self.base_url}: {exc}"
            ) from exc

    async def generate_structured(
        self,
        prompt: str,
        response_schema: type[T],
        system: str | None = None,
        model: str | None = None
    ) -> T:
        """Generate structured JSON and validate against a Pydantic schema."""
        raw_text = await self.generate(
            prompt=prompt,
            system=system,
            model=model,
            format_json=True,
            temperature=0.0
        )

        # Strip markdown fences if present
        clean_text = raw_text.strip()
        if clean_text.startswith("```"):
            clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
            clean_text = re.sub(r"\s*```$", "", clean_text)

        try:
            return response_schema.model_validate_json(clean_text)
        except (ValidationError, json.JSONDecodeError) as exc:
            logger.warning("Structured output validation failed: %s. Raw text: %s", exc, clean_text[:200])
            raise OllamaGenerationError(
                f"Model response did not conform to schema {response_schema.__name__}: {exc}"
            ) from exc


ollama_service = OllamaService()
