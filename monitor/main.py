from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import asyncpg
import os
from monitor_core import router as core_router, SCHEMA_SQL
from monitor_overview import router as overview_router
from monitor_agents import router as agents_router
from monitor_conversations import router as conversations_router
from monitor_today import router as today_router
from monitor_me import router as me_router
from monitor_clients import router as clients_router
from monitor_settings import router as settings_router
import auth

app = FastAPI()
app.include_router(core_router)
app.include_router(overview_router)
app.include_router(agents_router)
app.include_router(conversations_router)
app.include_router(today_router)
app.include_router(me_router)
app.include_router(clients_router)
app.include_router(settings_router)
app.include_router(auth.router)
app.mount("/monitor-ui", StaticFiles(directory="static", html=True), name="monitor-ui")

@app.on_event("startup")
async def startup():
    app.state.monitor_pool = await asyncpg.create_pool(os.environ["MONITOR_DATABASE_URL"])
    async with app.state.monitor_pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)

@app.get("/health")
async def health():
    return {"status": "ok"}
