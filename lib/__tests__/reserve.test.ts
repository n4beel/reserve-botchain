import { describe, expect, it } from "vitest";
import {
  alignedStart,
  nextAlignedStart,
  cancelDeadline,
  formatDuration,
  formatTimeUTC,
  formatTimeLocal,
  tzLabel,
  gridFor,
  BookingStatus,
  type BookingData,
} from "../reserve";
import { describeError } from "../errors";

describe("Reserve domain math & time calculations", () => {
  it("alignedStart rounds down to slot boundaries", () => {
    // 30-minute slots (1800s)
    expect(alignedStart(1800, 1800)).toBe(1800n);
    expect(alignedStart(1801, 1800)).toBe(1800n);
    expect(alignedStart(3599, 1800)).toBe(1800n);
    expect(alignedStart(3600, 1800)).toBe(3600n);

    // 15-minute slots (900s)
    expect(alignedStart(950, 900)).toBe(900n);
    expect(alignedStart(1800, 900)).toBe(1800n);
  });

  it("nextAlignedStart rounds up to next slot boundary", () => {
    expect(nextAlignedStart(1800, 1800)).toBe(1800n);
    expect(nextAlignedStart(1801, 1800)).toBe(3600n);
    expect(nextAlignedStart(3599, 1800)).toBe(3600n);
    expect(nextAlignedStart(3600, 1800)).toBe(3600n);
  });

  it("cancelDeadline calculates cutoff timestamp correctly", () => {
    const start = 1700000000n;
    const cutoff24h = 86400n;
    expect(cancelDeadline(start, cutoff24h)).toBe(1700000000n - 86400n);

    // If cutoff is larger than start, clamps to 0n
    expect(cancelDeadline(50n, 100n)).toBe(0n);
  });

  it("formatDuration formats various second lengths cleanly", () => {
    expect(formatDuration(900)).toBe("15 min");
    expect(formatDuration(1800)).toBe("30 min");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(7200)).toBe("2 hours");
    expect(formatDuration(86400)).toBe("1 day");
    expect(formatDuration(86400 * 3)).toBe("3 days");
  });

  it("formatTimeUTC formats exact UTC time string", () => {
    // 1700000000 = Tue, 14 Nov 2023 22:13:20 GMT
    const str = formatTimeUTC(1700000000);
    expect(str).toBe("22:13 UTC");
  });

  it("formatTimeLocal formats with local time and includes time zone", () => {
    const local = formatTimeLocal(1700000000);
    const tz = tzLabel();
    expect(local).toContain(tz);
  });
});

describe("Reserve timetable grid generation", () => {
  it("generates 7 day columns with correct slots per day", () => {
    const startDay = 1700006400n; // Aligned day start
    const slotSecs = 3600n; // 1-hour slots => 24 slots/day
    const cutoffSecs = 86400n;
    const bookings = new Map<bigint, BookingData>();

    const user = "0x2222222222222222222222222222222222222222";
    const slot1 = startDay + 3600n * 10n; // Day 0, 10:00
    bookings.set(slot1, {
      booker: user as `0x${string}`,
      status: BookingStatus.Booked,
    });

    const otherUser = "0x3333333333333333333333333333333333333333";
    const slot2 = startDay + 86400n + 3600n * 14n; // Day 1, 14:00
    bookings.set(slot2, {
      booker: otherUser as `0x${string}`,
      status: BookingStatus.Booked,
    });

    const nowSec = startDay; // now is start of day 0

    const grid = gridFor(
      startDay,
      slotSecs,
      cutoffSecs,
      bookings,
      nowSec,
      user,
      7
    );

    expect(grid.days.length).toBe(7);
    expect(grid.timeRows.length).toBe(24);

    // Check Day 0, slot 10:00
    const day0Slot10 = grid.days[0].slots[10];
    expect(day0Slot10.isMine).toBe(true);
    expect(day0Slot10.isFree).toBe(false);
    expect(day0Slot10.status).toBe(BookingStatus.Booked);
    expect(day0Slot10.booker.toLowerCase()).toBe(user.toLowerCase());

    // Check Day 1, slot 14:00
    const day1Slot14 = grid.days[1].slots[14];
    expect(day1Slot14.isMine).toBe(false);
    expect(day1Slot14.isFree).toBe(false);
    expect(day1Slot14.status).toBe(BookingStatus.Booked);
    expect(day1Slot14.booker.toLowerCase()).toBe(otherUser.toLowerCase());

    // Check a free slot
    const freeSlot = grid.days[0].slots[0];
    expect(freeSlot.isFree).toBe(true);
    expect(freeSlot.isMine).toBe(false);
  });
});

describe("describeError decodes contract errors into user copy", () => {
  it("decodes PastCutoff with timestamp", () => {
    const err = new Error("revert: PastCutoff(1700000000)");
    const desc = describeError(err);
    expect(desc).toContain("Free cancellation ended at");
  });

  it("decodes Taken", () => {
    expect(describeError(new Error("Taken()"))).toBe(
      "Someone just booked that slot."
    );
  });

  it("decodes SlotOutOfRange", () => {
    expect(describeError(new Error("SlotOutOfRange()"))).toBe(
      "Slots open up to 60 days ahead."
    );
  });

  it("decodes HostCannotBook", () => {
    expect(describeError(new Error("HostCannotBook()"))).toBe(
      "You can't book your own resource."
    );
  });

  it("decodes WrongPayment", () => {
    const err = new Error("WrongPayment(100000000000000000)"); // 0.1 BOT
    expect(describeError(err)).toContain("0.1 BOT");
  });

  it("decodes user rejection", () => {
    expect(describeError(new Error("User rejected the request"))).toBe(
      "Transaction was cancelled in wallet."
    );
  });
});
