/**
 * Proof ticker directly under the hero: one scrolling line of live demo
 * numbers (fictional sample data, computed in page.tsx from the demo
 * seed). Pure CSS animation — the track holds two copies of the items
 * and loops translateX(-50%). Under reduced motion the animation is
 * switched off in globals.css and the first copy sits still.
 */
export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden border-b border-line bg-surface py-3" aria-label="Pulse Find at a glance">
      <div className="landing-marquee-track flex w-max items-center gap-8">
        {[0, 1].map((copy) => (
          <span key={copy} aria-hidden={copy === 1} className="flex items-center gap-8">
            {items.map((item) => (
              <span
                key={`${copy}-${item}`}
                className="flex items-center gap-2 whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] text-muted"
              >
                <i className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                {item}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
