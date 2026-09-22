from fastapi import APIRouter, Request, Depends, HTTPException
from typing import Optional
from auth import require_admin, get_account_id
from monitor_core import _validate_days_extended, get_channels, resolve_channel, get_team_names

router = APIRouter()


@router.get("/monitor/api/csat/summary")
async def csat_summary(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS total,
                avg(rating) AS avg_rating,
                count(*) FILTER (WHERE rating <= 2) AS dsat_count,
                count(*) FILTER (WHERE rating >= 4) AS csat_count
            FROM public.csat_survey_responses
            WHERE account_id = $2 AND created_at >= now() - make_interval(days => $1)
            """,
            days, account_id,
        )
        dist_rows = await conn.fetch(
            """
            SELECT rating, count(*) AS total
            FROM public.csat_survey_responses
            WHERE account_id = $2 AND created_at >= now() - make_interval(days => $1)
            GROUP BY rating
            """,
            days, account_id,
        )

    total = row["total"] or 0
    distribution = {str(i): 0 for i in range(1, 6)}
    for r in dist_rows:
        distribution[str(r["rating"])] = r["total"]

    return {
        "total": total,
        "avg_rating": row["avg_rating"],
        "csat_count": row["csat_count"] or 0,
        "dsat_count": row["dsat_count"] or 0,
        "csat_rate": (row["csat_count"] / total) if total else None,
        "dsat_rate": (row["dsat_count"] / total) if total else None,
        "distribution": distribution,
    }


@router.get("/monitor/api/csat/timeline")
async def csat_timeline(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
                avg(rating) AS avg_rating,
                count(*) AS total
            FROM public.csat_survey_responses
            WHERE account_id = $2 AND created_at >= now() - make_interval(days => $1)
            GROUP BY day ORDER BY day
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/csat/by-agent")
async def csat_by_agent(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.assigned_agent_id,
                max(u.name) AS assignee_name,
                count(*) AS total,
                avg(c.rating) AS avg_rating,
                count(*) FILTER (WHERE c.rating <= 2) AS dsat_count
            FROM public.csat_survey_responses c
            LEFT JOIN public.users u ON u.id = c.assigned_agent_id
            WHERE c.account_id = $2 AND c.created_at >= now() - make_interval(days => $1)
                AND c.assigned_agent_id IS NOT NULL
            GROUP BY c.assigned_agent_id
            ORDER BY avg_rating DESC
            """,
            days, account_id,
        )
    return [
        {
            "assigned_agent_id": r["assigned_agent_id"],
            "assignee_name": r["assignee_name"] or f"Agente #{r['assigned_agent_id']}",
            "total": r["total"],
            "avg_rating": r["avg_rating"],
            "dsat_count": r["dsat_count"],
        }
        for r in rows
    ]


@router.get("/monitor/api/csat/by-team")
async def csat_by_team(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        team_names = await get_team_names(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT conv.team_id,
                count(*) AS total,
                avg(c.rating) AS avg_rating,
                count(*) FILTER (WHERE c.rating <= 2) AS dsat_count
            FROM public.csat_survey_responses c
            JOIN public.conversations conv ON conv.id = c.conversation_id AND conv.account_id = c.account_id
            WHERE c.account_id = $2 AND c.created_at >= now() - make_interval(days => $1)
                AND conv.team_id IS NOT NULL
            GROUP BY conv.team_id
            """,
            days, account_id,
        )
    return [
        {
            "team_id": r["team_id"],
            "team_name": team_names.get(r["team_id"], f"Time {r['team_id']}"),
            "total": r["total"],
            "avg_rating": r["avg_rating"],
            "dsat_count": r["dsat_count"],
        }
        for r in rows
    ]


@router.get("/monitor/api/csat/by-channel")
async def csat_by_channel(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT conv.inbox_id,
                count(*) AS total,
                avg(c.rating) AS avg_rating,
                count(*) FILTER (WHERE c.rating <= 2) AS dsat_count
            FROM public.csat_survey_responses c
            JOIN public.conversations conv ON conv.id = c.conversation_id AND conv.account_id = c.account_id
            WHERE c.account_id = $2 AND c.created_at >= now() - make_interval(days => $1)
            GROUP BY conv.inbox_id
            """,
            days, account_id,
        )

    by_channel = {}
    for r in rows:
        channel = resolve_channel(r["inbox_id"], channels)
        b = by_channel.setdefault(channel, {"channel": channel, "total": 0, "rating_sum": 0, "dsat_count": 0})
        b["total"] += r["total"]
        b["rating_sum"] += (r["avg_rating"] or 0) * r["total"]
        b["dsat_count"] += r["dsat_count"]

    return [
        {
            "channel": b["channel"],
            "total": b["total"],
            "avg_rating": b["rating_sum"] / b["total"] if b["total"] else None,
            "dsat_count": b["dsat_count"],
        }
        for b in by_channel.values()
    ]


@router.get("/monitor/api/csat/responses")
async def csat_responses(
    request: Request,
    days: int = 30,
    rating: Optional[int] = None,
    assignee_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 50,
    user=Depends(require_admin),
    account_id: int = Depends(get_account_id),
):
    days = _validate_days_extended(days)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size

    where = ["c.account_id = $1", "c.created_at >= now() - make_interval(days => $2)"]
    params = [account_id, days]

    if rating is not None:
        params.append(rating)
        where.append(f"c.rating = ${len(params)}")
    if assignee_id is not None:
        params.append(assignee_id)
        where.append(f"c.assigned_agent_id = ${len(params)}")

    where_clause = "WHERE " + " AND ".join(where)

    query = f"""
        SELECT c.id, c.conversation_id, c.rating, c.feedback_message, c.created_at, c.assigned_agent_id,
            u.name AS assignee_name,
            conv.custom_attributes->>'assunto_motivo' AS subject,
            conv.priority, conv.inbox_id,
            ct.name AS contact_name,
            NULLIF(ct.additional_attributes->>'company_name', '') AS company_name,
            count(*) OVER() AS total_count
        FROM public.csat_survey_responses c
        LEFT JOIN public.users u ON u.id = c.assigned_agent_id
        LEFT JOIN public.conversations conv ON conv.id = c.conversation_id AND conv.account_id = c.account_id
        LEFT JOIN public.contacts ct ON ct.id = c.contact_id
        {where_clause}
        ORDER BY c.created_at DESC
        LIMIT {page_size} OFFSET {offset}
    """

    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(query, *params)

    total = rows[0]["total_count"] if rows else 0
    items = []
    for r in rows:
        d = dict(r)
        d.pop("total_count", None)
        d["channel"] = resolve_channel(d.pop("inbox_id"), channels)
        d["assignee_name"] = d["assignee_name"] or (f"Agente #{d['assigned_agent_id']}" if d["assigned_agent_id"] else "Não atribuído")
        items.append(d)

    return {"items": items, "total": total, "page": page, "page_size": page_size}
