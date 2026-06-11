import { Header } from "@/components/layout/Header";

export default function Loading() {
  return (
    <>
      <Header title="Admin" subtitle="Users and support tools" />
      <main className="p-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-brand-border bg-white animate-pulse" />
        ))}
      </main>
    </>
  );
}
