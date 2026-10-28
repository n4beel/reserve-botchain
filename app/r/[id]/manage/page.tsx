"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import { useReserve } from "@/lib/useReserve";
import { reserveAbi } from "@/lib/botchain/abi";
import {
  BookingStatus,
  formatDuration,
  formatTimeLocal,
  formatTimeUTC,
  type ResourceData,
} from "@/lib/reserve";

const NAV = [
  { href: "/", label: "Resource Index" },
  { href: "/new", label: "Open Resource" },
  { href: "/me", label: "My Bookings & Till" },
];

interface ManagedBooking {
  start: bigint;
  booker: `0x${string}`;
  status: BookingStatus;
}

export default function HostManagePage() {
  const params = useParams();
  const rawId = params?.id as string;
  const resourceId = rawId ? BigInt(rawId) : 0n;

  const { address } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result
  const {
    contractAddress,
    fetchResource,
    fetchBookingLogs,
    fetchBlockTimestamp,
    hostCancel,
    collect,
    isTransacting,
  } = useReserve();

  const [resource, setResource] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<ManagedBooking[]>([]);
  const [currentBlockTime, setCurrentBlockTime] = useState<number>(
    Math.floor(Date.now() / 1000)
  );

  const loadData = useCallback(async () => {
    if (resourceId <= 0n || !publicClient) return;
    setLoading(true);
    try {
      const [r, logs, blockTime] = await Promise.all([
        fetchResource(resourceId),
        fetchBookingLogs(resourceId),
        fetchBlockTimestamp(),
      ]);
      setResource(r);
      setCurrentBlockTime(blockTime);

      // Get all unique start times from booked events
      const uniqueStarts = Array.from(
        new Set(logs.booked.map((e) => e.start))
      ).sort((a, b) => (a < b ? -1 : 1));

      // Query current on-chain status for each slot
      const verifiedBookings: ManagedBooking[] = await Promise.all(
        uniqueStarts.map(async (start) => {
          try {
            const b = await publicClient.readContract({
              address: contractAddress,
              abi: reserveAbi,
              functionName: "bookingOf",
              args: [resourceId, start],
            });
            return {
              start,
              booker: b.booker,
              status: b.status as BookingStatus,
            };
          } catch {
            return {
              start,
              booker: "0x0000000000000000000000000000000000000000",
              status: BookingStatus.None,
            };
          }
        })
      );

      setBookings(verifiedBookings);
    } catch (err) {
      console.error("Failed to load host bookings:", err);
    } finally {
      setLoading(false);
    }
  }, [
    resourceId,
    publicClient,
    contractAddress,
    fetchResource,
    fetchBookingLogs,
    fetchBlockTimestamp,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleHostCancel = async (start: bigint) => {
    const ok = await hostCancel(resourceId, start);
    if (ok) {
      await loadData();
    }
  };

  const handleCollect = async (start: bigint) => {
    const ok = await collect(resourceId, start);
    if (ok) {
      await loadData();
    }
  };

  const nowBig = BigInt(currentBlockTime);

  // Collectable total: Booked slots where start <= now
  const collectableTotal = useMemo(() => {
    if (!resource) return 0n;
    const eligibleCount = bookings.filter(
      (b) => b.status === BookingStatus.Booked && b.start <= nowBig
    ).length;
    return BigInt(eligibleCount) * resource.price;
  }, [resource, bookings, nowBig]);

  const isHost =
    address &&
    resource &&
    resource.host.toLowerCase() === address.toLowerCase();

  if (loading) {
    return (
      <PageShell nav={NAV} title="Host Dashboard">
        <div className="flex flex-col items-center justify-center p-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] my-6">
          <Spinner size={24} />
          <p className="mt-3 text-xs text-[var(--text-secondary)] font-mono">
            Loading host management data...
          </p>
        </div>
      </PageShell>
    );
  }

  if (!resource || resource.host === "0x0000000000000000000000000000000000000000") {
    return (
      <PageShell nav={NAV} title="Resource Not Found">
        <div className="p-8 text-center rounded-[2px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] my-6">
          <p className="text-xs text-[var(--text-secondary)]">
            Resource #{rawId} was not found on BOT Chain.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      nav={NAV}
      title={`Manage: ${resource.name}`}
      description="Host control console for booking management, host-initiated cancellations, and revenue collection."
      action={
        <div className="flex items-center gap-2">
          <Link
            href={`/r/${resource.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-heading font-medium text-xs tracking-wider border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            ← View Timetable
          </Link>
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all shadow-xs"
          >
            My Till & Balance →
          </Link>
        </div>
      }
    >
      <BotChainGate>
        {!isHost ? (
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--warning)] rounded-[2px] my-6 text-xs text-[var(--text-primary)]">
            <h3 className="font-heading font-bold text-sm uppercase tracking-wider mb-1">
              Host Access Restricted
            </h3>
            <p className="text-[var(--text-secondary)]">
              Your connected wallet ({address?.slice(0, 6)}...{address?.slice(-4)}) is not the registered host ({resource.host.slice(0, 6)}...{resource.host.slice(-4)}) of this calendar.
            </p>
          </div>
        ) : (
          <div className="space-y-6 my-4">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
                <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
                  Collectable Slot Revenue
                </span>
                <span className="font-mono font-bold text-xl text-[var(--accent)] mt-1 block">
                  {formatEther(collectableTotal)} BOT
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                  From started bookings ready to collect
                </span>
              </div>

              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
                <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
                  Slot Price
                </span>
                <span className="font-mono font-bold text-xl text-[var(--text-primary)] mt-1 block">
                  {formatEther(resource.price)} BOT
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                  per {formatDuration(resource.slotSecs)}
                </span>
              </div>

              <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
                <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
                  Cancel Cutoff Window
                </span>
                <span className="font-mono font-bold text-xl text-[var(--text-primary)] mt-1 block">
                  {formatDuration(resource.cutoffSecs)}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                  Pre-start booker cutoff
                </span>
              </div>
            </div>

            {/* Bookings Management Table */}
            <Panel>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                    All Recorded Bookings
                  </h3>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Slots that have been reserved on this calendar
                  </span>
                </div>
                <span className="font-mono text-xs text-[var(--text-secondary)]">
                  {bookings.length} {bookings.length === 1 ? "slot" : "slots"}
                </span>
              </div>

              {bookings.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
                  No bookings have been made yet for this resource.
                </div>
              ) : (
                <div className="overflow-x-auto timetable-scroll">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)] font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                        <th className="p-3 pl-4">Slot Time (Local)</th>
                        <th className="p-3 hidden sm:table-cell">UTC</th>
                        <th className="p-3">Booker</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 pr-4 text-right">Host Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => {
                        const isPast = b.start <= nowBig;
                        const isBooked = b.status === BookingStatus.Booked;
                        const isCollected = b.status === BookingStatus.Collected;
                        const isCancelled = b.status === BookingStatus.Cancelled;

                        return (
                          <tr
                            key={b.start.toString()}
                            className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors"
                          >
                            <td className="p-3 pl-4 font-mono font-medium text-[var(--text-primary)]">
                              {formatTimeLocal(b.start)}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)] hidden sm:table-cell">
                              {formatTimeUTC(b.start)}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)]">
                              {b.booker.slice(0, 6)}...{b.booker.slice(-4)}
                            </td>
                            <td className="p-3">
                              {isBooked && (
                                <Badge variant={isPast ? "confirmed" : "default"}>
                                  {isPast ? "Ready to Collect" : "Upcoming"}
                                </Badge>
                              )}
                              {isCollected && (
                                <Badge variant="default">Collected</Badge>
                              )}
                              {isCancelled && (
                                <Badge variant="default">Cancelled</Badge>
                              )}
                            </td>
                            <td className="p-3 pr-4 text-right">
                              {isBooked && !isPast && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={isTransacting}
                                  onClick={() => handleHostCancel(b.start)}
                                  title="Cancel booking and refund booker in full"
                                >
                                  Host Cancel
                                </Button>
                              )}
                              {isBooked && isPast && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={isTransacting}
                                  onClick={() => handleCollect(b.start)}
                                >
                                  Collect
                                </Button>
                              )}
                              {(isCollected || isCancelled) && (
                                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                  Done
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </BotChainGate>
    </PageShell>
  );
}
