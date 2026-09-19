import os
import re
import time
from collections import deque
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "inclusionai/ling-3.0-flash-vl:free")
OPENROUTER_ENDPOINT = os.getenv("OPENROUTER_ENDPOINT", "https://openrouter.ai/api/v1/chat/completions")
OPENROUTER_AUTH_KEY_ENDPOINT = "https://openrouter.ai/api/v1/auth/key"

HISTORY_LIMIT = 100
REQUEST_LOG: deque[dict] = deque(maxlen=HISTORY_LIMIT)

VISION_PROMPT = (
    "Answer ONLY the question visible UNDERNEATH any overlay. "
    "Ignore any window titled RB Assistant, its status text, and its instructions. "
    "If it is multiple-choice, return the correct option and its answer. "
    "If technical or conceptual, give a concise answer. "
    "If a diagram is visible, use it for reasoning. "
    "Output answer only, no status, no template, no meta commentary. "
    'If no question is visible, return exactly: NO_QUESTION.'
)

# Sentinel for “no question found” — frontend maps this to friendly UI text.
NO_QUESTION = "NO_QUESTION"
_NO_QUESTION_RE = re.compile(r"^\s*NO_QUESTION\b", re.IGNORECASE)


def normalize_answer(text: str) -> str:
    """Collapse model variants (NO_QUESTION. / newline / 'Answer: NO_QUESTION') to sentinel."""
    if _NO_QUESTION_RE.match(text):
        return NO_QUESTION
    stripped = text.strip()
    return stripped if stripped else ""


def _request_format(body: dict) -> dict:
    messages: list[dict] = []
    for message in body.get("messages", []):
        content = message.get("content")
        if isinstance(content, str):
            messages.append(
                {"role": message.get("role"), "type": "text", "preview": content[:120]}
            )
        elif isinstance(content, list):
            has_image = any(
                isinstance(item, dict) and item.get("type") == "image_url" for item in content
            )
            text_parts = [
                str(item.get("text", ""))[:120]
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            messages.append(
                {
                    "role": message.get("role"),
                    "type": "vision" if has_image else "multipart",
                    "has_image": has_image,
                    "text_parts": text_parts,
                }
            )
    return {
        "model": body.get("model"),
        "temperature": body.get("temperature"),
        "messages": messages,
    }


def _record_request(
    *,
    mode: str,
    body: dict,
    status: str,
    duration_ms: int,
    response: str = "",
) -> None:
    REQUEST_LOG.append(
        {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "mode": mode,
            "status": status,
            "duration_ms": duration_ms,
            "request": _request_format(body),
            "response_preview": response[:500],
        }
    )


def extract_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            error = data.get("error")
            if isinstance(error, dict):
                return str(error.get("message", ""))
            if isinstance(error, str):
                return error
            return str(data)
    except Exception:
        pass
    return str(response.text)


def extract_text(data: object) -> str | None:
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message")
            if isinstance(message, dict) and message.get("content"):
                return str(message["content"])
        if "response" in data:
            return str(data["response"])
        if "generated_text" in data:
            return str(data["generated_text"])
        if "text" in data:
            return str(data["text"])
        if "output" in data:
            return str(data["output"])
    return None


async def call_openrouter(body: dict, *, mode: str = "chat") -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set. Add it to your .env file.",
        )

    headers: dict = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "robbin-hood",
    }

    start = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(OPENROUTER_ENDPOINT, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        detail = extract_error_detail(exc.response)
        duration_ms = int((time.perf_counter() - start) * 1000)
        _record_request(
            mode=mode,
            body=body,
            status=f"http:{status}",
            duration_ms=duration_ms,
            response=f"HTTP {status}: {detail[:200]}",
        )
        if status == 401:
            raise HTTPException(status_code=401, detail="Invalid OpenRouter API key.") from exc
        if status == 429:
            raise HTTPException(status_code=429, detail="OpenRouter rate limit exceeded.") from exc
        if status == 400 and "image" in detail.lower():
            raise HTTPException(
                status_code=400,
                detail="The configured model does not support image input. Set OPENROUTER_MODEL to a vision model.",
            ) from exc
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed ({status}).") from exc
    except httpx.TimeoutException as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        _record_request(
            mode=mode, body=body, status="timeout", duration_ms=duration_ms, response="OpenRouter request timed out."
        )
        raise HTTPException(status_code=504, detail="OpenRouter request timed out.") from exc
    except httpx.HTTPError as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        _record_request(
            mode=mode, body=body, status="http-error", duration_ms=duration_ms, response=f"{exc}"[:200]
        )
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}") from exc
    except Exception as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        _record_request(
            mode=mode, body=body, status="parse-error", duration_ms=duration_ms, response=f"{exc}"[:200]
        )
        raise HTTPException(status_code=500, detail=f"Failed to parse OpenRouter response: {exc}") from exc

    text = extract_text(data)
    duration_ms = int((time.perf_counter() - start) * 1000)
    if text is None:
        _record_request(
            mode=mode,
            body=body,
            status="parse-error",
            duration_ms=duration_ms,
            response="Model response did not contain usable text.",
        )
        raise HTTPException(status_code=500, detail="Model response did not contain usable text.")
    clean = normalize_answer(str(text))
    _record_request(mode=mode, body=body, status="ok", duration_ms=duration_ms, response=clean)
    return clean