export function canViewDemo(input: {
  email?: string | null;
  preview: boolean;
  allowlistedEmail?: string | null;
  snapshotFile?: boolean;
  nodeEnv?: string;
}) {
  if (input.preview) {
    return true;
  }
  const email = input.email?.trim().toLowerCase() ?? "";
  const allowlisted = input.allowlistedEmail?.trim().toLowerCase() ?? "";
  if (email && allowlisted && email === allowlisted) {
    return true;
  }
  const env = input.nodeEnv ?? process.env.NODE_ENV;
  return env !== "production" && Boolean(input.snapshotFile);
}
