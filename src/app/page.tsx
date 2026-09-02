import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { EXERCISES, getExerciseById, SYNTHETIC_CLIENTS } from "@/domain";
import HomeExerciseGallery from "@/components/home/HomeExerciseGallery";

const STEPS = [
  {
    number: "01",
    title: "Set the clinical boundaries.",
    body: "Define the goal, available time, equipment and safety notes before a movement enters the plan.",
    detail: "Your context guides every draft",
  },
  {
    number: "02",
    title: "Create a review-ready draft.",
    body: "Choose from the illustrated library or ask an agent to assemble the first version. Then adjust dosage and order in the same workspace.",
    detail: "The repetitive work, handled in minutes",
  },
  {
    number: "03",
    title: "Follow what happens at home.",
    body: "Confirm the prescription yourself, then let the patient follow it in the browser and bring useful set results back to the next visit.",
    detail: "Patient follow-up without giving up control",
  },
] as const;

const FAQS = [
  {
    question: "Can I use CoachPoint without an agent?",
    answer: "Yes. Search the library, select movements, adjust dosage and confirm a plan entirely through the interface. Agent assistance is optional.",
  },
  {
    question: "Who can confirm a prescription?",
    answer: "Only the therapist, using the confirmation control in the workspace. An agent can create a visible draft, but cannot confirm or activate a prescription.",
  },
  {
    question: "Where does this demo keep its data?",
    answer: "The demo uses synthetic clients and stores plans in your current browser. Patient links work in that same browser; cross-device sharing and real client records are not supported yet.",
  },
] as const;

function HeroExerciseCard({ id, className }: { id: string; className: string }) {
  const exercise = getExerciseById(id);
  if (!exercise) return null;
  return (
    <div className={"home-hero-card " + className}>
      <Image
        src={exercise.thumbnailPath ?? exercise.imagePath}
        alt=""
        width={960}
        height={720}
        sizes="(min-width: 1024px) 260px, 200px"
        loading="eager"
        className="aspect-square w-full bg-[#FCFCFA] object-contain"
      />
      <div className="border-t border-border px-3.5 py-3">
        <p className="text-xs font-extrabold text-ink-900 sm:text-sm">{exercise.name}</p>
        <p className="mt-1 text-[10px] capitalize text-slate-500 sm:text-xs">{exercise.bodyRegion} · Level {exercise.difficulty}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="home-page flex-1">
      <section aria-labelledby="home-heading" className="relative overflow-hidden border-b border-border">
        <div className="cp-grid absolute inset-0" aria-hidden="true" />
        <div className="home-container relative grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-3.5 py-2 text-xs font-bold text-primary-700">
              <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
              Home exercise programs for physical therapists
            </p>
            <h1 id="home-heading" className="mt-6 text-[40px] font-black leading-[1.12] tracking-[-0.035em] text-ink-900 sm:text-[54px] xl:text-[58px]">
              The home exercise workspace<br />
              <span className="text-primary-700">for physical therapists.</span>
            </h1>
            <p className="mt-6 max-w-[510px] text-base leading-[1.85] text-slate-600 sm:text-lg">
              Rehab continues after the visit. Build a clear program in minutes,
              let patients follow it in the browser, and review what happened—while
              every clinical decision stays with you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/therapist" className="home-primary-cta focus-ring">
                Build a program
                <ArrowRightIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className="home-secondary-cta focus-ring">
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Try it with synthetic clients. No sign-up needed.</p>
            <dl className="mt-8 grid max-w-[480px] grid-cols-3 border-t border-border pt-6">
              <div className="pr-3">
                <dd className="text-3xl font-bold tabular-nums text-ink-900">{EXERCISES.length}</dd>
                <dt className="mt-1 text-xs leading-5 text-slate-500">Illustrated movements</dt>
              </div>
              <div className="border-l border-border px-4 sm:px-6">
                <dd className="text-3xl font-bold tabular-nums text-ink-900">{SYNTHETIC_CLIENTS.length}</dd>
                <dt className="mt-1 text-xs leading-5 text-slate-500">Demo client cases</dt>
              </div>
              <div className="border-l border-border pl-4 sm:pl-6">
                <dd className="text-3xl font-bold text-ink-900">You</dd>
                <dt className="mt-1 text-xs leading-5 text-slate-500">Make the final call</dt>
              </div>
            </dl>
          </div>

          <div className="home-hero-art" aria-hidden="true">
            <HeroExerciseCard id="bridge" className="home-hero-card-left" />
            <HeroExerciseCard id="chin-tuck" className="home-hero-card-center" />
            <HeroExerciseCard id="bird-dog" className="home-hero-card-right" />
            <div className="home-review-note">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-ink-900">Agent drafts. You decide.</p>
                <p className="mt-1 text-xs text-slate-500">A visible plan, ready for clinical review.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomeExerciseGallery exercises={EXERCISES} />

      <section id="how-it-works" aria-labelledby="workflow-heading" className="scroll-mt-8 border-b border-border">
        <div className="home-container py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="home-eyebrow">From prescription to follow-up</p>
            <h2 id="workflow-heading" className="home-section-heading">One clear workflow,<br />before and after the visit.</h2>
          </div>
          <ol className="mt-10 grid gap-7 md:grid-cols-3 md:gap-8">
            {STEPS.map((step) => (
              <li key={step.number} className="border-t border-primary-700/30 pt-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white">{step.number}</span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight text-ink-900">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{step.body}</p>
                <p className="mt-5 flex items-start gap-2 text-xs font-bold leading-5 text-primary-700">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="questions-heading" className="border-b border-border bg-white">
        <div className="home-container grid gap-8 py-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16 lg:py-20">
          <div>
            <p className="home-eyebrow">A few things to know</p>
            <h2 id="questions-heading" className="home-section-heading">Human judgment<br />stays in the loop.</h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-slate-500">The agent helps with preparation and follow-up. The therapist remains responsible for the prescription.</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {FAQS.map((faq, index) => (
              <details key={faq.question} className="group py-5" open={index === 0}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-5 text-base font-bold text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <PlusIcon className="h-5 w-5 shrink-0 text-primary-700 transition-transform group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="mt-3 pr-8 text-sm leading-7 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="start-heading" className="bg-ink-900 text-white">
        <div className="home-container flex flex-col items-start justify-between gap-8 py-14 lg:flex-row lg:items-center lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-100">Ready when you are</p>
            <h2 id="start-heading" className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">Build the next home program in minutes.</h2>
            <p className="mt-4 text-sm leading-7 text-white/75">Start with a synthetic case and try the complete therapist-to-patient workflow.</p>
          </div>
          <Link href="/therapist" className="home-primary-cta focus-ring shrink-0">
            Open therapist workspace
            <ArrowRightIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
