-- Latest primary randomised estimate per experiment.
select
  experiment_id,
  version,
  feature_id,
  status,
  beta,
  p025,
  p10,
  p50,
  p90,
  p975,
  prob_positive,
  n_with_outcome,
  not_causal
from `the-ordinary-512212.ordinary_effects.effect_estimates_mrt`
where role = 'primary'
qualify row_number() over (partition by experiment_id, version order by computed_at desc) = 1;

-- Treated versus control means by week. This is descriptive, not the estimator.
select
  experiment_id,
  feature_id,
  date_trunc(decision_date, week) as week,
  avg(if(a = 1, y, null)) as treated_mean,
  avg(if(a = 0, y, null)) as control_mean,
  countif(y is not null) as n
from `the-ordinary-512212.ordinary_effects.analysis_frame`
where role = 'primary'
group by 1, 2, 3
order by 1, 3;

-- Observational dry run. Every row is an association, not a cause.
select
  experiment_id,
  feature_id,
  status,
  beta,
  p025,
  p975,
  prob_positive,
  n_with_outcome,
  not_causal
from `the-ordinary-512212.ordinary_effects.effect_estimates_observational`
order by experiment_id;

-- Synthetic proof. A should contain 4 and exclude 0. B should contain 0.
select experiment_id, status, beta, p025, p975, prob_positive, n_with_outcome
from `the-ordinary-512212.ordinary_effects_test.effect_estimates`
order by experiment_id;
