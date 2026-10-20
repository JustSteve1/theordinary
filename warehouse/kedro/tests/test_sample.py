import re
from pathlib import Path

import pandas as pd

from ordinary_warehouse.columns import BANNED, WHOOP_COLUMNS, clean_sample
from ordinary_warehouse.pipelines.land_user1.nodes import REFUSAL, land_user1
from ordinary_warehouse.pipelines.snapshot_neon.nodes import REFUSAL as SNAPSHOT_REFUSAL
from ordinary_warehouse.pipelines.snapshot_neon.nodes import snapshot_neon


def test_sample_drops_speech_payload_and_caps_rows():
    rows = pd.DataFrame(
        {
            "member_key": [f"m{i}" for i in range(120)],
            "record_id": [str(i) for i in range(120)],
            "payload": ["{}" for _ in range(120)],
            "talk_text": ["hello" for _ in range(120)],
            "summary": ["spoken" for _ in range(120)],
            "note_text": ["x" for _ in range(120)],
            "score_state": ["SCORED" for _ in range(120)],
            "kind": ["conversation " * 30 for _ in range(120)],
        }
    )
    sample = clean_sample(rows, WHOOP_COLUMNS)
    assert len(sample) == 100
    assert "payload" not in sample.columns
    assert "talk_text" not in sample.columns
    assert "summary" not in sample.columns
    assert "note_text" not in sample.columns
    assert sample["kind"].isna().all()
    assert list(sample["member_key"]) == [f"m{i}" for i in range(100)]


def test_banned_columns_match_the_typescript_firewall():
    firewall = Path(__file__).resolve().parents[3] / "src/platform/warehouse/firewall.ts"
    text = firewall.read_text()
    start = text.index("const BANNED = new Set([")
    end = text.index("]);", start)
    quoted = set(re.findall(r'"([^"]+)"', text[start:end]))
    assert quoted == BANNED


def test_land_user1_refuses_dev():
    try:
        land_user1("dev", 30, "person@example.com")
    except RuntimeError as error:
        assert str(error) == REFUSAL
    else:
        raise AssertionError("dev landing should refuse")


def test_snapshot_refuses_prod_and_empty_source_skips_neon():
    try:
        snapshot_neon("empty", "prod", "")
    except RuntimeError as error:
        assert str(error) == SNAPSHOT_REFUSAL
    else:
        raise AssertionError("prod snapshot should refuse")

    frames = snapshot_neon("empty", "dev", "")
    assert list(frames["whoop_cycle"].columns) == WHOOP_COLUMNS
    assert frames["whoop_cycle"].empty
    assert frames["bee_activity"].empty
    assert frames["neon_status"].empty
