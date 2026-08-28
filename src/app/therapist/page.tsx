import type { Metadata } from "next";
import TherapistWorkspace from "@/components/therapist/TherapistWorkspace";

export const metadata: Metadata = {
  title: "Therapist workspace",
  description:
    "Search a curated exercise catalog with an agent, review the visible draft, and keep final prescription confirmation human.",
};

export default function TherapistPage() {
  return <TherapistWorkspace />;
}
