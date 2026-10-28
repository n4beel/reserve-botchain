import React from "react";

/**
 * Architectural Limitation Panel for Reserve.
 * Exact copy per spec §3.4.
 */
export default function LimitationBlock() {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[2px] p-5 md:p-6 my-8 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[var(--text-secondary)]"
          aria-hidden="true"
        />
        <h2 className="font-heading font-bold text-sm tracking-wide uppercase text-[var(--text-primary)]">
          What a booking can&apos;t promise
        </h2>
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
        The Reserve smart contract holds slot deposits securely and enforces cancellation cutoffs on BOT Chain. Note the structural protocol boundaries:
      </p>

      <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 border-t border-[var(--border-subtle)]">
        <li className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--accent)] font-bold text-sm leading-none">•</span>
          <span>
            <strong className="text-[var(--text-primary)] font-semibold block mb-0.5">
              Attendance is off-chain
            </strong>
            Nobody here can tell whether the slot was used.
          </span>
        </li>

        <li className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--accent)] font-bold text-sm leading-none">•</span>
          <span>
            <strong className="text-[var(--text-primary)] font-semibold block mb-0.5">
              Host cancellation rights
            </strong>
            The host can cancel. You will be refunded in full.
          </span>
        </li>

        <li className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--accent)] font-bold text-sm leading-none">•</span>
          <span>
            <strong className="text-[var(--text-primary)] font-semibold block mb-0.5">
              Fixed slot terms
            </strong>
            Length and price are fixed when the slot calendar is opened.
          </span>
        </li>
      </ul>
    </div>
  );
}
