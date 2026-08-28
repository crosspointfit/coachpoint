import type { Metadata } from "next";
import MotionLab from "@/components/motion/MotionLab";

export const metadata: Metadata = {
  title: "Motion lab",
  description:
    "An isolated browser-local MediaPipe half-squat motion lab for CoachPoint.",
  robots: { index: false, follow: false },
};

export default function MotionLabPage() {
  return <MotionLab />;
}

