import type { Metadata } from "next";
import TherapistDashboard from "@/components/therapist/TherapistDashboard";

export const metadata: Metadata = {
  title: "Therapist caseload",
  description:
    "Review synthetic clients, agent drafts, and therapist-confirmed care plans in CoachPoint.",
};

export default function TherapistPage() {
  return <TherapistDashboard />;
}
