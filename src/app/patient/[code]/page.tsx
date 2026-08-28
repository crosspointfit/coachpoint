import type { Metadata } from "next";
import PatientSessionWorkspace from "@/components/patient/PatientSessionWorkspace";

export const metadata: Metadata = {
  title: "Patient program",
  robots: { index: false, follow: false },
};

export default async function PatientProgramPlaceholder({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PatientSessionWorkspace code={code} />;
}
