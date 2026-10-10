export type ConversationInput = {
  id: number | string;
  start_time?: number | string | null;
  end_time?: number | string | null;
  state?: string;
  short_summary?: string;
  title?: string;
  utterance_count?: number;
};

export type WindowName = "morning" | "afternoon" | "evening";

const WINDOWS: Record<WindowName, { start: string; end: string }> = {
  morning: { start: "06:00:00", end: "12:00:00" },
  afternoon: { start: "12:00:00", end: "18:00:00" },
  evening: { start: "18:00:00", end: "23:59:59" },
};

export type SelectedWindow = {
  date: string;
  tz: string;
  eligible: boolean;
  window: WindowName;
  window_start: string;
  window_end: string;
  n_conversations: number;
  total_minutes: number;
  conversation_ids: Array<number | string>;
  conversations: Array<{
    id: number | string;
    start: string;
    end: string;
    minutes: number;
    summary: string;
  }>;
  all_windows: Record<WindowName, { n: number; minutes: number }>;
  reason: string | null;
};

export function selectWindow(
  conversations: ConversationInput[],
  options: {
    date: string;
    timeZone?: string;
    minConversations?: number;
    minMinutes?: number;
    minTotalMinutes?: number;
    prefer?: WindowName;
  },
): SelectedWindow {
  const timeZone = options.timeZone ?? "UTC";
  const minConversations = options.minConversations ?? 2;
  const minMinutes = options.minMinutes ?? 3;
  const minTotalMinutes = options.minTotalMinutes ?? 15;
  const buckets: Record<WindowName, SelectedWindow["conversations"]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  for (const conversation of conversations) {
    const start = parseTimestamp(conversation.start_time, timeZone);
    const end = parseTimestamp(conversation.end_time, timeZone) ?? start;
    if (!start || start.date !== options.date || !end) {
      continue;
    }
    const state = (conversation.state ?? "").toUpperCase();
    if (state && state !== "COMPLETED" && state !== "PROCESSED") {
      continue;
    }
    const minutes = Math.max(0, (end.ms - start.ms) / 60000);
    if (minutes < minMinutes) {
      continue;
    }
    const window = windowFor(start.time);
    if (!window) {
      continue;
    }
    buckets[window].push({
      id: conversation.id,
      start: localIso(start, timeZone),
      end: localIso(end, timeZone),
      minutes: round1(minutes),
      summary: conversation.short_summary || conversation.title || "",
    });
  }

  const score = (window: WindowName) => {
    const items = buckets[window];
    const total = items.reduce((sum, item) => sum + item.minutes, 0);
    return {
      ok: items.length >= minConversations && total >= minTotalMinutes,
      total,
      count: items.length,
    };
  };
  const ranked = (Object.keys(WINDOWS) as WindowName[]).sort((left, right) => {
    const a = score(left);
    const b = score(right);
    return (
      Number(b.ok) - Number(a.ok) || b.total - a.total || b.count - a.count
    );
  });
  const preferred =
    options.prefer && score(options.prefer).ok ? options.prefer : ranked[0];
  const chosen = score(preferred);
  const bounds = WINDOWS[preferred];
  return {
    date: options.date,
    tz: timeZone,
    eligible: chosen.ok,
    window: preferred,
    window_start: civilIso(options.date, bounds.start, timeZone),
    window_end: civilIso(options.date, bounds.end, timeZone),
    n_conversations: chosen.count,
    total_minutes: round1(chosen.total),
    conversation_ids: buckets[preferred].map((item) => item.id),
    conversations: buckets[preferred],
    all_windows: {
      morning: summarise(buckets.morning),
      afternoon: summarise(buckets.afternoon),
      evening: summarise(buckets.evening),
    },
    reason: chosen.ok
      ? null
      : `need >= ${minConversations} conversations and >= ${minTotalMinutes} min; best window '${preferred}' has ${chosen.count} conv / ${round1(chosen.total)} min`,
  };
}

function summarise(items: SelectedWindow["conversations"]) {
  return {
    n: items.length,
    minutes: round1(items.reduce((sum, item) => sum + item.minutes, 0)),
  };
}

function windowFor(time: string): WindowName | null {
  for (const [name, bounds] of Object.entries(WINDOWS) as Array<
    [WindowName, { start: string; end: string }]
  >) {
    if (time >= bounds.start && time <= bounds.end) {
      return name;
    }
  }
  return null;
}

type ZonedStamp = { ms: number; date: string; time: string };

function parseTimestamp(
  value: number | string | null | undefined,
  timeZone: string,
): ZonedStamp | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    const ms = value > 1e11 ? value : value * 1000;
    return stamp(ms, timeZone);
  }
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    const ms = numeric > 1e11 ? numeric : numeric * 1000;
    return stamp(ms, timeZone);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return stamp(parsed, timeZone);
}

function stamp(ms: number, timeZone: string): ZonedStamp {
  const parts = zonedParts(ms, timeZone);
  return { ms, date: parts.date, time: parts.time };
}

function localIso(value: ZonedStamp, timeZone: string) {
  return civilIso(value.date, value.time, timeZone);
}

export function civilIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = offsetMs(utc, timeZone);
    const next = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
    if (next === utc) {
      break;
    }
    utc = next;
  }
  const offset = offsetMs(utc, timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const offsetHour = String(Math.floor(absolute / 3600000)).padStart(2, "0");
  const offsetMinute = String(
    Math.floor((absolute % 3600000) / 60000),
  ).padStart(2, "0");
  return `${date}T${time}${sign}${offsetHour}:${offsetMinute}`;
}

function offsetMs(utc: number, timeZone: string) {
  const parts = zonedParts(utc, timeZone);
  return Date.parse(`${parts.date}T${parts.time}Z`) - utc;
}

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  let hour = value("hour");
  if (hour === "24") {
    hour = "00";
  }
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${hour}:${value("minute")}:${value("second")}`,
  };
}

export function localDate(ms: number, timeZone: string) {
  return zonedParts(ms, timeZone).date;
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
