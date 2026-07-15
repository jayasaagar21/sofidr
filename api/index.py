"""Vercel serverless entrypoint — the ONLY function in this deployment.

All Python lives in /server, deliberately outside /api: Vercel turns every
.py file under /api into its own serverless function, so keeping the sofidr
and dq packages in here would spawn a dozen junk functions and bloat the
bundle. `includeFiles` in vercel.json ships /server alongside this file.

Vercel's Python runtime detects the module-level `app` as an ASGI application.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "server"))

from main import app  # noqa: E402,F401  — re-exported for the runtime to find
