/**
 * Timezone-aware display helpers (§4.5). Scheduling text always states the
 * viewer's timezone explicitly, so "9 AM" is never ambiguous — a student in a
 * different zone from the teacher sees the time in THEIR zone, labelled.
 */

/** Short localized zone name for the viewer ("IST", "GMT+5:30", …). */
export const getTimeZoneName = (): string => {
  try {
    const short = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    return short || 'local time';
  } catch {
    return 'local time';
  }
};

/** IANA zone for the viewer ("Asia/Kolkata", …) — useful for the title attr. */
export const getTimeZoneId = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
};

/** Compact, user-friendly completion timestamp for result tables —
 *  "13 Sep 2026, 2:30 pm" style. Null/invalid input (legacy rows can carry
 *  junk like "1:7:53" where a timestamp belongs) renders the fallback —
 *  never "Invalid Date". */
export const formatCompletedAt = (
  value: Date | string | number | null | undefined,
  fallback = '—',
): string => {
  if (value == null || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** Format a date in the viewer's locale + zone, with the zone appended. */
export const formatInLocalZone = (
  date: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString(undefined, opts ?? {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })} (${getTimeZoneName()})`;
};
