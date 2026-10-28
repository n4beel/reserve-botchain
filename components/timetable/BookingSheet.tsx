"use client";

import React from "react";
import { formatEther } from "viem";
import type { ResourceData, GridSlot } from "@/lib/reserve";
import { formatTimeLocal, formatTimeUTC } from "@/lib/reserve";

interface BookingSheetProps {
  resource: ResourceData;
  slot: GridSlot | null;
  isOpen: boolean;
  onClose: () => void;
  onBook: (start: bigint) => Promise<boolean>;
  onCancel: (start: bigint) => Promise<boolean>;
  isTransacting?: boolean;
  userAddress?: string;
}

/**
 * Docked bottom sheet drawer displaying slot booking details,
 * cancellation cutoff deadline, and transaction dispatch.
 */
export default function BookingSheet({
  resource,
  slot,
  isOpen,
  onClose,
  onBook,
  onCancel,
  isTransacting = false,
  userAddress,
}: BookingSheetProps) {
  if (!isOpen || !slot) return null;

  const isHost =
    userAddress &&
    resource.host.toLowerCase() === userAddress.toLowerCase();

  const priceFormatted = `${formatEther(resource.price)} BOT`;
  const timeLocal = formatTimeLocal(slot.start);
  const timeUtc = formatTimeUTC(slot.start);
  const cutoffTimeLocal = formatTimeLocal(slot.cancelDeadline);

  const handleBook = async () => {
    const ok = await onBook(slot.start);
    if (ok) onClose();
  };

  const handleCancel = async () => {
    const ok = await onCancel(slot.start);
    if (ok) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookingsheet-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-t-lg sm:rounded-[2px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]"
              aria-hidden="true"
            />
            <h3
              id="bookingsheet-title"
              className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]"
            >
              Slot Reservation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] rounded-[2px] transition-colors"
            aria-label="Close booking sheet"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 md:p-6 space-y-5 overflow-y-auto">
          {/* Main Slot Summary */}
          <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[2px] space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--text-secondary)] block">
                  {resource.name}
                </span>
                <span className="font-heading font-bold text-base sm:text-lg text-[var(--text-primary)] block">
                  {slot.dayDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className="font-mono font-bold text-sm sm:text-base text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-[2px] border border-[var(--accent)]/20">
                {priceFormatted}
              </span>
            </div>

            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--text-secondary)]">Slot Time:</span>
              <span className="text-[var(--text-primary)] font-semibold" title={timeUtc}>
                {timeLocal} <span className="text-[var(--text-tertiary)] font-normal">({timeUtc})</span>
              </span>
            </div>
          </div>

          {/* Cancellation Cutoff Notice per spec §3.1 */}
          <div className="p-3 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-heading font-bold uppercase text-[11px] text-[var(--text-primary)]">
              <span>⏳</span>
              <span>Cancellation Terms</span>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {resource.cutoffSecs === 0 ? (
                "Free cancellation anytime until the slot begins. 100% refund."
              ) : (
                <>
                  Free cancellation until{" "}
                  <strong className="text-[var(--text-primary)] font-semibold">
                    {cutoffTimeLocal}
                  </strong>{" "}
                  your time. After the cutoff, deposits are non-refundable.
                </>
              )}
            </p>
          </div>

          {/* Slot State Actions */}
          {slot.isPast ? (
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)] rounded-[2px]">
              This time slot is in the past and can no longer be booked or cancelled.
            </div>
          ) : slot.isMine ? (
            <div className="space-y-3">
              <div className="p-3 bg-[var(--accent)]/10 border border-[var(--accent)] rounded-[2px] text-xs text-[var(--text-primary)]">
                <span className="font-bold block mb-0.5">✓ Reserved by You</span>
                Your deposit of {priceFormatted} is locked in the contract until the slot begins.
              </div>

              {slot.canCancel ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isTransacting}
                  className="w-full py-2.5 rounded-[2px] font-heading font-semibold text-xs uppercase tracking-wider bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {isTransacting ? "Cancelling…" : "Cancel Booking & Refund Full Deposit"}
                </button>
              ) : (
                <div className="p-2.5 bg-[var(--warning)]/10 border border-[var(--warning)]/40 rounded-[2px] text-xs text-[var(--warning)]">
                  Free cancellation deadline has passed ({cutoffTimeLocal}). This booking is confirmed and cannot be cancelled.
                </div>
              )}
            </div>
          ) : slot.isFree ? (
            <div>
              {isHost ? (
                <div className="p-3 bg-[var(--danger)]/10 border border-[var(--danger)] text-xs text-[var(--danger)] rounded-[2px]">
                  You own this resource. Hosts cannot book their own slots.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBook}
                  disabled={isTransacting}
                  className="w-full py-3 rounded-[2px] font-heading font-bold text-xs uppercase tracking-widest bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 disabled:opacity-40 transition-all shadow-xs cursor-pointer"
                >
                  {isTransacting ? "Confirming on Chain…" : `Book This Slot (${priceFormatted})`}
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 bg-[#0B2545]/10 border border-[#0B2545]/30 text-xs text-[#0B2545] rounded-[2px]">
              <span className="font-bold block mb-0.5">Booked by Another Booker</span>
              This slot is currently reserved and unavailable. If the booker or host cancels before the cutoff, it will become available again.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
