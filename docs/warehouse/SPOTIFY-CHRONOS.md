# Spotify × Chronos (parked)

Chronos forecasts **the next values of a series**. It is for the Spotify concept (`experiments/concepts/spotify-mood-lift.json`), not for BARBARA’s marker.

Intended job, when we build it:

- Horizon: mood valence / energy at +60 minutes, and next-day `recall.richness` / `whoop.hrv_rmssd_ms`
- Inference stays in `europe-west2` (local weights, or a confirmed London endpoint)
- No call if that means a US or EU multi-region API
- Output is a forecast, then the existing estimator compares music vs control
- Chronos does not define a clinical label

Until a London path exists, use the same gate as TimesFM: record `unavailable_in_region` and do not copy the series elsewhere.
