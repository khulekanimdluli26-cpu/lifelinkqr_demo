
export function formatLifeLinkTimestamp(value, options = {}) {
  if (!value) return "Not available";
  let date = null;

  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value && typeof value.seconds === "number") {
    date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date || Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat(options.locale || undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
