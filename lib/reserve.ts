/**
 * Domain utilities, grid generation, and date/time formatting for Reserve.
 * Follows spec §3.1 and §4 guidelines.
 */

export enum BookingStatus {
  None = 0,
  Booked = 1,
  Cancelled = 2,
  Collected = 3,
}

export interface ResourceData {
  id: bigint;
  host: `0x${string}`;
  price: bigint;
  slotSecs: number;
  cutoffSecs: number;
  name: string;
}

export interface BookingData {
  booker: `0x${string}`;
  status: BookingStatus;
}

export interface GridSlot {
  start: bigint;
  end: bigint;
  dayIndex: number; // 0 = Mon, 6 = Sun or 0 = startDay
  dayDate: Date;
  timeLabel: string;
  utcTimeLabel: string;
  status: BookingStatus;
  booker: `0x${string}`;
  isPast: boolean;
  isMine: boolean;
  isFree: boolean;
  canCancel: boolean;
  cancelDeadline: bigint;
}

export interface DayColumn {
  date: Date;
  dayName: string;
  dateLabel: string;
  dayStartUnix: bigint;
  slots: GridSlot[];
}

export interface WeekGridData {
  days: DayColumn[];
  timeRows: string[]; // labels for row headers (e.g. "09:00", "09:30")
}

/**
 * Rounds a timestamp down to the nearest slot boundary.
 */
export function alignedStart(
  ts: number | bigint,
  slotSecs: number | bigint
): bigint {
  const t = BigInt(ts);
  const s = BigInt(slotSecs);
  if (s <= 0n) return t;
  return t - (t % s);
}

/**
 * Rounds a timestamp up to the next slot boundary.
 */
export function nextAlignedStart(
  ts: number | bigint,
  slotSecs: number | bigint
): bigint {
  const t = BigInt(ts);
  const s = BigInt(slotSecs);
  if (s <= 0n) return t;
  const rem = t % s;
  return rem === 0n ? t : t + (s - rem);
}

/**
 * Computes latest unix second when a booker can cancel for a full refund.
 */
export function cancelDeadline(
  start: number | bigint,
  cutoffSecs: number | bigint
): bigint {
  const s = BigInt(start);
  const c = BigInt(cutoffSecs);
  return s >= c ? s - c : 0n;
}

/**
 * Returns the viewer's local time zone abbreviation (e.g. "PST", "EDT", "UTC").
 */
export function tzLabel(date = new Date()): string {
  try {
    const str = date.toLocaleTimeString("en-US", { timeZoneName: "short" });
    const parts = str.split(" ");
    return parts[parts.length - 1] || "Local";
  } catch {
    return "Local";
  }
}

/**
 * Formats unix seconds into viewer's local 24h time with time zone (e.g. "14:00 PST").
 */
export function formatTimeLocal(
  unixSec: number | bigint,
  includeZone = true
): string {
  const d = new Date(Number(unixSec) * 1000);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return includeZone ? `${time} ${tzLabel(d)}` : time;
}

/**
 * Formats unix seconds into UTC time string (e.g. "14:00 UTC").
 */
export function formatTimeUTC(unixSec: number | bigint): string {
  const d = new Date(Number(unixSec) * 1000);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} UTC`;
}

/**
 * Formats a date label for week headers (e.g. "Tue 28 Oct").
 */
export function formatDateHeader(d: Date): { dayName: string; dateLabel: string } {
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const dateLabel = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return { dayName, dateLabel };
}

/**
 * Formats duration in seconds into human-readable label (e.g. "15 min", "1 hour", "24 hours").
 */
export function formatDuration(seconds: number | bigint): string {
  const s = Number(seconds);
  if (s >= 86400) {
    const days = Math.round(s / 86400);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (s >= 3600) {
    const hrs = s / 3600;
    return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} ${hrs === 1 ? "hour" : "hours"}`;
  }
  const mins = Math.round(s / 60);
  return `${mins} min`;
}

/**
 * Computes start of the day (00:00:00 UTC) for a given timestamp.
 */
export function startOfDayUTC(unixSec: number | bigint): bigint {
  const t = BigInt(unixSec);
  return t - (t % 86400n);
}

/**
 * Constructs 7 days of timetable columns and rows.
 */
export function gridFor(
  startDayUnix: number | bigint,
  slotSecs: number | bigint,
  cutoffSecs: number | bigint,
  bookingsMap: Map<bigint, BookingData>,
  nowSec: number | bigint,
  userAddress?: string,
  numDays = 7
): WeekGridData {
  const baseDay = startOfDayUTC(startDayUnix);
  const slotS = BigInt(slotSecs);
  const cutoffS = BigInt(cutoffSecs);
  const now = BigInt(nowSec);
  const user = userAddress ? userAddress.toLowerCase() : "";

  const days: DayColumn[] = [];
  const slotsPerDay = Number(86400n / slotS);

  // Time row labels (e.g. "00:00", "00:30", etc.)
  const timeRows: string[] = [];
  for (let s = 0; s < slotsPerDay; s++) {
    const timeSec = baseDay + BigInt(s) * slotS;
    timeRows.push(formatTimeLocal(timeSec, false));
  }

  for (let d = 0; d < numDays; d++) {
    const dayStart = baseDay + BigInt(d) * 86400n;
    const dayDate = new Date(Number(dayStart) * 1000);
    const { dayName, dateLabel } = formatDateHeader(dayDate);

    const daySlots: GridSlot[] = [];

    for (let s = 0; s < slotsPerDay; s++) {
      const slotStart = dayStart + BigInt(s) * slotS;
      const slotEnd = slotStart + slotS;
      const booking = bookingsMap.get(slotStart) || {
        booker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        status: BookingStatus.None,
      };

      const isBooked = booking.status === BookingStatus.Booked;
      const isCollected = booking.status === BookingStatus.Collected;
      const isCancelled = booking.status === BookingStatus.Cancelled;
      const isFree = !isBooked && !isCollected;

      const isPast = slotStart <= now;
      const isMine =
        user !== "" && booking.booker.toLowerCase() === user && isBooked;

      const deadline = cancelDeadline(slotStart, cutoffS);
      const canCancel = isBooked && now <= deadline;

      daySlots.push({
        start: slotStart,
        end: slotEnd,
        dayIndex: d,
        dayDate,
        timeLabel: formatTimeLocal(slotStart),
        utcTimeLabel: formatTimeUTC(slotStart),
        status: booking.status,
        booker: booking.booker,
        isPast,
        isMine,
        isFree,
        canCancel,
        cancelDeadline: deadline,
      });
    }

    days.push({
      date: dayDate,
      dayName,
      dateLabel,
      dayStartUnix: dayStart,
      slots: daySlots,
    });
  }

  return { days, timeRows };
}
