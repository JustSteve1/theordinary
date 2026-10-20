"""Call the TypeScript WHOOP sync and warehouse export. Dev refuses to run."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

WRITER = "ordinary-vercel-writer@the-ordinary-512212.iam.gserviceaccount.com"
REFUSAL = (
    "land_user1 writes ordinary_raw in London. "
    "Run: kedro run --env=prod --pipelines=land_user1"
)


def land_user1(land_target: str, days: int, user_email: str) -> dict:
    if land_target != "prod":
        raise RuntimeError(REFUSAL)
    return _run_typescript(int(days), user_email or "")


def _run_typescript(days: int, user_email: str) -> dict:
    root = _repo_root()
    env = os.environ.copy()
    env["WAREHOUSE_LAND"] = "prod"
    env["BQ_LOCATION"] = "europe-west2"
    env["GCP_PROJECT_ID"] = env.get("GCP_PROJECT_ID") or "the-ordinary-512212"
    env["WAREHOUSE_IMPERSONATE"] = env.get("WAREHOUSE_IMPERSONATE") or WRITER
    if user_email.strip():
        env["USER1_EMAIL"] = user_email.strip()
    command = [
        "pnpm",
        "exec",
        "tsx",
        "scripts/warehouse-land-user1.ts",
        str(days),
        env.get("USER1_EMAIL", ""),
    ]
    completed = subprocess.run(
        command,
        cwd=root,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = _redact(completed.stderr or completed.stdout or "Landing failed.")
        raise RuntimeError(detail.strip())
    for line in reversed(completed.stdout.splitlines()):
        if line.startswith("LAND_RESULT "):
            return json.loads(line.removeprefix("LAND_RESULT "))
    raise RuntimeError("The TypeScript landing command did not report a result.")


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-lock.yaml").exists() and (parent / "warehouse").is_dir():
            return parent
    raise RuntimeError("Could not find the Ordinary repository root.")


def _redact(text: str) -> str:
    return re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+", "[redacted-url]", text)
