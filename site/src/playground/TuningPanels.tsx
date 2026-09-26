import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
// DialKit's own Google Fonts import is stripped at build time (see vite.config.ts); self-host its font instead.
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import { BURST_DEFAULTS, ENGINE_DEFAULTS, FAN_DEFAULTS, GLOBE_DEFAULTS, WAVE_DEFAULTS, type DotMorphEngine } from 'dotmorph';
import { useVizPanel } from './useVizPanel';

const NONE: readonly string[] = [];

/**
 * Every tunable of the engine and the four shapes as DialKit panels, generated
 * from the library's defaults and bound to one engine.
 */
export default function TuningPanels({ engine }: { engine: DotMorphEngine }) {
  useVizPanel('Engine', 'engine', ENGINE_DEFAULTS, {}, ['interactive'], (p) => engine.setSettings(p));
  useVizPanel('Burst', 'burst', BURST_DEFAULTS, {}, NONE, (p) => engine.shapes.burst.setParams(p));
  useVizPanel('Globe', 'globe', GLOBE_DEFAULTS, {}, NONE, (p) => engine.shapes.globe.setParams(p));
  useVizPanel('Wave', 'wave', WAVE_DEFAULTS, {}, NONE, (p) => engine.shapes.wave.setParams(p));
  useVizPanel('Fan', 'fan', FAN_DEFAULTS, {}, NONE, (p) => engine.shapes.fan.setParams(p));
  return <DialRoot position="bottom-right" theme="dark" defaultOpen productionEnabled />;
}
