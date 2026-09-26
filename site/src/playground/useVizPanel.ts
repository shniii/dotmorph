import { useEffect, useMemo, useRef } from 'react';
import { useDialKitController } from 'dialkit';
import { configFromDefaults, diffParams, type Overrides } from './dialkit';

/**
 * One DialKit panel per shape (plus the engine), generated from its `*_DEFAULTS` object.
 * Only the leaves that actually changed are forwarded to `apply`, so dragging a
 * uniform slider never triggers a geometry rebuild.
 */
export function useVizPanel<T extends object>(
  name: string,
  id: string,
  defaults: T,
  overrides: Overrides<T>,
  exclude: readonly string[],
  apply: (patch: Partial<T>) => void,
) {
  const config = useMemo(() => configFromDefaults(defaults, overrides, exclude), [defaults, overrides, exclude]);
  const panel = useDialKitController(name, config, { id, defaultCollapsed: true });
  const prev = useRef<T>(defaults);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const values = panel.values as unknown as T;
  useEffect(() => {
    const patch = diffParams(prev.current, values);
    prev.current = values;
    if (Object.keys(patch).length) applyRef.current(patch);
  }, [values]);
  return panel;
}
