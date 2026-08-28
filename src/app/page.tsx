import Link from "next/link";

const STEPS = [
  {
    number: "01",
    title: "Agent assembles",
    body: "The agent searches a curated exercise catalog and creates a time-bounded, visible draft.",
  },
  {
    number: "02",
    title: "Therapist decides",
    body: "A clinician edits dosage and order, then explicitly confirms the prescription in the UI.",
  },
  {
    number: "03",
    title: "Browser observes",
    body: "The patient page will process motion locally and return structured set summaries through WebMCP.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-border bg-white">
        <div className="cp-grid absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid w-full max-w-[1280px] gap-14 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:px-8 lg:py-28">
          <div>
            <p className="inline-flex rounded-full border border-primary-100 bg-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
              Agent-native rehabilitation workflow
            </p>
            <h1 className="mt-6 max-w-4xl text-[44px] font-black leading-[1.04] tracking-[-0.04em] text-ink-900 sm:text-[62px]">
              Clinical judgment stays human. The busywork becomes collaborative.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              CoachPoint lets a therapist and an agent work on the same live prescription draft. The agent searches and assembles; the therapist reviews and confirms.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/therapist"
                className="focus-ring inline-flex h-12 items-center rounded-xl bg-coral-500 px-6 text-sm font-bold text-white hover:bg-coral-600"
              >
                Open therapist workspace
              </Link>
              <a
                href="https://learn.chatgpt.com/docs/webmcp"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-12 items-center rounded-xl border border-primary-700 px-6 text-sm font-bold text-primary-700 hover:bg-primary-100"
              >
                How site tools work
              </a>
            </div>
          </div>

          <aside className="border-l-2 border-primary-700 pl-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              The boundary
            </p>
            <p className="mt-3 text-2xl font-bold leading-9 tracking-[-0.02em] text-ink-900">
              The agent may draft. Only the therapist can prescribe.
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Every agent action is visible, every edit is attributable, and confirmation is intentionally absent from the WebMCP tool surface.
            </p>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {STEPS.map((step) => (
            <article key={step.number} className="bg-bg p-7 lg:p-9">
              <p className="font-mono text-xs font-bold tracking-[0.14em] text-primary-700">
                {step.number}
              </p>
              <h2 className="mt-7 text-xl font-extrabold text-ink-900">{step.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

