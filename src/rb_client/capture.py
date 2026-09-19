import os
import threading
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pynput import keyboard

from rb_client.screen import capture_screenshot

load_dotenv(Path(__file__).resolve().parent / ".env")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
VISION_HOTKEY = os.getenv("VISION_HOTKEY", "<shift>+<space>")


def _cooldown_seconds() -> float:
    """Garbage env (e.g. COOLDOWN_SECONDS=abc) must not crash client at import."""
    try:
        return float(os.getenv("COOLDOWN_SECONDS", "2"))
    except (TypeError, ValueError):
        return 2.0


COOLDOWN_SECONDS = _cooldown_seconds()

_lock = threading.Lock()
_last_trigger = 0.0


def post_image(path: str) -> None:
    separator = "=" * 60
    try:
        data = capture_screenshot()
    except Exception as exc:
        print(f"\n[ERROR] Screenshot failed: {exc}")
        return

    print(f"\nCaptured {len(data) / 1024:.0f} KB screenshot -> {path}...")
    print(separator)

    try:
        response = httpx.post(
            f"{BACKEND_URL}{path}",
            files={"image": ("capture.png", data, "image/png")},
            headers={"X-RB-Client": "hotkey"},  # anti-CSRF guard (see app.py)
            timeout=180.0,
        )
    except httpx.ConnectError:
        print("[ERROR] Could not reach the backend. Is it running on", BACKEND_URL, "?")
        print(separator)
        return
    except httpx.TimeoutException:
        print("[ERROR] Backend timed out.")
        print(separator)
        return
    except httpx.HTTPError as exc:
        print(f"[ERROR] Request failed: {exc}")
        print(separator)
        return

    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        print(f"[ERROR {response.status_code}] {detail}")
        print(separator)
        return

    try:
        answer = response.json().get("response", "")
    except Exception:
        answer = response.text

    print(answer)
    print(separator)


def trigger() -> None:
    global _last_trigger
    with _lock:
        now = time.monotonic()
        if now - _last_trigger < COOLDOWN_SECONDS:
            print("[SKIP] Ignoring repeat trigger (cooldown).")
            return
        _last_trigger = now
    post_image("/analyze")


def main() -> None:
    hotkeys = {
        VISION_HOTKEY: trigger,
    }
    listener = keyboard.GlobalHotKeys(hotkeys)
    print("Listening. Global hotkeys active.")
    print(f"  {VISION_HOTKEY}  -> vision analysis (screenshot)")
    print(f"Backend: {BACKEND_URL}")
    print("Press Ctrl+C to exit.")

    try:
        listener.start()
        listener.join()
    except KeyboardInterrupt:
        print("\nStopping listener...")
        listener.stop()


if __name__ == "__main__":
    main()