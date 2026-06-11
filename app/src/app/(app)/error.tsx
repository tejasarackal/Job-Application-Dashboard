"use client";

// Member-facing error boundary for the (app) route group. Without this, a
// transient throw on any signed-in page (e.g. a flaky Airtable read right after
// onboarding) bubbled to Next's raw error page. This gives a recoverable retry
// in the house style. Admin sub-routes keep their own narrower boundaries.

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-8 space-y-3">
      <h2 className="text-[15px] font-semibold text-brand-heading">Something went wrong</h2>
      <p className="text-[13px] text-brand-muted">
        {error.message || "An unexpected error occurred."} Your data is safe — nothing was changed.
      </p>
      <button
        onClick={reset}
        className="text-[13px] font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
      >
        Try again
      </button>
    </main>
  );
}
