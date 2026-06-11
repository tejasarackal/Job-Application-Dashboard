"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-8 space-y-3">
      <h2 className="text-[15px] font-semibold text-brand-heading">Couldn’t load review queue</h2>
      <p className="text-[13px] text-brand-muted">{error.message || "An unexpected error occurred."}</p>
      <button
        onClick={reset}
        className="text-[13px] font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
      >
        Retry
      </button>
    </main>
  );
}
