import { displayTimeZone } from "#/lib/time-zone";
import { getLocale } from "#/paraglide/runtime.js";

/** "18 h 5 min" in the current locale (Intl.DurationFormat, or unit formatting where missing). */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const locale = getLocale();
  if ("DurationFormat" in Intl) {
    return new Intl.DurationFormat(locale, { style: "short" }).format({ hours, minutes });
  }
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(
      value,
    );
  return hours > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(minutes, "minute");
}

/** A date from an ISO string, in the current locale and the visitor's time zone. */
export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(getLocale(), { timeZone: displayTimeZone(), ...options }).format(
        date,
      );
}

/** "14 days ago" / "today", in the current locale: how long ago a date was, in whole days. */
export function formatDaysAgo(value: string | Date, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(-days, "day");
}

export const yearOf = (isoDate: string | undefined) => isoDate?.slice(0, 4);

/** "A, B and C" in the current locale. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(items);
}

export const formatNumber = (value: number) => new Intl.NumberFormat(getLocale()).format(value);

/** 0.42 → "42 %" (or "42%"), in the current locale. */
export const formatPercent = (ratio: number) =>
  new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 0 }).format(ratio);
