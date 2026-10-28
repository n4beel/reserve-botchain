"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";
import { tzLabel } from "@/lib/reserve";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Archetype AG · Timetable Application Shell.
 *
 * Implements a scheduling-desk top navigation bar, breadcrumb header,
 * timetable container (up to 1040px width to accommodate 7-day columns comfortably),
 * and an integrated 3-link BOT Chain footer.
 */
export default function PageShell({
  children,
  nav = [],
  title,
  description,
  action,
}: PageShellProps) {
  const links = footerLinks();
  const currentTz = tzLabel();

  return (
    <div
      className="flex flex-col min-h-[100dvh] overflow-x-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Top Scheduling Desk Ribbon */}
      <header
        className="sticky top-0 z-30 flex-shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs"
      >
        <div className="mx-auto w-full max-w-[1040px] px-4 md:px-6">
          <div className="flex items-center justify-between gap-3 py-2.5">
            {/* Logo and Brand */}
            <Link
              href="/"
              className="flex items-center gap-2.5 flex-shrink-0 no-underline group"
            >
              <div
                className="w-5 h-5 rounded-[2px] bg-[var(--accent)] flex items-center justify-center text-[var(--accent-ink)] font-bold text-xs"
                aria-hidden="true"
              >
                R
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-bold text-sm tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                  {app.name}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono -mt-0.5">
                  Timetable • {currentTz}
                </span>
              </div>
            </Link>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              <NetworkBadge />
              <div className="w-[150px] md:w-[175px] flex-shrink-0">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Navigation Tab Bar */}
          {nav.length > 0 && <TimetableNav items={nav} />}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 mx-auto w-full max-w-[1040px] px-4 py-6 md:px-6 md:py-8">
        {(title || description || action) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border-subtle)]">
            <div>
              {title && (
                <h1 className="font-heading font-bold text-xl md:text-2xl text-[var(--text-primary)] tracking-tight">
                  {title}
                </h1>
              )}
              {description && (
                <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed max-w-xl">
                  {description}
                </p>
              )}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </main>

      {/* Mandatory BOT Chain Ecosystem Footer */}
      <footer
        className="flex-shrink-0 border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-6 mt-12"
      >
        <div className="mx-auto w-full max-w-[1040px] px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{app.name}</span>
            <span className="hidden sm:inline">•</span>
            <span>{app.tagline}</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"
              />
              <BuiltOnBotChain className="uppercase tracking-wider font-semibold" />
            </span>

            <a
              href={links.site}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors"
            >
              botchain.ai
            </a>

            <a
              href={links.explorer}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-2 transition-colors"
            >
              scan.botchain.ai
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TimetableNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 -mb-px overflow-x-auto timetable-scroll pt-1 border-t border-[var(--border-subtle)]">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "px-3.5 py-2 text-xs font-heading font-semibold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2",
              active
                ? "border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-elevated)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
