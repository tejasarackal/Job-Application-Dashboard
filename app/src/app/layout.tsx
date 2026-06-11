import type { Metadata } from "next";
import "./globals.css";

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
      {/* Global shell only — TopNav + the authenticated chrome live in the
          (app) route-group layout. Public pages (/login, /privacy, /terms)
          render directly inside the flex column. */}
      <body className="min-h-screen font-sans text-brand-body">
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}
