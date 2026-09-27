const PHASES = [
  { label: 'Lines of the old shape draw back', from: 0, to: 27, kind: 'out' },
  { label: 'Old dots fly into the cloud', from: 0, to: 60, kind: 'cloud' },
  { label: 'New dots fly out of the cloud', from: 40, to: 100, kind: 'cloud' },
  { label: 'Lines of the new shape draw in', from: 73, to: 100, kind: 'in' },
] as const;

export function HowItWorks() {
  return (
    <div className="how">
      <div className="how__grid">
        <div className="card card--text">
          <h3>Two places per dot</h3>
          <p>
            Each dot has a target in its shape, computed on the GPU every frame, and a slot in a small cloud in the middle of
            the scene. A shape&apos;s <code>presence</code> slides from 0 (everything in the cloud) to 1 (fully formed).
          </p>
        </div>
        <div className="card card--text">
          <h3>A curved flight</h3>
          <p>
            Dots don&apos;t travel in straight lines. Each follows a Bézier curve bent sideways by its own random seed, and
            leaves a little earlier or later than its neighbours, so the swarm moves like one soft body.
          </p>
        </div>
        <div className="card card--text">
          <h3>Everything on the GPU</h3>
          <p>
            Sway, twinkle, rotation, growing arcs and the hover swirl on the globe and the fan all run in shaders. The engine
            only nudges a few numbers per frame (plus a few hundred tiny springs while you part the burst or the wave), which
            keeps it smooth with thousands of dots and lines.
          </p>
        </div>
      </div>

      <div className="card card--timeline">
        <div className="timeline__head">
          <span>One morph, start to finish</span>
          <span className="timeline__axis">
            <em>0</em>
            <em>25 %</em>
            <em>50 %</em>
            <em>75 %</em>
            <em>100 %</em>
          </span>
        </div>
        {PHASES.map((p) => (
          <div className="timeline__row" key={p.label}>
            <span className="timeline__label">{p.label}</span>
            <span className="timeline__track">
              <span className={`timeline__bar timeline__bar--${p.kind}`} style={{ left: `${p.from}%`, width: `${p.to - p.from}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
