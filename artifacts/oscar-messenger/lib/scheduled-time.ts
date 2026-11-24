export function formatLocalDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalTimeInput(value: Date): string {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export type LocalDateTimeParseResult =
  | { value: Date; error: null }
  | { value: null; error: "date" | "time" };

function westernizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function parseLocalDateTimeDetailed(
  dateValue: string,
  timeValue: string,
): LocalDateTimeParseResult {
  const normalizedDate = westernizeDigits(dateValue);
  const normalizedTime = westernizeDigits(timeValue);
  const dateMatch = /^\s*(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(
    normalizedDate,
  );
  if (!dateMatch) return { value: null, error: "date" };

  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    calendarDate.getFullYear() !== year ||
    calendarDate.getMonth() !== month - 1 ||
    calendarDate.getDate() !== day
  ) {
    return { value: null, error: "date" };
  }

  const timeMatch = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(normalizedTime);
  if (!timeMatch) return { value: null, error: "time" };
  const [, hourText, minuteText] = timeMatch;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return { value: null, error: "time" };

  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  ) {
    return { value: null, error: "time" };
  }
  return { value, error: null };
}

export function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  return parseLocalDateTimeDetailed(dateValue, timeValue).value;
}

export function tomorrowKeepingTime(
  timeValue: string,
  now = new Date(),
): { dateValue: string; timeValue: string } {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { dateValue: formatLocalDateInput(tomorrow), timeValue };
}

export function localTimeZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "توقيت الجهاز";
}

export function earliestValidMinute(now = new Date()): Date {
  return new Date(Math.ceil((now.getTime() + 120_000) / 60_000) * 60_000);
}

export function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "موعد غير صالح";
  const parts = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const period = date.getHours() < 12 ? "صباحًا" : "مساءً";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("hour")}:${part("minute")} ${period}`;
}
