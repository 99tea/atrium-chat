from fastapi import APIRouter, Request, Depends, HTTPException
from auth import get_current_user, require_developer

router = APIRouter()

MAX_SCREENSHOT_CHARS = 3_000_000  # ~2.2MB de imagem original em base64
ALLOWED_STATUSES = {"novo", "andamento", "finalizado"}


@router.post("/monitor/api/bugs")
async def create_bug_report(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    description = (body.get("description") or "").strip()
    if not description:
        raise HTTPException(400, "descrição é obrigatória")
    if len(description) > 300:
        raise HTTPException(400, "descrição deve ter no máximo 300 caracteres")

    screenshot = body.get("screenshot")
    if screenshot and len(screenshot) > MAX_SCREENSHOT_CHARS:
        raise HTTPException(400, "imagem muito grande")

    route = body.get("route")

    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO monitor.bug_reports (user_id, user_name, description, screenshot, route)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING id, user_id, user_name, description, screenshot, route, status, created_at
            """,
            user["id"], user["name"], description, screenshot, route,
        )
    return dict(row)


@router.get("/monitor/api/bugs")
async def list_bug_reports(request: Request, status: str = None, user=Depends(require_developer)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        if status and status in ALLOWED_STATUSES:
            rows = await conn.fetch(
                "SELECT * FROM monitor.bug_reports WHERE status = $1 ORDER BY created_at DESC",
                status,
            )
        else:
            rows = await conn.fetch("SELECT * FROM monitor.bug_reports ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.put("/monitor/api/bugs/{bug_id}")
async def update_bug_report(bug_id: int, request: Request, user=Depends(require_developer)):
    body = await request.json()
    status = body.get("status")
    if status not in ALLOWED_STATUSES:
        raise HTTPException(400, "status inválido")
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE monitor.bug_reports SET status = $1 WHERE id = $2 RETURNING id, status",
            status, bug_id,
        )
    if not row:
        raise HTTPException(404, "report não encontrado")
    return dict(row)


@router.delete("/monitor/api/bugs/{bug_id}")
async def delete_bug_report(bug_id: int, request: Request, user=Depends(require_developer)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM monitor.bug_reports WHERE id = $1", bug_id)
    return {"status": "ok"}
