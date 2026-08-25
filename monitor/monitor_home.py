from fastapi import APIRouter, Request, Depends, HTTPException
from auth import get_current_user, get_account_id
from monitor_core import get_channels, resolve_channel
import httpx
import os

router = APIRouter()

CHATWOOT_URL = os.environ["CHATWOOT_URL"]


@router.get("/monitor/api/home/tasks")
async def list_tasks(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, content, done, created_at FROM monitor.user_tasks WHERE user_id = $1 AND account_id = $2 ORDER BY done ASC, created_at DESC",
            user["id"], account_id,
        )
    return [dict(r) for r in rows]


@router.post("/monitor/api/home/tasks")
async def create_task(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "conteúdo da tarefa é obrigatório")
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO monitor.user_tasks (user_id, account_id, content) VALUES ($1,$2,$3) RETURNING id, content, done, created_at",
            user["id"], account_id, content,
        )
    return dict(row)


@router.put("/monitor/api/home/tasks/{task_id}")
async def update_task(task_id: int, request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE monitor.user_tasks SET done = $1 WHERE id = $2 AND user_id = $3 AND account_id = $4 RETURNING id, content, done, created_at",
            bool(body.get("done", False)), task_id, user["id"], account_id,
        )
    if not row:
        raise HTTPException(404, "tarefa não encontrada")
    return dict(row)


@router.delete("/monitor/api/home/tasks/{task_id}")
async def delete_task(task_id: int, request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM monitor.user_tasks WHERE id = $1 AND user_id = $2 AND account_id = $3",
            task_id, user["id"], account_id,
        )
    return {"status": "ok"}


@router.get("/monitor/api/home/stats")
async def home_stats(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT s.inbox_id,
                count(*) FILTER (WHERE e.event_type = 'created') AS created,
                count(*) FILTER (WHERE e.event_type = 'status_changed' AND e.to_value = 'resolved') AS resolved
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.account_id = $1
              AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            GROUP BY s.inbox_id
            """,
            account_id,
        )
        hourly_rows = await conn.fetch(
            """
            SELECT 
                EXTRACT(hour FROM e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
                s.inbox_id,
                count(*) FILTER (WHERE e.event_type = 'created') AS created,
                count(*) FILTER (WHERE e.event_type = 'status_changed' AND e.to_value = 'resolved') AS resolved
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.account_id = $1
              AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND e.event_type IN ('created', 'status_changed')
            GROUP BY hour, s.inbox_id
            ORDER BY hour
            """,
            account_id,
        )

    created_total = sum(r["created"] for r in rows)
    resolved_total = sum(r["resolved"] for r in rows)

    channel_keys = [c["channel_key"] for c in channels] + ["other"]
    hourly_data = {}
    for r in hourly_rows:
        h = r["hour"]
        if h not in hourly_data:
            hourly_data[h] = {"hour": h, **{f"created_{k}": 0 for k in channel_keys}, "resolved": 0}

        channel = resolve_channel(r["inbox_id"], channels)
        hourly_data[h][f"created_{channel}"] += r["created"]
        hourly_data[h]["resolved"] += r["resolved"]

    hourly_list = list(hourly_data.values())
    hourly_list.sort(key=lambda x: x["hour"])

    agents_online = 0
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{CHATWOOT_URL}/api/v1/accounts/{user['account_id']}/agents",
                headers={"api_access_token": user["access_token"]},
            )
        if r.status_code == 200:
            agents_online = sum(1 for a in r.json() if a.get("availability_status") == "online")
    except httpx.RequestError:
        pass

    return {
        "created_today": created_total,
        "resolved_today": resolved_total,
        "agents_online": agents_online,
        "hourly": hourly_list,
    }
