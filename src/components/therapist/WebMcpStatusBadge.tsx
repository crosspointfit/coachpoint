import { CpuChipIcon } from "@heroicons/react/24/outline";
import type { WebMcpRegistrationState } from "@/lib/webmcp";

export default function WebMcpStatusBadge({
  state,
}: {
  state: WebMcpRegistrationState;
}) {
  const count = state.toolNames.length;
  const ready = state.status === "ready" && count > 0;
  const label = ready
    ? `${count} read-only tool${count === 1 ? "" : "s"} ready`
    : state.status === "unsupported"
      ? "Manual mode"
      : state.status === "error"
        ? "Tools need attention"
        : "Checking site tools";
  return (
    <span
      role="status"
      title={state.error ?? (ready
        ? "Agent tools can read this page. Only the therapist UI can confirm a prescription."
        : "The complete manual workflow remains available.")}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
        ready ? "bg-primary-100 text-primary-700" : "bg-[#FFF7E8] text-[#875000]"
      }`}
    >
      <CpuChipIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
