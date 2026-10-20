from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.config import settings
from backend.app.db.migrations import run_migrations
from backend.app.routers import health, settings as settings_router, audit, organizer, approvals, tasks, watcher, inbox, tradesloth, copilot
from backend.app.services.folder_watcher import folder_watcher_service

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("slothpilot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: run initialization checks and migrations on startup."""
    logger.info("Initializing SlothPilot AI backend on loopback interface %s:%s", settings.host, settings.port)
    settings.resolved_data_dir.mkdir(parents=True, exist_ok=True)
    run_migrations()
    yield
    folder_watcher_service.shutdown()
    logger.info("Shutting down SlothPilot AI backend.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Offline-first personal productivity and automation application powered by local open-weight AI.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Narrow CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


@app.middleware("http")
async def dns_rebinding_and_security_guard(request: Request, call_next):
    """Enforce loopback host header check to prevent DNS rebinding attacks on local services."""
    host_header = request.headers.get("host", "")
    hostname = host_header.split(":")[0].lower() if host_header else ""

    allowed_hosts = {"127.0.0.1", "localhost", "testclient"}
    if hostname and hostname not in allowed_hosts:
        logger.warning("Rejected non-loopback Host header: %s", host_header)
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "error": {
                    "code": "FORBIDDEN_HOST",
                    "message": "Direct access via untrusted host header is blocked.",
                    "details": None
                }
            }
        )
    return await call_next(request)


# Structured error handlers (Do not expose raw tracebacks)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail,
                "details": None
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request parameters or body.",
                "details": exc.errors()
            }
        }
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error processing %s: %s", request.url.path, str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An internal error occurred while processing the request.",
                "details": None
            }
        }
    )


# Include Routers
app.include_router(health.router)
app.include_router(settings_router.router)
app.include_router(audit.router)
app.include_router(organizer.router)
app.include_router(approvals.router)
app.include_router(tasks.router)
app.include_router(watcher.router)
app.include_router(inbox.router)
app.include_router(tradesloth.router)
app.include_router(copilot.router)

# Mount production frontend assets if built
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if (frontend_dist_dir / "index.html").exists():
    assets_dir = frontend_dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise StarletteHTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
        candidate = frontend_dist_dir / full_path
        try:
            resolved_candidate = candidate.resolve()
            if resolved_candidate.is_relative_to(frontend_dist_dir.resolve()) and resolved_candidate.is_file():
                return FileResponse(str(resolved_candidate))
        except (ValueError, RuntimeError):
            pass
        return FileResponse(str(frontend_dist_dir / "index.html"))

