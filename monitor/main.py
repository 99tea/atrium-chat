from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import asyncpg
import os

from monitor import router as monitor_router, SCHEMA_SQL
import auth

app = FastAPI()
app.include_router(monitor_router)
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
