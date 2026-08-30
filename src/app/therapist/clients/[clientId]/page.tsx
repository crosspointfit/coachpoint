import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientProgramHub from "@/components/therapist/ClientProgramHub";
import { getClient, listClients } from "@/lib/caseloadStorage";

export const metadata: Metadata = {
  title: "Client program hub",
  description:
    "Review synthetic clinical context, prescription drafts, and active CoachPoint programs.",
};

export function generateStaticParams() {
  return listClients().map((client) => ({ clientId: client.id }));
}

export default async function TherapistClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = getClient(clientId);

  if (!client) notFound();

  return <ClientProgramHub initialClient={client} />;
}
