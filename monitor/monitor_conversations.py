from fastapi import APIRouter, Request, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
from auth import get_current_user, get_account_id
from monitor_core import get_inbox_channel_map, resolve_channel
import httpx
import os

router = APIRouter()

CHATWOOT_URL = os.environ["CHATWOOT_URL"]

ALLOWED_SORT = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "priority": "priority",
    "sla_deadline": "sla_deadline",
}


@router.get("/monitor/api/conversations")
async def list_conversations(
    request: Request,
    status: str = "open",
    label: Optional[str] = None,
    assignee_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = "sla_deadline",
    sort_dir: str = "asc",
    page: int = 1,
    page_size: int = 50,
    user=Depends(get_current_user),
    account_id: int = Depends(get_account_id),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size
    sort_col = ALLOWED_SORT.get(sort_by, "sla_deadline")
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where = ["cs.account_id = $1"]
    params = [account_id]

    if status == "cancelled":
        where.append("cs.status = 'resolved' AND cs.excluded_from_metrics = true")
    elif status != "all":
        params.append(status)
        where.append(f"cs.status = ${len(params)}")

    if label:
        params.append(label)
        where.append(f"${len(params)} = ANY(cs.labels)")

    if assignee_id:
        params.append(assignee_id)
        where.append(f"cs.assignee_id = ${len(params)}")

    if search:
        params.append(f"%{search}%")
        idx = len(params)
        where.append(f"(cs.contact_name ILIKE ${idx} OR cs.company_name ILIKE ${idx} OR cs.subject ILIKE ${idx})")

    where_clause = "WHERE " + " AND ".join(where)

    query = f"""
        WITH base AS (
            SELECT cs.conversation_id, cs.inbox_id, cs.status, cs.priority, cs.subject,
                cs.contact_name, cs.company_name, cs.assignee_name, cs.team_id, cs.labels,
                cs.updated_at, cs.excluded_from_metrics, l.created_at,
                v.first_response_minutes, v.resolution_minutes, v.target_resolution_minutes, v.last_resolved_at,
                pt.resolution_minutes AS target_minutes,
                CASE
                    WHEN cs.status = 'resolved' THEN NULL
                    ELSE l.created_at + (pt.resolution_minutes || ' minutes')::interval
                END AS sla_deadline,
                CASE
                    WHEN cs.status = 'resolved' AND v.resolution_minutes IS NOT NULL THEN
                        CASE WHEN v.resolution_minutes > v.target_resolution_minutes THEN 'late' ELSE 'on_time' END
                    WHEN cs.status = 'resolved' THEN 'unknown'
                    WHEN l.created_at + (pt.resolution_minutes || ' minutes')::interval < now() THEN 'late'
                    ELSE 'on_time'
                END AS sla_status
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_conversation_lifecycle l ON l.conversation_id = cs.conversation_id
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            LEFT JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(cs.priority, 'none') AND pt.account_id = cs.account_id
            {where_clause}
        )
        SELECT *, count(*) OVER() AS total_count
        FROM base
        ORDER BY {sort_col} {sort_dir} NULLS LAST
        LIMIT {page_size} OFFSET {offset}
    """

    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(query, *params)

    total = rows[0]["total_count"] if rows else 0
    items = []
    for r in rows:
        d = dict(r)
        d.pop("total_count", None)
        d["channel"] = resolve_channel(d["inbox_id"], whatsapp_ids, email_ids)
        d["minutes_remaining"] = (
            None if d["sla_deadline"] is None
            else (d["sla_deadline"] - datetime.now(timezone.utc)).total_seconds() / 60
        )
        items.append(d)

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/monitor/api/conversations/labels")
async def conversations_labels(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT label
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE cs.account_id = $1 AND label IS NOT NULL
            ORDER BY label
            """,
            account_id,
        )
    return [r["label"] for r in rows]


@router.get("/monitor/api/conversations/{conversation_id}/notes")
async def conversation_notes(conversation_id: int, request: Request, user=Depends(get_current_user)):
    account_id = user["account_id"]
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{CHATWOOT_URL}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages",
            headers={"api_access_token": user["access_token"]},
        )
    if r.status_code != 200:
        raise HTTPException(502, "falha ao consultar notas no Chatwoot")

    data = r.json()
    messages = data.get("payload", data) if isinstance(data, dict) else data

    notes = [
        {
            "content": m.get("content"),
            "sender_name": (m.get("sender") or {}).get("name") or "Sistema",
            "created_at": m.get("created_at"),
        }
        for m in messages
        if m.get("private") and m.get("content")
    ]
    notes.sort(key=lambda n: n["created_at"] or 0, reverse=True)
    return notes
