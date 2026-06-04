import { Header } from "@/components/layout/Header";

export default function Loading() {
  return (
    <>
      <Header title="Workflows" subtitle="Trigger and monitor pipeline automations" />
      <main className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border border-brand-border bg-white animate-pulse" />
          ))}
        </div>
      </main>
    </>
  );
}
