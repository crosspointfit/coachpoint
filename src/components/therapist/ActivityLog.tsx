import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { AgentActivity } from "@/domain/types";

interface ActivityLogProps {
  activities: AgentActivity[];
}

function stableUtcTime(isoTimestamp: string): string {
  const match = isoTimestamp.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]} UTC` : "—";
}

const ACTOR_STYLES = {
  agent: "bg-primary-700",
  therapist: "bg-coral-500",
  system: "bg-slate-400",
} as const;

export default function ActivityLog({ activities }: ActivityLogProps) {
  const recent = activities.slice(0, 3);

  return (
    <section aria-labelledby="activity-heading" className="border-t border-border bg-white px-5 py-4 lg:px-7">
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Audit trail
          </p>
          <h2 id="activity-heading" className="mt-0.5 text-sm font-extrabold text-ink-900">
            Shared activity
          </h2>
        </div>

        <ol className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
          {recent.length === 0 ? (
            <li className="text-xs text-slate-500">No activity yet.</li>
          ) : (
            recent.map((activity) => (
              <li key={activity.id} className="flex min-w-0 items-start gap-2 border-l border-border pl-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTOR_STYLES[activity.actor]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-ink-900">
                    {activity.action}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                    {activity.actor} · {stableUtcTime(activity.createdAt)}
                  </span>
                </span>
              </li>
            ))
          )}
        </ol>

        {activities.length > 0 && (
          <details className="group relative shrink-0">
            <summary className="focus-ring flex list-none items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-primary-700 hover:bg-primary-100 [&::-webkit-details-marker]:hidden">
              View history
              <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute bottom-9 right-0 z-30 max-h-64 w-[min(520px,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-border bg-white p-3 shadow-[0_16px_40px_rgba(20,53,95,0.16)]">
              <ol className="space-y-2">
                {activities.map((activity) => (
                  <li key={activity.id} className="grid grid-cols-[68px_1fr_auto] items-start gap-2 text-[11px]">
                    <span className="font-bold capitalize text-slate-500">{activity.actor}</span>
                    <span className="leading-4 text-slate-600">
                      <strong className="text-ink-900">{activity.action}</strong>{" "}
                      {activity.detail}
                    </span>
                    <time dateTime={activity.createdAt} className="font-mono text-[9px] text-slate-400">
                      {stableUtcTime(activity.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
