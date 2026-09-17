import io
import os
import sys
import threading
import time
from pathlib import Path

import httpx
import mss
from dotenv import load_dotenv
from pynput import keyboard
from PIL import Image

load_dotenv(Path(__file__).resolve().parent / ".env")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
VISION_HOTKEY = os.getenv("VISION_HOTKEY", "<shift>+<space>")
OCR_HOTKEY = os.getenv("OCR_HOTKEY", "<alt>+o")
COOLDOWN_SECONDS = float(os.getenv("COOLDOWN_SECONDS", "2"))

_lock = threading.Lock()
_last_trigger = 0.0


def capture_screenshot() -> bytes:
    with mss.mss() as sct:
        monitor = sct.monitors[0]
        frame = sct.grab(monitor)
        image = Image.frombytes("RGB", frame.size, frame.bgra, "raw", "BGRX")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def post_image(path: str, endpoint: str) -> None:
    separator = "=" * 60
    try:
        data = capture_screenshot()
    except Exception as exc:
        print(f"\n[ERROR] Screenshot failed: {exc}")
        return

    print(f"\nCaptured {len(data) / 1024:.0f} KB screenshot -> {endpoint}...")
    print(separator)

    try:
        response = httpx.post(f"{BACKEND_URL}{endpoint}", files={"image": ("capture.png", data, "image/png")}, timeout=180.0)
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


def trigger(endpoint: str) -> None:
    global _last_trigger
    with _lock:
        now = time.monotonic()
        if now - _last_trigger < COOLDOWN_SECONDS:
            print("[SKIP] Ignoring repeat trigger (cooldown).")
            return
        _last_trigger = now
    post_image(endpoint, endpoint)


def main() -> None:
    hotkey_lower = VISION_HOTKEY.lower()
    if sys.platform == "win32" and ("alt" in hotkey_lower and "space" in hotkey_lower):
        print("NOTE: Alt+Space is Windows' system menu shortcut — it may open a menu; change VISION_HOTKEY in client/.env if you dislike it.")

    hotkeys = {
        VISION_HOTKEY: lambda: trigger("/analyze"),
        OCR_HOTKEY: lambda: trigger("/ocr"),
    }
    listener = keyboard.GlobalHotKeys(hotkeys)
    print("Listening. Global hotkeys active.")
    print(f"  {VISION_HOTKEY}  -> vision analysis (screenshot)")
    print(f"  {OCR_HOTKEY}  -> OCR (screenshot)")
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