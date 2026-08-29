"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const navClass = (href: string) =>
    `focus-ring relative rounded-lg px-3 py-2 transition-colors ${
      pathname.startsWith(href)
        ? "text-ink-900 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-primary-700"
        : "text-slate-500 hover:bg-slate-50 hover:text-primary-700"
    }`;

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-3 rounded-md"
          aria-label="CoachPoint home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-sm font-black text-white">
            CP
          </span>
          <span className="hidden sm:block">
            <span className="block text-[15px] font-extrabold tracking-[-0.01em] text-ink-900">
              CoachPoint
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              by Crosspoint
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Primary navigation">
          <Link
            href="/therapist"
            className={navClass("/therapist")}
            aria-current={pathname.startsWith("/therapist") ? "page" : undefined}
          >
            <span className="sm:hidden">Therapist</span>
            <span className="hidden sm:inline">Therapist workspace</span>
          </Link>
          <Link
            href="/motion-lab"
            className={navClass("/motion-lab")}
            aria-current={pathname.startsWith("/motion-lab") ? "page" : undefined}
          >
            Motion lab
          </Link>
          <a
            href="https://webmcp.devpost.com/"
            target="_blank"
            rel="noreferrer"
            className="focus-ring hidden rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-50 hover:text-primary-700 lg:block"
          >
            WebMCP Challenge
          </a>
        </nav>
      </div>
    </header>
  );
}
