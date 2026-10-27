/** Phase 0 stand-in for pages whose feature hasn't been built yet. */
export function FeaturePlaceholder({
  title,
  feature,
  phase,
  children,
}: {
  title: string;
  feature: string;
  phase: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">
        {feature} · coming in Phase {phase}
      </p>
      {children}
    </section>
  );
}
