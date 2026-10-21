export type DesignInfo = {
  supported: boolean;
  hasDecisionAssigner: boolean;
};

const DESIGNS: Record<string, DesignInfo> = {
  micro_randomised_daily: { supported: true, hasDecisionAssigner: true },
  monitoring_validation: { supported: true, hasDecisionAssigner: false },
  micro_randomised_intraday: { supported: false, hasDecisionAssigner: false },
  parallel_rct: { supported: false, hasDecisionAssigner: false },
};

export function designInfo(design: unknown): DesignInfo | null {
  if (typeof design !== "string" || !design) {
    return null;
  }
  return DESIGNS[design] ?? null;
}

export function hasDecisionAssigner(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (row.schema_version === 2) {
    return designInfo(row.design)?.hasDecisionAssigner === true;
  }
  return row.design === "micro_randomised_daily";
}
