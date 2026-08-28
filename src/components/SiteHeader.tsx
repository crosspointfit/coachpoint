import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-6 lg:px-8">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-3 rounded-md"
          aria-label="CoachPoint home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-sm font-black text-white">
            CP
          </span>
          <span>
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
            className="focus-ring rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-primary-700"
          >
            Therapist workspace
          </Link>
          <Link
            href="/motion-lab"
            className="focus-ring rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-primary-700"
          >
            Motion lab
          </Link>
          <a
            href="https://webmcp.devpost.com/"
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 hover:text-primary-700"
          >
            WebMCP Challenge
          </a>
        </nav>
      </div>
    </header>
  );
}
