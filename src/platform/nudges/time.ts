import { dateKey, formatDay, TIME_ZONE } from "@/src/platform/recall/dates";

export function addCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function isoWeekday(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function londonMidnight(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const first = utcMidnight - offsetMinutes(utcMidnight) * 60_000;
  const second = offsetMinutes(first);
  return new Date(second === offsetMinutes(utcMidnight) ? first : utcMidnight - second * 60_000);
}

export function londonDayBounds(now: Date) {
  const key = dateKey(now.getTime());
  return {
    key,
    start: londonMidnight(key),
    end: londonMidnight(addCalendarDays(key, 1)),
  };
}

export function londonIsoWeek(now: Date) {
  const key = dateKey(now.getTime());
  const startKey = addCalendarDays(key, -(isoWeekday(key) - 1));
  return {
    start: londonMidnight(startKey),
    end: londonMidnight(addCalendarDays(startKey, 7)),
  };
}

export function nudgeWhen(createdAt: Date, now: Date) {
  const age = now.getTime() - createdAt.getTime();
  if (age >= 0 && age < 2 * 60 * 60 * 1000) {
    return "just now";
  }
  const createdKey = dateKey(createdAt.getTime());
  if (createdKey !== dateKey(now.getTime())) {
    return formatDay(createdKey);
  }
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(createdAt),
  );
  return hour < 12 ? "this morning" : "today";
}

function offsetMinutes(utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}
