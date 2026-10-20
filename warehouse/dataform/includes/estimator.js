// Same weighted, centred intent-to-treat formula as
// src/platform/warehouse/estimator.ts. Bootstrap draws use FARM_FINGERPRINT,
// which is what BigQuery can do deterministically. The TypeScript test uses
// a stand-in hash and checks the formula, not this fingerprint.

function estimateSql(source, options = {}) {
  const notCausal = options.notCausal ? "true" : "false";
  const gitSha = String(options.gitSha || "local").replaceAll("'", "");
  return `
with source_rows as (
  select * from ${source}
),
keys as (
  select
    experiment_id,
    version,
    feature_id,
    any_value(role) as role,
    any_value(direction) as direction,
    count(*) as n_decisions,
    countif(y is not null and p > 0 and p < 1) as n_with_outcome,
    countif(y is not null and a = 1) as n_treated,
    avg(if(a = 1 and y is not null, y, null)) as mean_treated,
    avg(if(a = 0 and y is not null, y, null)) as mean_control,
    safe_divide(countif(a = 1 and response = 'done'), nullif(countif(a = 1 and y is not null), 0)) as adherence
  from source_rows
  group by 1, 2, 3
),
usable as (
  select * from source_rows
  where y is not null and p > 0 and p < 1
),
stats as (
  select experiment_id, version, feature_id, avg(p) as p_tilde
  from usable
  group by 1, 2, 3
),
weighted as (
  select
    u.*,
    s.p_tilde,
    if(u.a = 1, safe_divide(s.p_tilde, u.p), safe_divide(1 - s.p_tilde, 1 - u.p)) as w
  from usable u
  join stats s using (experiment_id, version, feature_id)
),
centred as (
  select
    *,
    y - safe_divide(
      sum(w * y) over (partition by experiment_id, version, feature_id, member_key),
      sum(w) over (partition by experiment_id, version, feature_id, member_key)
    ) as y_c
  from weighted
),
point as (
  select
    experiment_id,
    version,
    feature_id,
    safe_divide(sum(w * (a - p_tilde) * y_c), sum(w * pow(a - p_tilde, 2))) as beta_raw
  from centred
  group by 1, 2, 3
),
reps as (
  select rep from unnest(generate_array(1, 2000)) as rep
),
blocks as (
  select distinct experiment_id, version, feature_id, block_id from centred
),
draw_weights as (
  select
    b.experiment_id,
    b.version,
    b.feature_id,
    b.block_id,
    r.rep,
    -ln((mod(abs(farm_fingerprint(concat(b.block_id, '|', cast(r.rep as string), '|', b.experiment_id))), 1000000) + 0.5) / 1000000) as g
  from blocks b
  cross join reps r
),
boot as (
  select
    c.experiment_id,
    c.version,
    c.feature_id,
    w.rep,
    safe_divide(
      sum(c.w * w.g * (c.a - c.p_tilde) * c.y_c),
      sum(c.w * w.g * pow(c.a - c.p_tilde, 2))
    ) as beta_raw
  from centred c
  join draw_weights w using (experiment_id, version, feature_id, block_id)
  group by 1, 2, 3, 4
),
signed as (
  select
    b.experiment_id,
    b.version,
    b.feature_id,
    if(k.direction = 'decrease', -b.beta_raw, b.beta_raw) as beta
  from boot b
  join keys k using (experiment_id, version, feature_id)
),
intervals as (
  select
    experiment_id,
    version,
    feature_id,
    percentile_cont(beta, 0.025) over (partition by experiment_id, version, feature_id) as p025,
    percentile_cont(beta, 0.10) over (partition by experiment_id, version, feature_id) as p10,
    percentile_cont(beta, 0.50) over (partition by experiment_id, version, feature_id) as p50,
    percentile_cont(beta, 0.90) over (partition by experiment_id, version, feature_id) as p90,
    percentile_cont(beta, 0.975) over (partition by experiment_id, version, feature_id) as p975,
    safe_divide(
      countif(beta > 0) over (partition by experiment_id, version, feature_id),
      count(*) over (partition by experiment_id, version, feature_id)
    ) as prob_positive
  from signed
  qualify row_number() over (partition by experiment_id, version, feature_id) = 1
)
select
  to_hex(sha256(concat('${gitSha}', '|', cast(current_date() as string), '|', k.experiment_id, '|', k.feature_id))) as run_id,
  current_timestamp() as computed_at,
  k.experiment_id,
  k.version,
  k.feature_id,
  k.role,
  k.direction,
  if(k.n_with_outcome < 14, 'insufficient_data', 'ok') as status,
  if(k.n_with_outcome < 14, null, if(k.direction = 'decrease', -p.beta_raw, p.beta_raw)) as beta,
  k.n_decisions,
  k.n_treated,
  k.n_with_outcome,
  k.mean_treated,
  k.mean_control,
  k.adherence,
  if(k.n_with_outcome < 14, null, i.p025) as p025,
  if(k.n_with_outcome < 14, null, i.p10) as p10,
  if(k.n_with_outcome < 14, null, i.p50) as p50,
  if(k.n_with_outcome < 14, null, i.p90) as p90,
  if(k.n_with_outcome < 14, null, i.p975) as p975,
  if(k.n_with_outcome < 14, null, i.prob_positive) as prob_positive,
  ${notCausal} as not_causal
from keys k
left join point p using (experiment_id, version, feature_id)
left join intervals i using (experiment_id, version, feature_id)
`;
}

module.exports = { estimateSql };
