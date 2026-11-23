const WIB_TIMEZONE = 'Asia/Jakarta';

/**
 * Returns YYYY-MM-DD in Asia/Jakarta (WIB, UTC+7).
 */
export function getWibDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM-DD HH:mm:ss in Asia/Jakarta (WIB, UTC+7).
 */
export function getWibDateTimeString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Extracts HH:mm:ss WIB from YYYY-MM-DD HH:mm:ss string.
 */
export function extractWibTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.trim().split(' ');
  const timePart = parts[1] ?? parts[0];
  return `${timePart} WIB`;
}

/**
 * Formats YYYY-MM-DD into readable Indonesian date e.g. "22 November 2026".
 */
export function formatIndonesianDate(yyyyMmDd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!match) return yyyyMmDd;
  const [, y, m, d] = match;
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const monthName = months[Number(m) - 1] ?? m;
  return `${Number(d)} ${monthName} ${y}`;
}

/**
 * Returns YYYY-MM-DD offset by N days in WIB.
 */
export function addDaysWib(yyyyMmDd: string, offsetDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!match) return yyyyMmDd;
  const [, y, m, d] = match;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d) + offsetDays, 12, 0, 0);
  return getWibDateString(new Date(utc));
}
