"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useReserve } from "@/lib/useReserve";
import { MAX_NAME } from "@/lib/limits";

const NAV = [
  { href: "/", label: "Resource Index" },
  { href: "/new", label: "Open Resource" },
  { href: "/me", label: "My Bookings & Till" },
];

const SLOT_OPTIONS = [
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
  { value: 14400, label: "4 hours" },
  { value: 28800, label: "8 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "24 hours" },
];

const CUTOFF_OPTIONS = [
  { value: 0, label: "None (Free cancellation right up to start)" },
  { value: 3600, label: "1 hour before slot start" },
  { value: 21600, label: "6 hours before slot start" },
  { value: 43200, label: "12 hours before slot start" },
  { value: 86400, label: "24 hours before slot start" },
  { value: 172800, label: "48 hours (2 days) before slot start" },
  { value: 604800, label: "7 days before slot start" },
];

export default function NewResourcePage() {
  const router = useRouter();
  const { openResource, isTransacting } = useReserve();

  const [name, setName] = useState("");
  const [priceStr, setPriceStr] = useState("0.05");
  const [slotSecs, setSlotSecs] = useState(1800);
  const [cutoffSecs, setCutoffSecs] = useState(86400);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Resource name is required.");
      return;
    }
    if (trimmedName.length > MAX_NAME) {
      setFormError(`Name cannot exceed ${MAX_NAME} characters.`);
      return;
    }

    const priceNum = parseFloat(priceStr);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError("Price must be a positive number.");
      return;
    }

    try {
      const priceWei = parseEther(priceStr);
      const newId = await openResource(
        trimmedName,
        priceWei,
        slotSecs,
        cutoffSecs
      );
      if (newId) {
        router.push(`/r/${newId}`);
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to register resource.");
    }
  };

  return (
    <PageShell
      nav={NAV}
      title="Open a Bookable Resource"
      description="Register your calendar on BOT Chain. Configure fixed slot lengths, deposit price, and cancellation cutoff terms."
    >
      <div className="max-w-2xl mx-auto my-4 space-y-6">
        <BotChainGate>
          <Panel>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label className="block font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
                  Resource Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Studio Room A, Coaching Session, Tennis Court"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                  required
                />
                <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                  Max {MAX_NAME} characters ({name.length}/{MAX_NAME})
                </span>
              </div>

              {/* Price per slot */}
              <div>
                <label className="block font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
                  Price per Slot (BOT)
                </label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.000001"
                  placeholder="0.05"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  required
                />
                <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                  Deposited upfront by the booker. Released to your till after the slot starts.
                </span>
              </div>

              {/* Slot length */}
              <div>
                <label className="block font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
                  Slot Length
                </label>
                <select
                  value={slotSecs}
                  onChange={(e) => setSlotSecs(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent)]"
                >
                  {SLOT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                  Must divide 24 hours so slots tile seamlessly across midnight.
                </span>
              </div>

              {/* Cancellation cutoff */}
              <div>
                <label className="block font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
                  Cancellation Cutoff
                </label>
                <select
                  value={cutoffSecs}
                  onChange={(e) => setCutoffSecs(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent)]"
                >
                  {CUTOFF_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                  If cancelled before this cutoff, the booker receives a 100% refund.
                  Inside this window, cancellations are locked.
                </span>
              </div>

              {formError && (
                <div className="p-3 text-xs text-[var(--danger)] bg-red-50 border border-red-200 rounded-[2px]">
                  {formError}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-between">
                <Link
                  href="/"
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  ← Cancel & Return
                </Link>
                <Button
                  type="submit"
                  disabled={isTransacting || !name.trim()}
                  className="px-6 py-2.5 font-heading font-bold text-xs uppercase tracking-wider"
                >
                  {isTransacting ? "Registering on BOT Chain..." : "Open Resource Calendar"}
                </Button>
              </div>
            </form>
          </Panel>
        </BotChainGate>

        {/* Informational Callout */}
        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] text-xs text-[var(--text-secondary)] space-y-1.5">
          <span className="font-heading font-bold text-[11px] uppercase tracking-wider text-[var(--text-primary)] block">
            Immutable Protocol Guarantee
          </span>
          <p>
            Once opened, slot lengths and prices cannot be modified. Bookers can reserve slots up to 60 days ahead. As the host, you may cancel any slot anytime prior to its start (triggering an automatic full refund).
          </p>
        </div>
      </div>
    </PageShell>
  );
}
