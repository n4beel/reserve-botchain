"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] border border-[#0D877F] hover:brightness-105 active:brightness-95 shadow-xs font-bold",
  secondary:
    "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-overlay)] hover:border-[var(--text-secondary)]",
  outline:
    "bg-transparent text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]",
  danger:
    "bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger)]/10 active:bg-[var(--danger)]/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-[10px] tracking-wider",
  sm: "px-3 py-1.5 text-[11px] tracking-wide",
  md: "px-4 py-2 text-[12px] tracking-wider",
  lg: "px-6 py-3 text-[13px] tracking-widest",
};

/**
 * Scheduling-desk button tailored for Archetype AG · Timetable.
 * Uses Red Hat Display, sharp corners, and high-contrast tactile feedback.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2",
          "font-heading font-semibold uppercase transition-all duration-150",
          "rounded-[2px] cursor-pointer select-none",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
