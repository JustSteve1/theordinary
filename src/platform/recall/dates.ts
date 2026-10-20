export const TIME_ZONE = "Europe/London";

export function dateKey(time: number, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

export function yesterdayKey(now = Date.now(), timeZone = TIME_ZONE) {
  const today = dateKey(now, timeZone);
  let cursor = now - 12 * 60 * 60 * 1000;
  while (dateKey(cursor, timeZone) === today) {
    cursor -= 12 * 60 * 60 * 1000;
  }
  return dateKey(cursor, timeZone);
}

export function formatDay(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function londonHour(time = Date.now(), timeZone = TIME_ZONE) {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(new Date(time))
      .find((part) => part.type === "hour")?.value;
    return Number(hour ?? "12");
  } catch {
    return new Date(time).getUTCHours();
  }
}

export function sameLondonDay(iso: string | null, now = Date.now()) {
  if (!iso) {
    return false;
  }
  return dateKey(new Date(iso).getTime()) === dateKey(now);
}
