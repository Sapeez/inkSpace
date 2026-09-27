// Filename rules for Save-as-new-attachment (PRD F1–F6, spec.md §3.4).
//
// F1/F2: the default save name is `<existing filename> <UTC timestamp>`, with
// the timestamp in `<day><month><year><hour><minute>` (DDMMYYYYHHmm, all
// zero-padded, computed in UTC regardless of viewer timezone) inserted before
// the file extension — not after it — so the result is still a valid PDF
// filename (`report 270920261834.pdf`, not `report.pdf 270920261834`).
// F3: if the base name (before the extension) already ends in a timestamp in
// this exact shape, it's replaced in place rather than appended a second time.
const TIMESTAMP_DIGIT_COUNT = 12; // DD(2) MM(2) YYYY(4) HH(2) mm(2)
const TRAILING_TIMESTAMP_PATTERN = new RegExp(`\\s\\d{${TIMESTAMP_DIGIT_COUNT}}$`);

const MAX_FILENAME_LENGTH = 255;

// Path separators and the Windows-reserved character set — this repo's PDFs
// are ultimately named files in Supabase Storage, and disallowing this same
// set client- and server-side keeps a saved attachment's filename usable
// unmodified as a real filename on any of the platforms viewers download to.
// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS_PATTERN = /[\\/:*?"<>|\x00-\x1f]/;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

// DDMMYYYYHHmm, always UTC (F2) — independent of the viewer's local timezone.
export function formatUtcTimestamp(date: Date): string {
  const day = pad(date.getUTCDate(), 2);
  const month = pad(date.getUTCMonth() + 1, 2);
  const year = pad(date.getUTCFullYear(), 4);
  const hours = pad(date.getUTCHours(), 2);
  const minutes = pad(date.getUTCMinutes(), 2);
  return `${day}${month}${year}${hours}${minutes}`;
}

// Splits "report.final.pdf" into base "report.final" and extension ".pdf" —
// only the last "." counts as the extension boundary; a name with no "." (or
// one that ends in ".", e.g. "report.") has no extension to preserve.
function splitExtension(filename: string): { base: string; extension: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return { base: filename, extension: '' };
  }
  return { base: filename.slice(0, lastDot), extension: filename.slice(lastDot) };
}

// F1–F3: appends a UTC timestamp to `existingName`, or replaces one already
// there in the same shape, rather than appending a second one.
export function generateDefaultFilename(existingName: string, now: Date = new Date()): string {
  const { base, extension } = splitExtension(existingName);
  const timestamp = formatUtcTimestamp(now);
  const baseWithoutTimestamp = base.replace(TRAILING_TIMESTAMP_PATTERN, '');
  return `${baseWithoutTimestamp} ${timestamp}${extension}`;
}

// F4–F6: client- and server-side validation (this function is shared by
// both — see server/routes/attachments.js). Returns the first applicable
// error message, or null when `name` is valid. Checked in F4 → F5 → F6 order.
export function validateFilename(name: string): string | null {
  if (name.trim().length === 0) return 'Required field';
  if (name.length > MAX_FILENAME_LENGTH) return '255 characters maximum';
  if (INVALID_FILENAME_CHARS_PATTERN.test(name)) return 'Invalid characters';
  return null;
}
