"""Tests for POST /analyze-screen (server-side grab -> vision)."""

import io

from fastapi.testclient import TestClient
from PIL import Image

import rb_client.app as app_module
from rb_client import openrouter


def _png_bytes(size: tuple[int, int] = (64, 48)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


def _client(monkeypatch, answer: str = "mock answer") -> TestClient:
    # Avoid real screen grab + real OpenRouter call.
    # Endpoint does `from rb_client.screen import capture_screenshot` lazily,
    # so patch rb_client.screen.
    import rb_client.screen as screen_module

    monkeypatch.setattr(screen_module, "capture_screenshot", lambda: _png_bytes())

    async def fake_call(body: dict, *, mode: str = "vision") -> str:
        assert body["model"]
        assert mode == "vision"
        return answer

    monkeypatch.setattr(openrouter, "call_openrouter", fake_call)
    monkeypatch.setattr(app_module, "call_openrouter", fake_call)
    return TestClient(app_module.app)


def test_analyze_screen_ok(monkeypatch) -> None:
    client = _client(monkeypatch)
    resp = client.post("/analyze-screen", headers={"X-RB-Client": "web"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"response": "mock answer"}


def test_analyze_screen_missing_header_403(monkeypatch) -> None:
    client = _client(monkeypatch)
    resp = client.post("/analyze-screen")
    assert resp.status_code == 403


def test_analyze_screen_grab_failure_500(monkeypatch) -> None:
    import rb_client.screen as screen_module

    def boom() -> bytes:
        raise RuntimeError("no display")

    monkeypatch.setattr(screen_module, "capture_screenshot", boom)
    client = TestClient(app_module.app)
    resp = client.post("/analyze-screen", headers={"X-RB-Client": "web"})
    assert resp.status_code == 500
    assert "Screenshot failed" in resp.json()["detail"]


def test_vision_prompt_answer_only() -> None:
    from rb_client.openrouter import NO_QUESTION, VISION_PROMPT

    assert "NO_QUESTION" in VISION_PROMPT
    assert "RB Assistant" in VISION_PROMPT
    assert "Output answer only" in VISION_PROMPT
    assert NO_QUESTION == "NO_QUESTION"


def test_normalize_answer_variants() -> None:
    from rb_client.openrouter import normalize_answer

    assert normalize_answer("NO_QUESTION.") == "NO_QUESTION"
    assert normalize_answer("  NO_QUESTION\nmore") == "NO_QUESTION"
    assert normalize_answer("Answer: 42") == "Answer: 42"


def test_analyze_missing_header_403(monkeypatch) -> None:
    client = _client(monkeypatch)
    resp = client.post(
        "/analyze",
        files={"image": ("capture.png", _png_bytes(), "image/png")},
    )
    assert resp.status_code == 403


def test_analyze_ok_with_header(monkeypatch) -> None:
    client = _client(monkeypatch)
    resp = client.post(
        "/analyze",
        files={"image": ("capture.png", _png_bytes(), "image/png")},
        headers={"X-RB-Client": "web"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"response": "mock answer"}
