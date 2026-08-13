from fastapi import APIRouter, Request, Depends
from auth import get_current_user, require_admin

router = APIRouter()


@router.get("/monitor/api/teams")
async def get_teams(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT team_id, team_name FROM monitor.teams ORDER BY team_id")
    return [dict(r) for r in rows]


@router.put("/monitor/api/teams")
async def update_teams(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.teams (team_id, team_name)
                VALUES ($1,$2)
                ON CONFLICT (team_id) DO UPDATE SET team_name = $2
                """,
                item["team_id"], item["team_name"],
            )
    return {"status": "ok"}


@router.get("/monitor/api/label-colors")
async def get_label_colors(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT label, color FROM monitor.label_colors ORDER BY label")
    return {r["label"]: r["color"] for r in rows}


@router.put("/monitor/api/label-colors")
async def update_label_colors(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for label, color in body.items():
            await conn.execute(
                """
                INSERT INTO monitor.label_colors (label, color)
                VALUES ($1,$2)
                ON CONFLICT (label) DO UPDATE SET color = $2
                """,
                label, color,
            )
    return {"status": "ok"}


@router.delete("/monitor/api/label-colors/{label}")
async def delete_label_color(label: str, request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM monitor.label_colors WHERE label = $1", label)
    return {"status": "ok"}


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
