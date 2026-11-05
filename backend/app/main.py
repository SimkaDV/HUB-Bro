import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .config import ROOT, settings
from .db import Base, SessionLocal, engine
from .routers import agent, auth, batches, catalog, fulfillment, integrations, labels, orders, presets, stations
from .seed import seed
from .services.orders import sync_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("fontTools").setLevel(logging.WARNING)
log = logging.getLogger("hubbro")


def _sync_once() -> None:
    with SessionLocal() as db:
        log.info("sync: %s", sync_all(db))


async def _sync_loop() -> None:
    # Webhook у Авито пока не проверен — опрашиваем по расписанию (ТЗ 10.4)
    while True:
        await asyncio.sleep(settings.sync_interval_sec)
        try:
            await run_in_threadpool(_sync_once)
        except Exception:
            log.exception("sync failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    task = asyncio.create_task(_sync_loop()) if settings.sync_interval_sec > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="HUB BRO", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

for r in (auth, orders, fulfillment, catalog, batches, labels, stations, agent, integrations, presets):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True, "avito_mode": settings.avito_mode}


# Собранный веб-кабинет отдаём тем же сервером (в разработке — Vite на :5173)
_dist = ROOT / "web" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = _dist / path
        return FileResponse(f if path and f.is_file() else _dist / "index.html")
