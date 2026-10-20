const BANNED = new Set([
  "talk_text",
  "narrative",
  "transcript",
  "summary",
  "short_summary",
  "detail",
  "text",
  "question",
  "answer",
  "answers",
  "clauses",
  "evidence",
  "body",
  "message",
  "content",
  "notes",
  "facts",
]);

export class SpeechFirewallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechFirewallError";
  }
}

export function isBannedColumn(name: string) {
  return BANNED.has(name) || name.endsWith("_text");
}

export function assertNoSpeech(table: string, rows: unknown[]) {
  const whoop = table.startsWith("whoop_");
  rows.forEach((row, index) => walk(row, whoop, false, `${table}[${index}]`));
}

function walk(value: unknown, whoop: boolean, inPayload: boolean, path: string) {
  if (typeof value === "string") {
    if (!inPayload && value.length > 200) {
      throw new SpeechFirewallError(`${path} is longer than 200 characters.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, whoop, inPayload, `${path}.${index}`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (!inPayload && (BANNED.has(key) || key.endsWith("_text"))) {
      throw new SpeechFirewallError(`${path}.${key} is speech and cannot enter BigQuery.`);
    }
    walk(child, whoop, inPayload || (whoop && key === "payload"), `${path}.${key}`);
  }
}
