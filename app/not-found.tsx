import React from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell title="404 — Slot Not Found">
      <div className="p-12 text-center rounded-[2px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] my-6">
        <h2 className="font-heading font-bold text-base uppercase tracking-wider text-[var(--text-primary)]">
          Resource or Timetable Not Found
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-2 max-w-sm mx-auto">
          The requested resource calendar does not exist on BOT Chain or may have been indexed incorrectly.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex px-4 py-2 rounded-[2px] font-heading font-bold text-xs uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 transition-all shadow-xs"
          >
            ← Return to Resource Index
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
