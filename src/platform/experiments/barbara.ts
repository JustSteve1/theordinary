export const BARBARA_MARKER_RULE = "ptau217_positive" as const;
export const BARBARA_BATTERY_CUTOFF: number | null = null;

export function barbaraPtau217Positive(group: string | null | undefined) {
  return group === "positive";
}

export function barbaraBatteryBelowCutoff(score: number | null | undefined) {
  if (BARBARA_BATTERY_CUTOFF == null || score == null || !Number.isFinite(score)) {
    return null;
  }
  return score < BARBARA_BATTERY_CUTOFF;
}

export function barbaraMarkerPresent(input: {
  ptau217_group?: string | null;
  battery?: number | null;
}) {
  return barbaraPtau217Positive(input.ptau217_group);
}
