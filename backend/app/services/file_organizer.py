from datetime import datetime, timezone
import logging
from pathlib import Path
import re
from pydantic import BaseModel, Field

from backend.app.services.ai_service import ollama_service, OllamaError
from backend.app.services.approval_service import approval_service, compute_file_sha256
from backend.app.services.document_extractor import document_extractor
from backend.app.services.path_service import path_service
from backend.app.services.rules_engine import rules_engine_service

logger = logging.getLogger("slothpilot.organizer")

ALLOWLISTED_CATEGORIES = [
    "Invoices & Receipts",
    "Contracts & Legal",
    "Shipment & Logistics",
    "Reports & Notes",
    "Code & Data",
    "Media & Assets",
    "Archives",
    "Duplicates",
    "Miscellaneous"
]


class FileClassificationOutput(BaseModel):
    category: str = Field(description="Must be one of the allowlisted categories")
    suggested_filename: str = Field(description="Clean, sanitized suggested filename including extension")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    reasoning: str = Field(default="")


class FileOrganizerService:
    """Service scanning approved folders, indexing files, finding duplicates, and building action plans."""

    @staticmethod
    def is_ignored(path: Path) -> bool:
        """Filter out hidden, system, and temporary files."""
        name = path.name
        if name.startswith(".") or name.startswith("~$") or name.endswith(".tmp") or name == "Thumbs.db":
            return True
        return False

    @classmethod
    async def scan_and_plan(
        cls,
        raw_folder_path: str,
        use_ai: bool = True
    ) -> dict:
        """Scan folder, detect duplicates, classify content, and construct approval plan."""
        folder = path_service.validate_path(raw_folder_path)
        if not folder.is_dir():
            raise ValueError(f"Path is not a directory: {folder}")

        files: list[Path] = []
        for p in folder.iterdir():
            if p.is_file() and not cls.is_ignored(p):
                files.append(p)

        files.sort(key=lambda p: p.name)

        if not files:
            return {
                "folder": str(folder),
                "total_files": 0,
                "duplicates_found": 0,
                "plan": None,
                "message": "No non-temporary files found in directory."
            }

        # Step 1: Compute hashes and detect exact duplicates
        file_records = []
        hash_map: dict[str, list[Path]] = {}

        for f in files:
            file_hash = compute_file_sha256(f)
            hash_map.setdefault(file_hash, []).append(f)
            file_records.append({
                "path": f,
                "name": f.name,
                "hash": file_hash,
                "size": f.stat().st_size
            })

        duplicate_count = sum(len(paths) - 1 for paths in hash_map.values() if len(paths) > 1)

        # Step 2: Extract text and classify files
        proposed_items = []
        for rec in file_records:
            f_path: Path = rec["path"]
            f_hash: str = rec["hash"]
            f_name: str = rec["name"]

            # Check if this file is a redundant duplicate
            is_redundant_duplicate = False
            first_occurrence = hash_map[f_hash][0]
            if len(hash_map[f_hash]) > 1 and f_path != first_occurrence:
                is_redundant_duplicate = True

            if is_redundant_duplicate:
                category = "Duplicates"
                suggested_name = f"duplicate_{f_name}"
                target_dir = folder / category
                target_file = target_dir / suggested_name
                reason = f"Exact SHA-256 match with '{first_occurrence.name}'"
                risk = "low"
            else:
                # 1. Deterministic user-configured organization rules (first-match by priority)
                rule_proposal = rules_engine_service.evaluate_file(f_path, folder)
                if rule_proposal:
                    target_file = Path(rule_proposal["target_path"])
                    target_dir = target_file.parent
                    suggested_name = target_file.name
                    category = rule_proposal["rule_name"]
                    reason = rule_proposal["reason"]
                    risk = "low"
                else:
                    # 2. Fall back to local AI or keyword categorization if no user rule matched
                    extraction = document_extractor.extract_text(f_path)
                    classification = await cls._classify_file(
                        file_name=f_name,
                        text_snippet=extraction.text_content,
                        use_ai=use_ai
                    )
                    category = classification["category"]
                    suggested_name = classification["suggested_filename"]
                    target_dir = folder / category
                    target_file = target_dir / suggested_name
                    reason = classification["reason"]
                    risk = "low"

            # Collision prevention: if target exists or is already assigned, add counter
            counter = 1
            while target_file.exists() or any(item["target_path"] == str(target_file) for item in proposed_items):
                stem = Path(suggested_name).stem
                suffix = Path(suggested_name).suffix
                target_file = target_dir / f"{stem}_{counter}{suffix}"
                counter += 1

            # Only propose an action if target path is different from source path
            if target_file.resolve() != f_path.resolve():
                proposed_items.append({
                    "action_type": "move",
                    "source_path": str(f_path.resolve()),
                    "target_path": str(target_file.resolve()),
                    "risk_level": risk,
                    "reason": reason
                })

        plan = None
        if proposed_items:
            plan = approval_service.create_plan(
                title=f"Organize '{folder.name}'",
                description=f"Automated categorization and duplicate separation for {len(proposed_items)} files.",
                module="organizer",
                items=proposed_items
            )

        return {
            "folder": str(folder),
            "total_files": len(files),
            "duplicates_found": duplicate_count,
            "actions_planned": len(proposed_items),
            "plan": plan
        }

    @classmethod
    async def _classify_file(
        cls,
        file_name: str,
        text_snippet: str,
        use_ai: bool = True
    ) -> dict:
        """Classify file into allowlisted categories using local Ollama or deterministic fallback."""
        if use_ai:
            try:
                system_prompt = (
                    "You are a strict file classification engine. You must classify files ONLY into one of these exact categories: "
                    + ", ".join(ALLOWLISTED_CATEGORIES)
                    + ". Return strict JSON conforming to: {'category': str, 'suggested_filename': str, 'reasoning': str}."
                )
                user_prompt = (
                    f"Filename: {file_name}\n"
                    f"Content snippet:\n{text_snippet[:1500]}\n\n"
                    "Provide the best category and clean suggested filename (preserve extension)."
                )

                result = await ollama_service.generate_structured(
                    prompt=user_prompt,
                    system=system_prompt,
                    response_schema=FileClassificationOutput
                )

                # Ensure category strictly belongs to allowlist
                cat = result.category.strip()
                if cat not in ALLOWLISTED_CATEGORIES:
                    # Match closest or fallback
                    matched = [c for c in ALLOWLISTED_CATEGORIES if c.lower() in cat.lower()]
                    cat = matched[0] if matched else "Miscellaneous"

                sanitized_name = cls._sanitize_filename(result.suggested_filename or file_name)
                return {
                    "category": cat,
                    "suggested_filename": sanitized_name,
                    "reason": f"AI classified ({result.reasoning[:80]})" if result.reasoning else "AI classified",
                    "is_ai": True
                }
            except (OllamaError, Exception) as exc:
                logger.info("Ollama AI classification unavailable (%s). Falling back to deterministic rules.", exc)

        # Deterministic rule-based fallback
        return cls._deterministic_classification(file_name, text_snippet)

    @classmethod
    def _deterministic_classification(cls, file_name: str, text: str) -> dict:
        """Deterministic keyword and extension matching when offline or AI fails."""
        name_lower = file_name.lower()
        text_lower = text.lower()
        ext = Path(file_name).suffix.lower()

        if any(k in name_lower or k in text_lower for k in ["invoice", "receipt", "bill", "tax", "payment", "subtotal"]):
            cat = "Invoices & Receipts"
        elif any(k in name_lower or k in text_lower for k in ["agreement", "contract", "nda", "terms", "liability", "license"]):
            cat = "Contracts & Legal"
        elif any(k in name_lower or k in text_lower for k in ["bill of lading", "shipment", "packing list", "manifest", "freight", "customs"]):
            cat = "Shipment & Logistics"
        elif ext in {".py", ".ts", ".js", ".json", ".sql", ".csv", ".xml", ".yaml", ".yml", ".html"}:
            cat = "Code & Data"
        elif ext in {".png", ".jpg", ".jpeg", ".svg", ".mp4", ".mp3", ".wav"}:
            cat = "Media & Assets"
        elif ext in {".zip", ".tar", ".gz", ".7z", ".rar"}:
            cat = "Archives"
        elif ext in {".pdf", ".docx", ".txt", ".md"}:
            cat = "Reports & Notes"
        else:
            cat = "Miscellaneous"

        return {
            "category": cat,
            "suggested_filename": cls._sanitize_filename(file_name),
            "reason": f"Deterministic rule match (ext: {ext})",
            "is_ai": False
        }

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        """Sanitize filename to prevent illegal Windows characters."""
        clean = re.sub(r'[<>:"/\\|?*]', '_', name).strip()
        return clean or "unnamed_document"


file_organizer_service = FileOrganizerService()
