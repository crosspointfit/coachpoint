import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CoachPoint — Home exercise workspace for physical therapists",
    template: "%s — CoachPoint",
  },
  description:
    "Build, review and follow home exercise programs in one therapist-led workspace, with optional agent assistance and browser-based patient sessions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <footer className="border-t border-border bg-white">
            <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs leading-5 text-slate-500 lg:px-8">
              <p>CoachPoint by Crosspoint.</p>
              <p>
                Educational demonstration only. Not medical diagnosis or a substitute for clinician instructions.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
