"use client";

import { activeBotChain } from "@/lib/botchain/chain";
import React, { useState, useEffect, useCallback } from "react";
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
  cancelDeadline,
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

interface UserBookingItem {
  id: bigint;
  start: bigint;
  resourceName: string;
  price: bigint;
  cutoffSecs: number;
  status: BookingStatus;
  cancelDeadline: bigint;
  canCancel: boolean;
}

export default function MyDashboardPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result
  const {
    contractAddress,
    deployed,
    fetchPending,
    fetchHostResources,
    fetchResource,
    fetchBlockTimestamp,
    cancel,
    withdraw,
    isTransacting,
  } = useReserve();

  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [hostedResources, setHostedResources] = useState<ResourceData[]>([]);
  const [myBookings, setMyBookings] = useState<UserBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBlockTime, setCurrentBlockTime] = useState<number>(
    Math.floor(Date.now() / 1000)
  );

  const loadUserData = useCallback(async () => {
    if (!address || !publicClient || !deployed) return;
    setLoading(true);
    try {
      const [pending, hostIds, blockTime] = await Promise.all([
        fetchPending(address),
        fetchHostResources(address),
        fetchBlockTimestamp(),
      ]);
      setPendingBalance(pending);
      setCurrentBlockTime(blockTime);

      // Load hosted resources
      const hosted = await Promise.all(
        hostIds.map((id) => fetchResource(id))
      );
      setHostedResources(
        hosted.filter((r): r is ResourceData => r !== null)
      );

      // Find all bookings for this user via Booked logs
      const bookedLogs = await publicClient.getLogs({
        address: contractAddress,
        event: {
          type: "event",
          name: "Booked",
          inputs: [
            { name: "id", type: "uint256", indexed: true },
            { name: "start", type: "uint64", indexed: true },
            { name: "booker", type: "address", indexed: true },
          ],
        },
        args: { booker: address },
        fromBlock: 0n,
        toBlock: "latest",
      });

      // Fetch on-chain status and resource details for each booking
      const nowBig = BigInt(blockTime);
      const bookingItems: UserBookingItem[] = [];

      for (const log of bookedLogs) {
        if (!log.args.id || !log.args.start) continue;
        const id = log.args.id;
        const start = BigInt(log.args.start);

        const [rData, bData] = await Promise.all([
          fetchResource(id),
          publicClient.readContract({
            address: contractAddress,
            abi: reserveAbi,
            functionName: "bookingOf",
            args: [id, start],
          }),
        ]);

        if (rData) {
          const deadline = cancelDeadline(start, rData.cutoffSecs);
          const isBooked = bData.status === BookingStatus.Booked;
          const canCancel = isBooked && nowBig <= deadline;

          bookingItems.push({
            id,
            start,
            resourceName: rData.name,
            price: rData.price,
            cutoffSecs: rData.cutoffSecs,
            status: bData.status as BookingStatus,
            cancelDeadline: deadline,
            canCancel,
          });
        }
      }

      // Sort bookings descending by start time
      bookingItems.sort((a, b) => (a.start > b.start ? -1 : 1));
      setMyBookings(bookingItems);
    } catch (err) {
      console.error("Failed to load user dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [
    address,
    publicClient,
    deployed,
    contractAddress,
    fetchPending,
    fetchHostResources,
    fetchResource,
    fetchBlockTimestamp,
  ]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleWithdraw = async () => {
    const ok = await withdraw();
    if (ok) {
      await loadUserData();
    }
  };

  const handleCancelBooking = async (id: bigint, start: bigint) => {
    const ok = await cancel(id, start);
    if (ok) {
      await loadUserData();
    }
  };

  return (
    <PageShell
      nav={NAV}
      title="My Bookings & Till"
      description="Track your reserved slots, cancellation cutoff deadlines, and withdraw refund or host revenues from the contract till."
    >
      <BotChainGate>
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] my-6">
            <Spinner size={24} />
            <p className="mt-3 text-xs text-[var(--text-secondary)] font-mono">
              Fetching personal bookings & till balances...
            </p>
          </div>
        ) : (
          <div className="space-y-6 my-4">
            {/* Pull Payment Till Balance Station */}
            <div className="p-5 md:p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--text-secondary)] block">
                  Pending Till Balance (Pull Payment)
                </span>
                <span className="font-mono font-bold text-2xl text-[var(--accent)] mt-1 block">
                  {formatEther(pendingBalance)} BOT
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                  Available for immediate pull-withdrawal to your wallet.
                </span>
              </div>
              <Button
                variant="primary"
                size="md"
                disabled={isTransacting || pendingBalance === 0n}
                onClick={handleWithdraw}
                className="font-heading font-bold text-xs uppercase tracking-wider"
              >
                {isTransacting ? "Withdrawing..." : "Withdraw to Wallet"}
              </Button>
            </div>

            {/* My Bookings Table */}
            <Panel>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                    Slots Booked by You
                  </h3>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Active and past timetable reservations
                  </span>
                </div>
                <span className="font-mono text-xs text-[var(--text-secondary)]">
                  {myBookings.length} {myBookings.length === 1 ? "booking" : "bookings"}
                </span>
              </div>

              {myBookings.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
                  You have not booked any slots yet.{" "}
                  <Link href="/" className="text-[var(--accent)] hover:underline font-semibold">
                    Browse timetables →
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto timetable-scroll">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)] font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                        <th className="p-3 pl-4">Resource</th>
                        <th className="p-3">Slot Time</th>
                        <th className="p-3 hidden sm:table-cell">Price</th>
                        <th className="p-3 hidden md:table-cell">Cancel Terms</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 pr-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myBookings.map((b) => {
                        const isBooked = b.status === BookingStatus.Booked;
                        const isCollected = b.status === BookingStatus.Collected;
                        const isCancelled = b.status === BookingStatus.Cancelled;

                        return (
                          <tr
                            key={`${b.id.toString()}-${b.start.toString()}`}
                            className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors"
                          >
                            <td className="p-3 pl-4 font-semibold text-[var(--text-primary)]">
                              <Link
                                href={`/r/${b.id}`}
                                className="hover:text-[var(--accent)] transition-colors"
                              >
                                {b.resourceName}
                              </Link>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[var(--text-primary)]">
                              {formatTimeLocal(b.start)}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)] hidden sm:table-cell">
                              {formatEther(b.price)} BOT
                            </td>
                            <td className="p-3 text-[11px] text-[var(--text-secondary)] hidden md:table-cell">
                              {b.cutoffSecs === 0 ? (
                                <span>Free until start</span>
                              ) : (
                                <span>
                                  Cutoff: {formatTimeLocal(b.cancelDeadline)}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {isBooked && (
                                <Badge variant={b.canCancel ? "confirmed" : "pending"}>
                                  {b.canCancel ? "Active" : "Past Cutoff"}
                                </Badge>
                              )}
                              {isCollected && (
                                <Badge variant="default">Completed</Badge>
                              )}
                              {isCancelled && (
                                <Badge variant="default">Cancelled</Badge>
                              )}
                            </td>
                            <td className="p-3 pr-4 text-right">
                              {isBooked && b.canCancel && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={isTransacting}
                                  onClick={() =>
                                    handleCancelBooking(b.id, b.start)
                                  }
                                >
                                  Cancel (Full Refund)
                                </Button>
                              )}
                              {isBooked && !b.canCancel && (
                                <span
                                  className="font-mono text-[11px] text-[var(--text-secondary)]"
                                  title={`Free cancellation ended at ${formatTimeLocal(
                                    b.cancelDeadline
                                  )}.`}
                                >
                                  Cutoff Passed
                                </span>
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

            {/* Hosted Resources Section */}
            {hostedResources.length > 0 && (
              <Panel>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                      Resources Hosted by You
                    </h3>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Calendars where you receive bookings
                    </span>
                  </div>
                  <Link
                    href="/new"
                    className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--accent)] hover:underline"
                  >
                    + Open Another
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hostedResources.map((hr) => (
                    <div
                      key={hr.id.toString()}
                      className="p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-[2px] flex items-center justify-between"
                    >
                      <div>
                        <h4 className="font-semibold text-xs text-[var(--text-primary)]">
                          {hr.name}
                        </h4>
                        <span className="text-[11px] text-[var(--text-secondary)] block mt-0.5">
                          {formatDuration(hr.slotSecs)} slots • {formatEther(hr.price)} BOT
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/r/${hr.id}`}
                          className="px-2.5 py-1 text-[11px] font-heading font-medium border border-[var(--border-default)] rounded-[2px] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
                        >
                          Timetable
                        </Link>
                        <Link
                          href={`/r/${hr.id}/manage`}
                          className="px-2.5 py-1 text-[11px] font-heading font-bold rounded-[2px] bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </BotChainGate>
    </PageShell>
  );
}
