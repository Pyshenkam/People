"""PyInstaller entry point — must live outside the `app` package
so that relative imports inside the package resolve correctly."""

import sys
import os
import uvicorn

if getattr(sys, "frozen", False):
    # Running as a PyInstaller bundle: set cwd to the exe directory
    os.chdir(os.path.dirname(sys.executable))

from app.main import app  # noqa: E402  — absolute import, keeps package context

if __name__ == "__main__":
    port = int(os.getenv("MUSEUM_PORT", "4800"))
    uvicorn.run(app, host="127.0.0.1", port=port)
