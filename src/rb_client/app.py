import httpx
from fastapi import FastAPI, HTTPException, UploadFile

from rb_client.images import load_image
from rb_client.models import ModelInput, ModelOutput
from rb_client.openrouter import (
    OPENROUTER_API_KEY,
    OPENROUTER_AUTH_KEY_ENDPOINT,
    OPENROUTER_MODEL,
    REQUEST_LOG,
    VISION_PROMPT,
    call_openrouter,
)

app = FastAPI(title="robbin-hood backend")


@app.get("/")
async def root() -> dict:
    return {"status": "ok", "model": OPENROUTER_MODEL, "api_key_configured": bool(OPENROUTER_API_KEY)}


@app.get("/daily-limit")
async def daily_limit() -> dict:
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set. Add it to your .env file.",
        )

    headers: dict = {"Authorization": f"Bearer {OPENROUTER_API_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(OPENROUTER_AUTH_KEY_ENDPOINT, headers=headers)
            response.raise_for_status()
            data = response.json().get("data", {})
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid OpenRouter API key.") from exc
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch quota information ({exc.response.status_code})."
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch quota information: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse quota response: {exc}") from exc

    daily = data.get("free_model_daily_requests") or {}
    is_free = OPENROUTER_MODEL.endswith(":free")
    return {
        "is_free_tier": bool(data.get("is_free_tier")),
        "models": [
            {
                "model": OPENROUTER_MODEL,
                "tier": "free" if is_free else "paid",
                "daily_requests": {
                    "used": int(daily.get("used", 0)),
                    "limit": int(daily.get("limit", 0)),
                    "remaining": int(daily.get("remaining", 0)),
                },
                "shared_with_all_free_models": is_free,
            }
        ],
        "key_limit_usd": {
            "limit": data.get("limit"),
            "remaining": data.get("limit_remaining"),
        },
    }


@app.get("/history")
async def history() -> dict:
    return {"count": len(REQUEST_LOG), "requests": list(REQUEST_LOG)}


@app.post("/chat", response_model=ModelOutput)
async def chat(payload: ModelInput) -> ModelOutput:
    body: dict = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": payload.system or "You are a helpful assistant."},
            {"role": "user", "content": payload.prompt},
        ],
        "temperature": payload.temperature if payload.temperature is not None else 0.7,
    }
    return ModelOutput(response=await call_openrouter(body, mode="chat"))


@app.post("/analyze", response_model=ModelOutput)
async def analyze(image: UploadFile) -> ModelOutput:
    mime, encoded = await load_image(image)
    body: dict = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
                ],
            }
        ],
        "temperature": 0.2,
    }
    return ModelOutput(response=await call_openrouter(body, mode="vision"))