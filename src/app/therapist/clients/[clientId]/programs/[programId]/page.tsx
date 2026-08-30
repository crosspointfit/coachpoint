import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TherapistWorkspace from "@/components/therapist/TherapistWorkspace";
import { getSyntheticClient } from "@/domain";

export const metadata: Metadata = {
  title: "Prescription editor",
  description:
    "Build, review, and confirm one synthetic client's home exercise prescription.",
};

interface PrescriptionEditorPageProps {
  params: Promise<{ clientId: string; programId: string }>;
}

export default async function PrescriptionEditorPage({
  params,
}: PrescriptionEditorPageProps) {
  const { clientId, programId } = await params;
  if (!getSyntheticClient(clientId)) notFound();

  return <TherapistWorkspace clientId={clientId} programId={programId} />;
}
