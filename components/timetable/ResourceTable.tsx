import React from "react";
import Link from "next/link";
import { formatEther } from "viem";
import type { ResourceData } from "@/lib/reserve";
import { formatDuration, formatTimeLocal } from "@/lib/reserve";

interface ResourceRow {
  resource: ResourceData;
  nextFreeSlot?: bigint | null;
}

interface ResourceTableProps {
  resources: ResourceRow[];
  emptyMessage?: string;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Resource Index Table for the Reserve homepage.
 * Plain scheduling-desk table per spec §3.1:
 * Host / Name · Slot length · Cutoff · Price · Next Free Slot · Action.
 */
export default function ResourceTable({
  resources,
  emptyMessage = "No bookable resources have been registered yet.",
}: ResourceTableProps) {
  if (resources.length === 0) {
    return (
      <div className="p-12 text-center rounded-[2px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] my-6">
        <h3 className="font-heading font-bold text-sm uppercase tracking-wider text-[var(--text-primary)]">
          {emptyMessage}
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
          Be the first host to register a bookable resource on BOT Chain.
        </p>
        <div className="mt-5">
          <Link
            href="/new"
            className="inline-flex px-4 py-2 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all shadow-xs"
          >
            + Open a Resource
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full my-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] overflow-hidden shadow-xs">
      <div className="overflow-x-auto timetable-scroll">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)] font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
              <th className="p-3.5 pl-4 sm:pl-6">Resource Name</th>
              <th className="p-3.5 hidden sm:table-cell">Host</th>
              <th className="p-3.5">Slot Length</th>
              <th className="p-3.5 hidden md:table-cell">Cancel Cutoff</th>
              <th className="p-3.5">Price / Slot</th>
              <th className="p-3.5 hidden lg:table-cell">Next Free Slot</th>
              <th className="p-3.5 pr-4 sm:pr-6 text-right">Timetable</th>
            </tr>
          </thead>
          <tbody>
            {resources.map(({ resource, nextFreeSlot }) => {
              const priceBot = formatEther(resource.price);
              const nextSlotLabel = nextFreeSlot
                ? formatTimeLocal(nextFreeSlot)
                : "Open Now";

              return (
                <tr
                  key={resource.id.toString()}
                  className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  {/* Name and mobile subtext */}
                  <td className="p-3.5 pl-4 sm:pl-6 font-semibold text-[var(--text-primary)]">
                    <Link
                      href={`/r/${resource.id}`}
                      className="hover:text-[var(--accent)] transition-colors block"
                    >
                      {resource.name}
                    </Link>
                    <span className="sm:hidden font-mono text-[10px] text-[var(--text-secondary)] block mt-0.5">
                      Host: {truncate(resource.host)}
                    </span>
                  </td>

                  {/* Host */}
                  <td className="p-3.5 font-mono text-[11px] text-[var(--text-secondary)] hidden sm:table-cell">
                    {truncate(resource.host)}
                  </td>

                  {/* Slot duration */}
                  <td className="p-3.5 text-[var(--text-primary)] font-medium">
                    {formatDuration(resource.slotSecs)}
                  </td>

                  {/* Cutoff duration */}
                  <td className="p-3.5 text-[var(--text-secondary)] hidden md:table-cell">
                    {resource.cutoffSecs === 0
                      ? "None (until start)"
                      : formatDuration(resource.cutoffSecs)}
                  </td>

                  {/* Price */}
                  <td className="p-3.5 font-mono font-bold text-[var(--text-primary)]">
                    {priceBot} BOT
                  </td>

                  {/* Next free slot */}
                  <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px] hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                      {nextSlotLabel}
                    </span>
                  </td>

                  {/* Link action */}
                  <td className="p-3.5 pr-4 sm:pr-6 text-right">
                    <Link
                      href={`/r/${resource.id}`}
                      className="inline-flex items-center gap-1 text-[var(--accent)] font-heading font-semibold text-xs uppercase tracking-wider hover:underline"
                    >
                      <span>Book</span>
                      <span>→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
