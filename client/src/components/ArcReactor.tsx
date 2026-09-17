export type RyanState = 'idle' | 'listening' | 'speaking' | 'working';

export function ArcReactor({ state }: { state: RyanState }) {
  return (
    <div className={`reactor reactor-${state}`} aria-hidden="true">
      <div className="reactor-ring ring-outer" />
      <div className="reactor-ring ring-mid" />
      <div className="reactor-ring ring-inner" />
      <div className="reactor-core" />
      <div className="reactor-glow" />
    </div>
  );
}
