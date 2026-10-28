import { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  accentStripe?: boolean;
  elevated?: boolean;
  noPadding?: boolean;
}

/**
 * Scheduling-desk card / container for Archetype AG · Timetable.
 * Crisp pale-blue surface, sharp navy border, and optional accent top stripe.
 */
export default function Panel({
  title,
  subtitle,
  badge,
  accentStripe = false,
  elevated = false,
  noPadding = false,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  return (
    <div
      className={[
        "relative rounded-[2px] transition-all overflow-hidden",
        elevated
          ? "bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xs"
          : "bg-[var(--bg-surface)] border border-[var(--border-default)]",
        className,
      ].join(" ")}
      style={style}
      {...props}
    >
      {accentStripe && (
        <div
          className="h-1 w-full bg-[var(--accent)]"
          aria-hidden="true"
        />
      )}

      {(title || subtitle || badge) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div>
            {title && (
              <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {badge && <div className="flex-shrink-0">{badge}</div>}
        </div>
      )}

      <div className={noPadding ? "" : "p-5 md:p-6"}>{children}</div>
    </div>
  );
}
