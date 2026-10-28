"use client";

import React, { useState, useEffect, useRef } from "react";
import { formatEther } from "viem";
import type { WeekGridData, GridSlot, DayColumn } from "@/lib/reserve";

interface WeekGridProps {
  gridData: WeekGridData;
  slotPrice: bigint;
  selectedSlot?: GridSlot | null;
  onSelectSlot: (slot: GridSlot) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  canPrevWeek?: boolean;
}

/**
 * Interactive 7-Day Timetable Grid.
 * Displays days as columns and slot times as rows.
 * Free slots show price on hover/focus.
 * Booked slots are solid navy; user bookings are teal with a tick.
 * Past slots have a diagonal hatched texture.
 * Keyboard arrow keys navigate between adjacent cells.
 */
export default function WeekGrid({
  gridData,
  slotPrice,
  selectedSlot,
  onSelectSlot,
  onPrevWeek,
  onNextWeek,
  canPrevWeek = true,
}: WeekGridProps) {
  // Mobile active day index (0 to 6)
  const [mobileDayIdx, setMobileDayIdx] = useState(0);

  // Keyboard navigation coordinate state: [dayIndex, slotIndex]
  const [focusedCoord, setFocusedCoord] = useState<[number, number] | null>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const days = gridData.days;
  const timeRows = gridData.timeRows;
  const priceFormatted = `${formatEther(slotPrice)} BOT`;

  // Focus matching button when focusedCoord changes
  useEffect(() => {
    if (focusedCoord) {
      const key = `${focusedCoord[0]}-${focusedCoord[1]}`;
      const el = cellRefs.current.get(key);
      if (el) el.focus();
    }
  }, [focusedCoord]);

  const handleKeyDown = (
    e: React.KeyboardEvent,
    dayIdx: number,
    slotIdx: number,
    slot: GridSlot
  ) => {
    let nextDay = dayIdx;
    let nextSlot = slotIdx;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        nextSlot = Math.max(0, slotIdx - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        nextSlot = Math.min(timeRows.length - 1, slotIdx + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        nextDay = Math.max(0, dayIdx - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        nextDay = Math.min(days.length - 1, dayIdx + 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelectSlot(slot);
        return;
      default:
        return;
    }

    setFocusedCoord([nextDay, nextSlot]);
  };

  return (
    <div className="w-full my-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] overflow-hidden shadow-xs">
      {/* Grid Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
            Slot Timetable
          </h2>
        </div>

        {/* Week navigation buttons */}
        <div className="flex items-center gap-2">
          {onPrevWeek && (
            <button
              type="button"
              onClick={onPrevWeek}
              disabled={!canPrevWeek}
              className="px-2.5 py-1 text-xs font-heading font-semibold uppercase tracking-wider rounded-[2px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous week"
            >
              ← Prev Week
            </button>
          )}

          {onNextWeek && (
            <button
              type="button"
              onClick={onNextWeek}
              className="px-2.5 py-1 text-xs font-heading font-semibold uppercase tracking-wider rounded-[2px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
              aria-label="Next week"
            >
              Next Week →
            </button>
          )}
        </div>
      </div>

      {/* Legend & Help bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[11px] text-[var(--text-secondary)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] border border-[var(--border-default)] bg-[var(--bg-surface)]" />
            <span>Available ({priceFormatted})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] bg-[#0B2545]" />
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-[9px] flex items-center justify-center">
              ✓
            </span>
            <span>Your Booking</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[1px] slot-hatched border border-[var(--border-subtle)]" />
            <span>Past</span>
          </div>
        </div>

        <span className="font-mono text-[10px] hidden sm:inline">
          Use arrow keys to navigate • Enter to select
        </span>
      </div>

      {/* Mobile Day Picker Tabs (< 640px) */}
      <div className="flex sm:hidden overflow-x-auto border-b border-[var(--border-default)] timetable-scroll bg-[var(--bg-elevated)] p-1 gap-1">
        {days.map((day, idx) => (
          <button
            key={day.dayStartUnix.toString()}
            type="button"
            onClick={() => setMobileDayIdx(idx)}
            className={[
              "flex-1 py-1.5 px-2 text-center text-xs font-heading font-semibold rounded-[2px] whitespace-nowrap transition-colors",
              mobileDayIdx === idx
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]",
            ].join(" ")}
          >
            <div>{day.dayName}</div>
            <div className="text-[10px] font-mono opacity-80">{day.dateLabel}</div>
          </button>
        ))}
      </div>

      {/* Timetable Grid Viewport */}
      {/* On mobile: show single selected day column. On desktop: show all 7 columns side-by-side */}
      <div className="overflow-x-auto timetable-scroll max-w-full">
        <div className="min-w-full inline-block align-middle">
          {/* Desktop Table View */}
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
                {/* Top-left empty time corner */}
                <th className="w-16 sm:w-20 p-2 text-center font-mono text-[11px] text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  Time
                </th>

                {/* Day column headers */}
                {days.map((day, dIdx) => (
                  <th
                    key={day.dayStartUnix.toString()}
                    className={[
                      "p-2.5 text-center font-heading border-r border-[var(--border-subtle)] last:border-r-0 min-w-[90px] sm:min-w-[110px]",
                      dIdx !== mobileDayIdx ? "hidden sm:table-cell" : "",
                    ].join(" ")}
                  >
                    <div className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                      {day.dayName}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] font-mono font-normal">
                      {day.dateLabel}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {timeRows.map((timeLabel, slotIdx) => (
                <tr
                  key={timeLabel}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  {/* Time label row header */}
                  <td className="w-16 sm:w-20 p-1.5 text-center font-mono text-[10px] sm:text-[11px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)]">
                    {timeLabel}
                  </td>

                  {/* Slot cells across days */}
                  {days.map((day, dayIdx) => {
                    const slot = day.slots[slotIdx];
                    if (!slot) return null;

                    const isSelected = selectedSlot?.start === slot.start;
                    const cellKey = `${dayIdx}-${slotIdx}`;

                    // Styling state classes
                    let cellClass = "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]";
                    let content = (
                      <span className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity font-mono text-[10px]">
                        {priceFormatted}
                      </span>
                    );

                    if (slot.isPast) {
                      cellClass = "slot-hatched text-[var(--text-tertiary)] opacity-60";
                      content = <span className="text-[10px] italic">Past</span>;
                    } else if (slot.isMine) {
                      cellClass = "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs";
                      content = (
                        <span className="flex items-center justify-center gap-1 font-heading text-[10px] tracking-wider uppercase">
                          <span>✓</span>
                          <span>Yours</span>
                        </span>
                      );
                    } else if (slot.status === 1 /* Booked */) {
                      cellClass = "bg-[#0B2545] text-white font-medium";
                      content = <span className="font-heading text-[10px] tracking-wider uppercase opacity-90">Booked</span>;
                    } else if (slot.status === 3 /* Collected */) {
                      cellClass = "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border-solid border-[var(--border-subtle)]";
                      content = <span className="text-[10px]">Ended</span>;
                    }

                    if (isSelected) {
                      cellClass += " ring-2 ring-[var(--accent)] ring-offset-1 z-10";
                    }

                    return (
                      <td
                        key={slot.start.toString()}
                        className={[
                          "p-0.5 border-r border-[var(--border-subtle)] last:border-r-0 h-10",
                          dayIdx !== mobileDayIdx ? "hidden sm:table-cell" : "",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) cellRefs.current.set(cellKey, el);
                            else cellRefs.current.delete(cellKey);
                          }}
                          onClick={() => onSelectSlot(slot)}
                          onKeyDown={(e) => handleKeyDown(e, dayIdx, slotIdx, slot)}
                          className={[
                            "group w-full h-full rounded-[1px] p-1 flex items-center justify-center transition-all cursor-pointer focus:outline-hidden",
                            cellClass,
                          ].join(" ")}
                          title={`${slot.timeLabel} (${slot.utcTimeLabel})`}
                          aria-label={`Slot at ${slot.timeLabel}: ${
                            slot.isMine
                              ? "Booked by you"
                              : slot.isFree
                              ? `Available for ${priceFormatted}`
                              : "Booked"
                          }`}
                        >
                          {content}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
