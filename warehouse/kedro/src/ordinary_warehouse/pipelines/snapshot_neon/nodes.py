"""Read a non-speech status row from Neon and leave raw WHOOP and Bee frames local.

WHOOP payloads and Bee items are fetched by the TypeScript landing command.
This node never writes BigQuery and never selects tokens or talk text.
"""

from __future__ import annotations

import os
import re

import pandas as pd
import psycopg

from ordinary_warehouse.columns import (
    BEE_ACTIVITY_COLUMNS,
    BEE_DAILY_COLUMNS,
    WHOOP_COLUMNS,
    empty_frame,
)

REFUSAL = (
    "snapshot_neon writes local parquet and does not run against the prod catalog. "
    "To read London rows: kedro run --env=prod --pipelines=sample_raw"
)


def snapshot_neon(snapshot_source: str, land_target: str, user_email: str) -> dict[str, pd.DataFrame]:
    if land_target == "prod":
        raise RuntimeError(REFUSAL)
    frames = {
        "whoop_cycle": empty_frame(WHOOP_COLUMNS),
        "whoop_recovery": empty_frame(WHOOP_COLUMNS),
        "whoop_sleep": empty_frame(WHOOP_COLUMNS),
        "whoop_workout": empty_frame(WHOOP_COLUMNS),
        "bee_activity": empty_frame(BEE_ACTIVITY_COLUMNS),
        "bee_daily": empty_frame(BEE_DAILY_COLUMNS),
        "neon_status": _status(snapshot_source, user_email),
    }
    return frames


def _status(snapshot_source: str, user_email: str) -> pd.DataFrame:
    columns = ["health_consent", "health_accepted_at", "whoop_connected", "bee_account_token"]
    if snapshot_source != "neon":
        return empty_frame(columns)
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("snapshot_source is neon, and DATABASE_URL is not set.")
    email = (user_email or os.environ.get("USER1_EMAIL") or "").strip()
    if not email:
        raise RuntimeError("Set parameters user_email or USER1_EMAIL.")
    query = """
        select
          (c.health_accepted_at is not null) as health_consent,
          c.health_accepted_at,
          exists (
            select 1 from connections k
            where k.user_id = m.id and k.provider = 'whoop'
          ) as whoop_connected,
          exists (
            select 1 from integration_secrets s
            where s.user_id = m.id and s.provider = 'bee' and s.name = 'access_token'
          ) as bee_account_token
        from members m
        left join consents c on c.user_id = m.id
        where m.email = %s
        limit 1
    """
    try:
        with psycopg.connect(url) as connection, connection.cursor() as cursor:
            cursor.execute(query, (email,))
            rows = cursor.fetchall()
            names = [desc.name for desc in cursor.description or []]
    except Exception as error:
        message = re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+", "[redacted-url]", str(error))
        raise RuntimeError(message) from None
    frame = pd.DataFrame(rows, columns=names)
    if frame.empty:
        raise RuntimeError("No member matches USER1_EMAIL.")
    return frame.loc[:, columns]
