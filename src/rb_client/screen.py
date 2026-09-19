"""Server-side screen grab (dev only).

Single source for screenshot bytes so the hotkey client (`capture.py`) and the
new `POST /analyze-screen` endpoint share logic.

Why server-side grab for web Phase 1:
- Browser `getDisplayMedia` forces a picker that steals focus and pauses
  fullscreen lectures. Backend `mss` grab needs no focus (same Windows machine).

Electron note (agreed):
- Packaged app will rewrite capture in Electron main via `desktopCapturer`
  (in-memory PNG -> POST sidecar) because it is faster than this Python
  roundtrip. This module stays for dev/test only and is excluded from packaging.
"""

import io

import mss
from PIL import Image


def capture_screenshot() -> bytes:
    """Grab the full virtual screen and return PNG bytes."""
    with mss.mss() as sct:
        # monitors[0] = virtual screen spanning all monitors.
        monitor = sct.monitors[0]
        frame = sct.grab(monitor)
        image = Image.frombytes("RGB", frame.size, frame.bgra, "raw", "BGRX")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
