from fastapi import APIRouter, Request, Response, Depends, HTTPException
from itsdangerous import URLSafeTimedSerializer, BadSignature
import httpx
import os

router = APIRouter()
SECRET_KEY = os.environ["MONITOR_SECRET_KEY"]
serializer = URLSafeTimedSerializer(SECRET_KEY)
COOKIE_NAME = "monitor_session"
CHATWOOT_URL = os.environ["CHATWOOT_URL"]


async def get_current_user(request: Request):
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise HTTPException(401, "not authenticated")
    try:
        return serializer.loads(cookie, max_age=60 * 60 * 12)
    except BadSignature:
        raise HTTPException(401, "invalid session")


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "administrator":
        raise HTTPException(403, "forbidden")
    return user


@router.post("/monitor/api/login")
async def login(request: Request, response: Response):
    body = await request.json()
    token = body.get("access_token")
    email = (body.get("email") or "").strip().lower()
    if not token or not email:
        raise HTTPException(400, "email e access_token são obrigatórios")
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{CHATWOOT_URL}/api/v1/profile", headers={"api_access_token": token})
    if r.status_code != 200:
        raise HTTPException(401, "token inválido")
    profile = r.json()
    if (profile.get("email") or "").strip().lower() != email:
        raise HTTPException(401, "email não corresponde ao token")
    account = (profile.get("accounts") or [{}])[0]
    session_data = {"id": profile["id"], "name": profile["name"], "role": account.get("role", "agent"), "account_id": account.get("id"), "access_token": token}
    response.set_cookie(COOKIE_NAME, serializer.dumps(session_data), httponly=True, samesite="lax", max_age=60 * 60 * 12)
    return {"id": session_data["id"], "name": session_data["name"], "role": session_data["role"], "account_id": session_data["account_id"]}

@router.post("/monitor/api/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@router.get("/monitor/api/me")
async def me(user=Depends(get_current_user)):
    return {"id": user["id"], "name": user["name"], "role": user["role"], "account_id": user["account_id"]}
