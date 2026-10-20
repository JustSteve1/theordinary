from kedro.pipeline import Pipeline, node

from .nodes import land_user1


def create_pipeline(**kwargs) -> Pipeline:
    return Pipeline(
        [
            node(
                func=land_user1,
                inputs=["params:land_target", "params:days", "params:user_email"],
                outputs="land_result",
                name="land_user1",
            )
        ]
    )
