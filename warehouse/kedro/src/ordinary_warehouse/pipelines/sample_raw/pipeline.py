from kedro.pipeline import Pipeline, node

from .nodes import sample_whoop_and_bee


def create_pipeline(**kwargs) -> Pipeline:
    return Pipeline(
        [
            node(
                func=sample_whoop_and_bee,
                inputs=[
                    "whoop_cycle",
                    "whoop_recovery",
                    "whoop_sleep",
                    "whoop_workout",
                    "bee_activity",
                    "bee_daily",
                ],
                outputs={
                    "whoop_cycle_sample": "whoop_cycle_sample",
                    "whoop_recovery_sample": "whoop_recovery_sample",
                    "whoop_sleep_sample": "whoop_sleep_sample",
                    "whoop_workout_sample": "whoop_workout_sample",
                    "bee_activity_sample": "bee_activity_sample",
                    "bee_daily_sample": "bee_daily_sample",
                },
                name="sample_whoop_and_bee",
            )
        ]
    )
