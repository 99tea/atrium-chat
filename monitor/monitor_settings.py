from fastapi import APIRouter, Request, Depends
from auth import get_current_user, require_admin, get_account_id

router = APIRouter()


@router.get("/monitor/api/teams")
async def get_teams(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT team_id, team_name FROM monitor.teams WHERE account_id = $1 ORDER BY team_id",
            account_id,
        )
    return [dict(r) for r in rows]


@router.put("/monitor/api/teams")
async def update_teams(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.teams (account_id, team_id, team_name)
                VALUES ($1,$2,$3)
                ON CONFLICT (account_id, team_id) DO UPDATE SET team_name = $3
                """,
                account_id, item["team_id"], item["team_name"],
            )
    return {"status": "ok"}


@router.delete("/monitor/api/teams/{team_id}")
async def delete_team(team_id: int, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM monitor.teams WHERE account_id = $1 AND team_id = $2",
            account_id, team_id,
        )
    return {"status": "ok"}


@router.get("/monitor/api/label-colors")
async def get_label_colors(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT label, color FROM monitor.label_colors WHERE account_id = $1 ORDER BY label",
            account_id,
        )
    return {r["label"]: r["color"] for r in rows}


@router.put("/monitor/api/label-colors")
async def update_label_colors(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for label, color in body.items():
            await conn.execute(
                """
                INSERT INTO monitor.label_colors (account_id, label, color)
                VALUES ($1,$2,$3)
                ON CONFLICT (account_id, label) DO UPDATE SET color = $3
                """,
                account_id, label, color,
            )
    return {"status": "ok"}


@router.delete("/monitor/api/label-colors/{label}")
async def delete_label_color(label: str, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM monitor.label_colors WHERE account_id = $1 AND label = $2",
            account_id, label,
        )
    return {"status": "ok"}


@router.get("/monitor/api/sla-priority-targets")
async def get_sla_priority_targets(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM monitor.sla_priority_targets WHERE account_id = $1 ORDER BY priority",
            account_id,
        )
    return [dict(r) for r in rows]


@router.put("/monitor/api/sla-priority-targets")
async def update_sla_priority_targets(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.sla_priority_targets (account_id, priority, first_response_minutes, resolution_minutes)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (account_id, priority) DO UPDATE SET
                    first_response_minutes = $3, resolution_minutes = $4
                """,
                account_id, item["priority"], item["first_response_minutes"], item["resolution_minutes"],
            )
    return {"status": "ok"}


@router.get("/monitor/api/settings")
async def get_settings(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM monitor.settings WHERE account_id = $1",
            account_id,
        )
    return {r["key"]: r["value"] for r in rows}


@router.put("/monitor/api/settings")
async def update_settings(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for key, value in body.items():
            await conn.execute(
                """
                INSERT INTO monitor.settings (account_id, key, value)
                VALUES ($1,$2,$3)
                ON CONFLICT (account_id, key) DO UPDATE SET value = $3
                """,
                account_id, key, str(value),
            )
    return {"status": "ok"}
