"""Frozen sidecar entry for Electron packaging.

Electron main spawns `rb-server.exe --port 8000` from resources/sidecar.
Dev still uses `uv run fastapi dev`; this is only for the packaged app.
"""

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="RB Assistant sidecar backend")
    parser.add_argument("--port", type=int, default=8000, help="localhost port")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (keep loopback)")
    args = parser.parse_args()
    uvicorn.run("rb_client.app:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
