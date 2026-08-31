"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const navClass = (href: string) =>
    `focus-ring relative rounded-lg px-3 py-2 transition-colors ${
      pathname.startsWith(href)
        ? "text-ink-900 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:bg-primary-700"
        : "text-slate-500 hover:bg-slate-50 hover:text-primary-700"
    }`;

  return (
    <header className="border-b border-border bg-white">
      <div className={`mx-auto flex h-16 w-full items-center justify-between ${isHome ? "max-w-[1200px] px-5 sm:px-6" : "max-w-[1440px] px-4 sm:px-6 lg:px-8"}`}>
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
          {isHome ? (
            <>
              <a href="#exercise-library" className="focus-ring hidden rounded-lg px-3 py-2 text-slate-600 hover:text-primary-700 md:inline-flex">Movement library</a>
              <a href="#how-it-works" className="focus-ring hidden rounded-lg px-3 py-2 text-slate-600 hover:text-primary-700 lg:inline-flex">How it works</a>
              <Link href="/motion-lab" className="focus-ring mr-2 hidden rounded-lg px-3 py-2 text-slate-500 hover:text-primary-700 sm:inline-flex">Motion lab</Link>
              <Link href="/therapist" className="focus-ring inline-flex min-h-10 items-center rounded-full bg-ink-900 px-5 text-xs font-bold text-white hover:bg-primary-800 sm:text-sm">Open workspace</Link>
            </>
          ) : (
            <>
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
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
