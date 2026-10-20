from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_prod_queries_omit_payload_and_speech():
    catalog = yaml.safe_load((ROOT / "conf" / "prod" / "catalog.yml").read_text())
    for name, dataset in catalog.items():
        sql = dataset["sql"].lower()
        selected = sql.split("from", 1)[0]
        for banned in ("payload", "talk_text", " summary", "short_summary", "transcript"):
            assert banned not in selected
        assert "limit 100" in sql
        assert dataset["load_args"]["location"] == "europe-west2"
        assert name.startswith("whoop_") or name.startswith("bee_")


def test_dev_parameters_do_not_land_in_london():
    dev = yaml.safe_load((ROOT / "conf" / "dev" / "parameters.yml").read_text())
    prod = yaml.safe_load((ROOT / "conf" / "prod" / "parameters.yml").read_text())
    assert dev["land_target"] == "dev"
    assert prod["land_target"] == "prod"
