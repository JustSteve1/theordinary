const { BASE, DERIVED_PARENTS } = require("./registry");

function featuresDailySql(wide) {
  const unpivot = BASE.map(
    (item) => `select member_key, date, '${item.id}' as feature_id, cast(${item.column} as float64) as value,
      '1.0.0' as feature_version, source_ids, current_timestamp() as computed_at
    from ${wide}
    where ${item.column} is not null`,
  ).join("\nunion all\n");
  const parents = DERIVED_PARENTS.map((id) => `'${id}'`).join(", ");
  return `
with base as (
  ${unpivot}
),
parents as (
  select * from base where feature_id in (${parents})
),
rolled as (
  select
    a.member_key,
    a.date,
    a.feature_id,
    a.value,
    a.source_ids,
    array(
      select b.value
      from parents b
      where b.member_key = a.member_key
        and b.feature_id = a.feature_id
        and b.date between date_sub(a.date, interval 28 day) and date_sub(a.date, interval 1 day)
    ) as prior,
    (
      select b.value
      from parents b
      where b.member_key = a.member_key
        and b.feature_id = a.feature_id
        and b.date = date_sub(a.date, interval 1 day)
    ) as yesterday
  from parents a
),
scored as (
  select
    *,
    if(array_length(prior) >= 14, (
      select percentile_cont(x, 0.5) over () from unnest(prior) x limit 1
    ), null) as baseline,
    if(array_length(prior) >= 14, (
      select percentile_cont(abs(x - med), 0.5) over ()
      from (
        select x, (select percentile_cont(y, 0.5) over () from unnest(prior) y limit 1) as med
        from unnest(prior) x
      )
      limit 1
    ), null) as mad
  from rolled
),
derived as (
  select member_key, date, concat(feature_id, '.baseline_28d') as feature_id, baseline as value, '1.0.0' as feature_version, source_ids, current_timestamp() as computed_at
  from scored
  where baseline is not null
  union all
  select member_key, date, concat(feature_id, '.dev'), value - baseline, '1.0.0', source_ids, current_timestamp()
  from scored
  where baseline is not null
  union all
  select member_key, date, concat(feature_id, '.dev_z'), safe_divide(value - baseline, 1.4826 * nullif(mad, 0)), '1.0.0', source_ids, current_timestamp()
  from scored
  where baseline is not null and mad is not null
  union all
  select member_key, date, concat(feature_id, '.delta_1d'), value - yesterday, '1.0.0', source_ids, current_timestamp()
  from scored
  where yesterday is not null
),
strain as (
  select member_key, date, 'whoop.strain_minus_recovery' as feature_id,
    day_strain / 21 * 100 - recovery_score as value,
    '1.0.0' as feature_version, source_ids, current_timestamp() as computed_at
  from ${wide}
  where day_strain is not null and recovery_score is not null
),
midpoints as (
  select member_key, date, sleep_midpoint_min as value, source_ids
  from ${wide}
  where sleep_midpoint_min is not null
),
midpoint_sd as (
  select
    a.member_key,
    a.date,
    'whoop.sleep_midpoint_sd_7d' as feature_id,
    (
      select if(count(*) >= 7, stddev_samp(if(x > 720, x - 1440, x)), null)
      from unnest(array(
        select b.value
        from midpoints b
        where b.member_key = a.member_key
          and b.date between date_sub(a.date, interval 7 day) and date_sub(a.date, interval 1 day)
      )) x
    ) as value,
    '1.0.0' as feature_version,
    a.source_ids,
    current_timestamp() as computed_at
  from midpoints a
)
select * from base
union all
select * from derived
union all
select * from strain
union all
select * from midpoint_sd where value is not null
`;
}

module.exports = { featuresDailySql };
