import type { AgentActivity } from "@/domain/types";

interface ActivityLogProps {
  activities: AgentActivity[];
}

const ACTOR_STYLES = {
  agent: "bg-primary-100 text-primary-700",
  therapist: "bg-[#FFF0EC] text-coral-600",
  system: "bg-slate-100 text-slate-600",
} as const;

export default function ActivityLog({ activities }: ActivityLogProps) {
  return (
    <section aria-labelledby="activity-heading" className="border-t border-border bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 lg:px-6">
        <h2 id="activity-heading" className="text-sm font-extrabold text-ink-900">
          Shared activity
        </h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Human and agent attribution
        </p>
      </div>
      <div className="max-h-52 overflow-y-auto px-5 py-3 lg:px-6">
        {activities.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ol className="space-y-2">
            {activities.map((activity) => (
              <li key={activity.id} className="grid grid-cols-[74px_1fr_auto] items-start gap-3 text-xs">
                <span
                  className={`inline-flex w-fit rounded-full px-2 py-0.5 font-bold capitalize ${ACTOR_STYLES[activity.actor]}`}
                >
                  {activity.actor}
                </span>
                <span className="leading-5 text-slate-700">
                  <strong className="text-ink-900">{activity.action}</strong>{" "}
                  {activity.detail}
                </span>
                <time className="font-mono text-[10px] leading-5 text-slate-400">
                  {new Date(activity.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

