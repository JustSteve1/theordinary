from kedro.pipeline import Pipeline, node

from .nodes import snapshot_neon


def create_pipeline(**kwargs) -> Pipeline:
    return Pipeline(
        [
            node(
                func=snapshot_neon,
                inputs=["params:snapshot_source", "params:land_target", "params:user_email"],
                outputs={
                    "whoop_cycle": "whoop_cycle",
                    "whoop_recovery": "whoop_recovery",
                    "whoop_sleep": "whoop_sleep",
                    "whoop_workout": "whoop_workout",
                    "bee_activity": "bee_activity",
                    "bee_daily": "bee_daily",
                    "neon_status": "neon_status",
                },
                name="snapshot_neon",
            )
        ]
    )
