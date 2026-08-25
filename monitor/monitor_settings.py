from fastapi import APIRouter, Request, Depends, HTTPException
from auth import get_current_user, require_admin, get_account_id
from monitor_core import get_channels
from datetime import time as dtime


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

@router.get("/monitor/api/business-hours")
async def get_business_hours(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT enabled, business_days, hour_start, hour_end FROM monitor.business_hours_config WHERE account_id = $1",
            account_id,
        )
    if not row:
        return {"enabled": False, "business_days": [1, 2, 3, 4, 5], "hour_start": "08:00", "hour_end": "18:00"}
    return {
        "enabled": row["enabled"],
        "business_days": row["business_days"],
        "hour_start": row["hour_start"].strftime("%H:%M"),
        "hour_end": row["hour_end"].strftime("%H:%M"),
    }



@router.put("/monitor/api/business-hours")
async def update_business_hours(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool

    hour_start = dtime.fromisoformat(body["hour_start"])
    hour_end = dtime.fromisoformat(body["hour_end"])

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO monitor.business_hours_config (account_id, enabled, business_days, hour_start, hour_end)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (account_id) DO UPDATE SET
                enabled = $2, business_days = $3, hour_start = $4, hour_end = $5
            """,
            account_id, body["enabled"], body["business_days"], hour_start, hour_end,
        )
    return {"status": "ok"}

@router.get("/monitor/api/channels")
async def get_channels_endpoint(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
    return channels


@router.put("/monitor/api/channels")
async def update_channels(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.channels (account_id, channel_key, channel_name, inbox_ids, is_default)
                VALUES ($1,$2,$3,$4,COALESCE((SELECT is_default FROM monitor.channels WHERE account_id=$1 AND channel_key=$2), false))
                ON CONFLICT (account_id, channel_key) DO UPDATE SET
                    channel_name = $3, inbox_ids = $4
                """,
                account_id, item["channel_key"], item["channel_name"], item["inbox_ids"],
            )
    return {"status": "ok"}


@router.delete("/monitor/api/channels/{channel_key}")
async def delete_channel(channel_key: str, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    if channel_key in ("whatsapp", "email"):
        raise HTTPException(400, "canais padrão não podem ser removidos")
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM monitor.channels WHERE account_id = $1 AND channel_key = $2",
            account_id, channel_key,
        )
    return {"status": "ok"}
