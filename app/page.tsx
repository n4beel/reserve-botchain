"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import ResourceTable from "@/components/timetable/ResourceTable";
import LimitationBlock from "@/components/timetable/LimitationBlock";
import Spinner from "@/components/ui/Spinner";
import { useReserve } from "@/lib/useReserve";
import type { ResourceData } from "@/lib/reserve";
import { app } from "@/lib/app-config";

const NAV = [
  { href: "/", label: "Resource Index" },
  { href: "/new", label: "Open Resource" },
  { href: "/me", label: "My Bookings & Till" },
];

export default function HomePage() {
  const { fetchLatest, deployed } = useReserve();
  const [resources, setResources] = useState<ResourceData[]>([]);
  const [totalCount, setTotalCount] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);

  const loadResources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLatest(0n, 50n);
      setResources(res.resources);
      setTotalCount(res.total);
    } catch (err) {
      console.error("Failed to load resources:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchLatest]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const rows = resources.map((r) => ({
    resource: r,
    nextFreeSlot: null,
  }));

  return (
    <PageShell
      nav={NAV}
      title="Bookable Timetables"
      description={app.tagline}
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all shadow-xs"
          >
            + Open a Resource
          </Link>
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] font-heading font-medium text-xs tracking-wider border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            My Bookings & Till
          </Link>
        </div>
      }
    >
      {/* Quick Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
          <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
            Registered Resources
          </span>
          <span className="font-mono font-bold text-lg text-[var(--text-primary)] mt-0.5 block">
            {totalCount.toString()}
          </span>
        </div>
        <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
          <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
            Slot Step Sizes
          </span>
          <span className="font-mono text-xs text-[var(--text-primary)] mt-1.5 block">
            15m · 30m · 1h · 2h..
          </span>
        </div>
        <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
          <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
            Booking Horizon
          </span>
          <span className="font-mono text-xs text-[var(--text-primary)] mt-1.5 block">
            60 Days Ahead
          </span>
        </div>
        <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px]">
          <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)] block">
            Cancellation Policy
          </span>
          <span className="font-mono text-xs text-[var(--text-primary)] mt-1.5 block">
            Full Refund Pre-Cutoff
          </span>
        </div>
      </div>

      {/* Main Resource Index */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] my-6">
          <Spinner size={24} />
          <p className="mt-3 text-xs text-[var(--text-secondary)] font-mono">
            Reading timetable registry on BOT Chain...
          </p>
        </div>
      ) : !deployed ? (
        <div className="p-8 text-center rounded-[2px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] my-6">
          <p className="text-xs text-[var(--text-secondary)]">
            Reserve smart contract is not yet deployed on this network.
          </p>
        </div>
      ) : (
        <ResourceTable
          resources={rows}
          emptyMessage="No bookable resources registered yet"
        />
      )}

      {/* Protocol Boundaries & Copy Mandate (§1, §3.4) */}
      <LimitationBlock />
    </PageShell>
  );
}
