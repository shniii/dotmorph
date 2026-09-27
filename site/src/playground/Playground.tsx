import { lazy, Suspense, useState } from 'react';
import {
  CLOUD_DEFAULTS,
  ENGINE_DEFAULTS,
  PALETTES,
  PALETTE_NAMES,
  SHAPE_NAMES,
  type DotMorphEngine,
  type PaletteName,
  type ShapeName,
} from 'dotmorph';
import { DotMorph } from 'dotmorph/react';
import { CodeBlock } from '../components/CodeBlock';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Field, Segmented, Slider, Toggle } from '../components/Controls';
import { PALETTE_LABELS, SHAPE_LABELS } from '../showcase/Showcase';

const TuningPanels = lazy(() => import('./TuningPanels'));

const SHAPE_OPTIONS = SHAPE_NAMES.map((value) => ({ value, label: SHAPE_LABELS[value] }));
const PALETTE_OPTIONS = PALETTE_NAMES.map((value) => ({ value, label: PALETTE_LABELS[value] }));

export function Playground() {
  const [shape, setShape] = useState<ShapeName>('globe');
  const [palette, setPalette] = useState<PaletteName>('ocean');
  const [motion, setMotion] = useState(true);
  const [interactive, setInteractive] = useState(true);
  const [duration, setDuration] = useState(ENGINE_DEFAULTS.transitionDuration);
  const [stagger, setStagger] = useState(ENGINE_DEFAULTS.stagger);
  const [swoop, setSwoop] = useState(ENGINE_DEFAULTS.swoop);
  const [cloud, setCloud] = useState(CLOUD_DEFAULTS.radius);
  const [tuning, setTuning] = useState(false);
  const [engine, setEngine] = useState<DotMorphEngine | null>(null);

  const props = [
    `shape="${shape}"`,
    `palette="${palette}"`,
    ...(motion ? [] : ['motion={false}']),
    ...(interactive ? [] : ['interactive={false}']),
    ...(duration === ENGINE_DEFAULTS.transitionDuration ? [] : [`transitionDuration={${duration}}`]),
  ];
  const extras = [
    ...(stagger === ENGINE_DEFAULTS.stagger ? [] : [`stagger: ${stagger}`]),
    ...(swoop === ENGINE_DEFAULTS.swoop ? [] : [`swoop: ${swoop}`]),
    ...(cloud === CLOUD_DEFAULTS.radius ? [] : [`cloud: { radius: ${cloud} }`]),
  ];
  if (extras.length) props.push(`options={{ ${extras.join(', ')} }}`);
  const code = `import { DotMorph } from 'dotmorph/react';\n\n<DotMorph\n${props.map((p) => `  ${p}`).join('\n')}\n/>`;

  return (
    <div className="playground">
      <div className="card card--controls">
        <Field label="Shape" wide>
          <Segmented options={SHAPE_OPTIONS} value={shape} onChange={setShape} ariaLabel="Shape" />
        </Field>
        <Field label="Palette" wide>
          <Segmented options={PALETTE_OPTIONS} value={palette} onChange={setPalette} ariaLabel="Palette" />
        </Field>
        <Field label="Morph length">
          <Slider
            value={duration}
            min={0.3}
            max={4}
            step={0.05}
            ariaLabel="Morph length"
            format={(v) => `${v.toFixed(2)} s`}
            onChange={(v) => setDuration(v)}
          />
        </Field>
        <Field label="Stagger">
          <Slider
            value={stagger}
            min={0}
            max={0.8}
            step={0.01}
            ariaLabel="Stagger"
            format={(v) => v.toFixed(2)}
            onChange={(v) => {
              setStagger(v);
              engine?.setSettings({ stagger: v });
            }}
          />
        </Field>
        <Field label="Swoop">
          <Slider
            value={swoop}
            min={0}
            max={1.5}
            step={0.01}
            ariaLabel="Swoop"
            format={(v) => v.toFixed(2)}
            onChange={(v) => {
              setSwoop(v);
              engine?.setSettings({ swoop: v });
            }}
          />
        </Field>
        <Field label="Cloud size">
          <Slider
            value={cloud}
            min={0.3}
            max={3}
            step={0.05}
            ariaLabel="Cloud size"
            format={(v) => v.toFixed(2)}
            onChange={(v) => {
              setCloud(v);
              engine?.setCloud({ radius: v });
            }}
          />
        </Field>
        <Field label="Motion">
          <Toggle checked={motion} onChange={setMotion} label={motion ? 'Animated' : 'Still'} />
        </Field>
        <Field label="Pointer">
          <Toggle checked={interactive} onChange={setInteractive} label={interactive ? 'Hover on' : 'Off'} />
        </Field>
        <Field label="Everything else">
          <Toggle checked={tuning} onChange={setTuning} label="DialKit panels" />
        </Field>
        <div className="field field--actions">
          <button type="button" className="button" onClick={() => setShape((s) => SHAPE_NAMES[(SHAPE_NAMES.indexOf(s) + 1) % SHAPE_NAMES.length])}>
            Morph to the next shape
          </button>
        </div>
      </div>

      <div className={`card card--preview${PALETTES[palette].dark ? ' card--preview-dark' : ''}`} style={{ background: PALETTES[palette].background }}>
        <div className="preview__canvas">
          <DotMorph shape={shape} palette={palette} motion={motion} interactive={interactive} transitionDuration={duration} onReady={setEngine} />
        </div>
      </div>

      <CodeBlock code={code} compact />

      {tuning && engine && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <TuningPanels engine={engine} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
