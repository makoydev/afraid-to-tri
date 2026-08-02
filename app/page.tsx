export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-caption uppercase tracking-[0.08em] text-ink-muted">Phase 0</p>
        <h1 className="text-title-lg">
          Afraid to <span className="text-primary">Tri</span>
        </h1>
        <p className="text-body-lg text-ink-2">
          Scaffolding is in place. The training domain, schema and UI primitives are built and
          tested; the app screens come next.
        </p>
      </div>
    </main>
  );
}
