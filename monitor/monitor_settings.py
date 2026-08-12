from fastapi import APIRouter, Request, Depends
from auth import get_current_user, require_admin

router = APIRouter()


@router.get("/monitor/api/sla-priority-targets")
async def get_sla_priority_targets(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM monitor.sla_priority_targets ORDER BY priority")
    return [dict(r) for r in rows]


@router.put("/monitor/api/sla-priority-targets")
async def update_sla_priority_targets(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.sla_priority_targets (priority, first_response_minutes, resolution_minutes)
                VALUES ($1,$2,$3)
                ON CONFLICT (priority) DO UPDATE SET
                    first_response_minutes = $2, resolution_minutes = $3
                """,
                item["priority"], item["first_response_minutes"], item["resolution_minutes"],
            )
    return {"status": "ok"}


@router.get("/monitor/api/settings")
async def get_settings(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM monitor.settings")
    return {r["key"]: r["value"] for r in rows}


@router.put("/monitor/api/settings")
async def update_settings(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for key, value in body.items():
            await conn.execute(
                "INSERT INTO monitor.settings (key, value) VALUES ($1,$2) "
                "ON CONFLICT (key) DO UPDATE SET value = $2",
                key, str(value),
            )
    return {"status": "ok"}
