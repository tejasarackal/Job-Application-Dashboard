import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  // Per-page titles set their own prefix; this is the fallback + suffix.
  title: {
    default: "Job Dashboard",
    template: "%s · Job Dashboard",
  },
  description: "End-to-end pipeline for the job search — listings, outreach, applications, interviews.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-brand-body">
        <div className="min-h-screen flex flex-col">
          <TopNav />
          <div className="flex-1 flex flex-col min-w-0">{children}</div>
        </div>
      </body>
    </html>
  );
}
