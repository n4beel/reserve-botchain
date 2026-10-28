"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import WeekGrid from "@/components/timetable/WeekGrid";
import BookingSheet from "@/components/timetable/BookingSheet";
import Spinner from "@/components/ui/Spinner";
import { useReserve } from "@/lib/useReserve";
import {
  gridFor,
  startOfDayUTC,
  formatDuration,
  type ResourceData,
  type BookingData,
  type GridSlot,
  type WeekGridData,
} from "@/lib/reserve";
import { MAX_SLOTS_WINDOW } from "@/lib/limits";

const NAV = [
  { href: "/", label: "Resource Index" },
  { href: "/new", label: "Open Resource" },
  { href: "/me", label: "My Bookings & Till" },
];

export default function ResourceTimetablePage() {
  const params = useParams();
  const rawId = params?.id as string;
  const resourceId = rawId ? BigInt(rawId) : 0n;

  const { address } = useAccount();
  const {
    fetchResource,
    fetchSlots,
    fetchBlockTimestamp,
    book,
    cancel,
    isTransacting,
    deployed,
  } = useReserve();

  const [resource, setResource] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, etc.
  const [selectedSlot, setSelectedSlot] = useState<GridSlot | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [bookingsMap, setBookingsMap] = useState<Map<bigint, BookingData>>(
    new Map()
  );
  const [currentBlockTime, setCurrentBlockTime] = useState<number>(
    Math.floor(Date.now() / 1000)
  );

  // Load resource details and initial timestamp
  const loadResourceData = useCallback(async () => {
    if (resourceId <= 0n) return;
    setLoading(true);
    try {
      const [r, blockTime] = await Promise.all([
        fetchResource(resourceId),
        fetchBlockTimestamp(),
      ]);
      setResource(r);
      setCurrentBlockTime(blockTime);
    } catch (err) {
      console.error("Failed to load resource:", err);
    } finally {
      setLoading(false);
    }
  }, [resourceId, fetchResource, fetchBlockTimestamp]);

  useEffect(() => {
    loadResourceData();
  }, [loadResourceData]);

  // Compute week start timestamp (aligned to 00:00:00 UTC)
  const weekStartUnix = useMemo(() => {
    const todayUTC = startOfDayUTC(currentBlockTime);
    // Add 7 days * weekOffset
    return todayUTC + BigInt(weekOffset) * 7n * 86400n;
  }, [currentBlockTime, weekOffset]);

  // Fetch slots for each day of the current week
  const loadWeekSlots = useCallback(async () => {
    if (!resource || resourceId <= 0n) return;
    try {
      const slotS = BigInt(resource.slotSecs);
      const slotsPerDay = Number(86400n / slotS);
      const daysCount = 7;

      const newMap = new Map<bigint, BookingData>();

      // Fetch each day's slots in parallel (slotsPerDay <= 96)
      const promises = [];
      for (let d = 0; d < daysCount; d++) {
        const dayStart = weekStartUnix + BigInt(d) * 86400n;
        const count = BigInt(Math.min(slotsPerDay, MAX_SLOTS_WINDOW));
        promises.push(
          fetchSlots(resourceId, dayStart, count).then((slots) => ({
            dayStart,
            slots,
          }))
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        res.slots.forEach((booking, idx) => {
          const slotStart = res.dayStart + BigInt(idx) * slotS;
          newMap.set(slotStart, booking);
        });
      }

      setBookingsMap(newMap);
    } catch (err) {
      console.error("Failed to load week slots:", err);
    }
  }, [resource, resourceId, weekStartUnix, fetchSlots]);

  useEffect(() => {
    if (resource) {
      loadWeekSlots();
    }
  }, [resource, loadWeekSlots]);

  // Construct grid data
  const gridData: WeekGridData | null = useMemo(() => {
    if (!resource) return null;
    return gridFor(
      weekStartUnix,
      resource.slotSecs,
      resource.cutoffSecs,
      bookingsMap,
      currentBlockTime,
      address,
      7
    );
  }, [
    resource,
    weekStartUnix,
    bookingsMap,
    currentBlockTime,
    address,
  ]);

  const handleSelectSlot = (slot: GridSlot) => {
    setSelectedSlot(slot);
    setIsSheetOpen(true);
  };

  const handleBookSlot = async (start: bigint): Promise<boolean> => {
    if (!resource) return false;
    const ok = await book(resource.id, start, resource.price);
    if (ok) {
      // Reload slots and block timestamp
      const blockTime = await fetchBlockTimestamp();
      setCurrentBlockTime(blockTime);
      await loadWeekSlots();
    }
    return ok;
  };

  const handleCancelSlot = async (start: bigint): Promise<boolean> => {
    if (!resource) return false;
    const ok = await cancel(resource.id, start);
    if (ok) {
      const blockTime = await fetchBlockTimestamp();
      setCurrentBlockTime(blockTime);
      await loadWeekSlots();
    }
    return ok;
  };

  const isHost =
    address &&
    resource &&
    resource.host.toLowerCase() === address.toLowerCase();

  if (loading) {
    return (
      <PageShell nav={NAV} title="Resource Timetable">
        <div className="flex flex-col items-center justify-center p-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] my-6">
          <Spinner size={24} />
          <p className="mt-3 text-xs text-[var(--text-secondary)] font-mono">
            Loading timetable #{rawId}...
          </p>
        </div>
      </PageShell>
    );
  }

  if (!resource || resource.host === "0x0000000000000000000000000000000000000000") {
    return (
      <PageShell nav={NAV} title="Resource Not Found">
        <div className="p-12 text-center rounded-[2px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] my-6">
          <h2 className="font-heading font-bold text-base text-[var(--text-primary)]">
            Resource #{rawId} does not exist
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5">
            This timetable may not have been registered yet or the ID is invalid.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex px-4 py-2 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all"
            >
              ← Back to Resource Index
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      nav={NAV}
      title={resource.name}
      description={`Hosted by ${resource.host.slice(0, 6)}...${resource.host.slice(-4)} • ${formatDuration(resource.slotSecs)} slots • ${formatDuration(resource.cutoffSecs)} cancel cutoff`}
      action={
        <div className="flex items-center gap-2">
          {isHost && (
            <Link
              href={`/r/${resource.id}/manage`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all shadow-xs"
            >
              Host Dashboard →
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-heading font-medium text-xs tracking-wider border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            ← All Resources
          </Link>
        </div>
      }
    >
      {/* Host banner if connected account is the host */}
      {isHost && (
        <div className="p-3 bg-[var(--bg-surface)] border-l-4 border-l-[var(--accent)] border border-[var(--border-default)] rounded-[2px] mb-4 flex items-center justify-between gap-3 text-xs">
          <div>
            <strong className="text-[var(--text-primary)] font-semibold">
              You are the registered host of this calendar.
            </strong>{" "}
            <span className="text-[var(--text-secondary)]">
              You can cancel any booking before it starts or collect completed booking revenue.
            </span>
          </div>
          <Link
            href={`/r/${resource.id}/manage`}
            className="flex-shrink-0 font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--accent)] hover:underline"
          >
            Manage Bookings →
          </Link>
        </div>
      )}

      {/* Week Grid */}
      {gridData && (
        <WeekGrid
          gridData={gridData}
          slotPrice={resource.price}
          selectedSlot={selectedSlot}
          onSelectSlot={handleSelectSlot}
          onPrevWeek={() => setWeekOffset((prev) => Math.max(0, prev - 1))}
          onNextWeek={() => setWeekOffset((prev) => Math.min(8, prev + 1))}
          canPrevWeek={weekOffset > 0}
        />
      )}

      {/* Docked Booking Sheet */}
      <BookingSheet
        resource={resource}
        slot={selectedSlot}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onBook={handleBookSlot}
        onCancel={handleCancelSlot}
        isTransacting={isTransacting}
        userAddress={address}
      />
    </PageShell>
  );
}
