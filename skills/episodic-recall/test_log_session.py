import json
import math
import unittest

from log_session import Refusal, log_session


def prior(composite, flag="within_range", poor=False, unwell=False, aborted=False):
    mean = 70.0
    return {
        "aborted": aborted,
        "composite": composite,
        "confounders": {"poor_sleep": poor, "unwell_or_alcohol": unwell},
        "trend": {
            "n_prior": 5,
            "n_prior_clean": 5,
            "baseline_mean": mean,
            "baseline_sd": 2.0,
            "z": 0.0,
            "flag": flag,
        },
    }


def base(**overrides):
    payload = {
        "id": "832f03cf-af5a-49fc-880e-646be925ebfa",
        "recorded_at": "2026-10-18T09:12:03Z",
        "date": "2026-10-17",
        "window": "afternoon",
        "aborted": False,
        "composite": 71.2,
        "core_recall": 0.83,
        "detail_recall": 0.33,
        "intrusion_rate": 0.12,
        "confounders": {"poor_sleep": False, "unwell_or_alcohol": False},
        "prior": [],
    }
    payload.update(overrides)
    return payload


class LogSessionTest(unittest.TestCase):
    def test_refuses_transcript_fields(self):
        payload = base()
        payload["narrative"] = "walked to the station"
        with self.assertRaises(Refusal):
            log_session(payload)

    def test_refuses_words_nested_in_prior(self):
        payload = base(prior=[prior(70)])
        payload["prior"][0]["answers"] = [{"answer": "pasta"}]
        with self.assertRaises(Refusal):
            log_session(payload)

    def test_baseline_still_building(self):
        record = log_session(base(prior=[prior(70), prior(68), prior(72)]))
        self.assertEqual(record["trend"]["flag"], "insufficient_baseline")
        self.assertEqual(record["trend"]["n_prior"], 3)
        self.assertEqual(record["trend"]["n_prior_clean"], 3)
        self.assertIsNone(record["trend"]["z"])
        self.assertNotIn("narrative", json.dumps(record))

    def test_flat_baseline_is_within_range(self):
        record = log_session(base(composite=80, prior=[prior(70)] * 5))
        self.assertEqual(record["trend"]["flag"], "within_range")
        self.assertEqual(record["trend"]["baseline_mean"], 70)
        self.assertEqual(record["trend"]["baseline_sd"], 0)
        self.assertEqual(record["trend"]["z"], 0)
        self.assertEqual(record["trend"]["n_prior"], 5)

    def test_spread_matches_the_app_baseline(self):
        scores = [60, 70, 80, 65, 75]
        record = log_session(base(composite=85, prior=[prior(score) for score in scores]))
        mean = 70
        sd = math.sqrt(50)
        self.assertEqual(record["trend"]["baseline_mean"], 70)
        self.assertEqual(record["trend"]["baseline_sd"], math.floor(sd * 100 + 0.5) / 100)
        self.assertEqual(
            record["trend"]["z"],
            math.floor(((85 - mean) / sd) * 100 + 0.5) / 100,
        )
        self.assertEqual(record["trend"]["flag"], "above_range")

    def test_second_dip_asks_for_review(self):
        earlier = [prior(70)] * 4 + [prior(40, flag="below_range")]
        record = log_session(base(composite=40, prior=earlier))
        self.assertEqual(record["trend"]["flag"], "review_suggested")

    def test_confounders_stay_out_of_the_baseline(self):
        prior_rows = [prior(70)] * 4 + [prior(10, poor=True)]
        record = log_session(base(composite=70, prior=prior_rows))
        self.assertEqual(record["trend"]["n_prior"], 5)
        self.assertEqual(record["trend"]["n_prior_clean"], 4)
        self.assertEqual(record["trend"]["flag"], "insufficient_baseline")

    def test_no_score_keeps_counts_only(self):
        record = log_session(base(composite=None, prior=[prior(70)] * 2))
        self.assertIsNone(record["composite"])
        self.assertEqual(record["trend"]["flag"], "insufficient_baseline")
        self.assertEqual(record["trend"]["n_prior"], 2)


if __name__ == "__main__":
    unittest.main()
