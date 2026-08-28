interface WebMcpSupportNoticeProps {
  supported: boolean;
  status: "checking" | "registering" | "ready" | "unsupported" | "error";
  error?: string;
}

export default function WebMcpSupportNotice({
  supported,
  status,
  error,
}: WebMcpSupportNoticeProps) {
  const ready = supported && status === "ready";
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-xs lg:px-6 ${
        ready
          ? "border-primary-100 bg-[#F3FAFD] text-primary-800"
          : "border-[#E9D7B6] bg-[#FFF9ED] text-[#74501D]"
      }`}
      role="status"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`h-2 w-2 rounded-full ${ready ? "bg-primary-700" : "bg-[#C47B14]"}`}
          aria-hidden="true"
        />
        <p>
          <strong>
            {ready
              ? "Three therapist site tools are ready."
              : status === "unsupported"
                ? "Site tools are not available in this browser."
                : status === "error"
                  ? "Site tool registration needs attention."
                  : "Checking site tool support…"}
          </strong>{" "}
          {!ready && "The complete manual workflow remains available."}
        </p>
      </div>
      {error && <p className="max-w-xl truncate text-[11px]">{error}</p>}
    </div>
  );
}

