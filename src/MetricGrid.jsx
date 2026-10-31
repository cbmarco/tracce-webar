import React, { useId, useMemo, useState } from 'react';
import { markerReferences, projectPhotoPoint } from './lib/photoAlignment.js';
import { buildMetricGrid } from './metricGrid.js';

export function GridControls({ marker, onChange }) {
  const refs = markerReferences(marker);
  const [draft, setDraft] = useState(marker.grid ?? { enabled: true, method: 'side', originId: refs[0].id, otherId: refs[1]?.id, valueCm: '', stepCm: 10 });
  const [error, setError] = useState('');
  const savedError = useMemo(() => {
    if (!marker.grid) return '';
    try { buildMetricGrid(marker); return ''; } catch (cause) { return cause.message; }
  }, [marker]);
  function apply() {
    try {
      const grid = { ...draft, enabled: true, valueCm: Number(draft.valueCm), stepCm: Number(draft.stepCm) };
      buildMetricGrid({ ...marker, grid });
      onChange({ ...marker, grid }); setError('');
    } catch (cause) { setError(cause.message); }
  }
  return <section className="metric-controls" aria-label="Impostazioni griglia quotata">
    <h3>Griglia quotata · cm</h3>
    <p>Inserisci una misura reale per dare una scala alla parete.</p>
    <label>Misura di riferimento<select aria-label="Misura di riferimento" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
      <option value="side">Lato del quadrato nero</option>
      <option value="distance" disabled={refs.length < 2}>Distanza tra i centri di due marker</option>
    </select></label>
    <label>Marker di origine<select aria-label="Marker di origine" value={draft.originId} onChange={(event) => setDraft({ ...draft, originId: Number(event.target.value) })}>{refs.map((ref) => <option key={ref.id} value={ref.id}>ID {ref.id}</option>)}</select></label>
    {draft.method === 'distance' && <label>Secondo marker<select aria-label="Secondo marker" value={draft.otherId ?? ''} onChange={(event) => setDraft({ ...draft, otherId: Number(event.target.value) })}><option value="" disabled>Scegli un ID diverso</option>{refs.map((ref) => <option key={ref.id} value={ref.id}>ID {ref.id}</option>)}</select></label>}
    <label>{draft.method === 'side' ? 'Lato nero misurato (cm)' : 'Distanza centro-centro misurata (cm)'}<input aria-label="Misura reale in cm" type="number" inputMode="decimal" min="0.01" max="100000" step="any" value={draft.valueCm} onChange={(event) => setDraft({ ...draft, valueCm: event.target.value })} /></label>
    <label>Passo griglia (cm)<input aria-label="Passo griglia in cm" type="number" inputMode="decimal" min="1" max="1000" step="any" value={draft.stepCm} onChange={(event) => setDraft({ ...draft, stepCm: event.target.value })} /></label>
    <button className="quiet" onClick={() => setDraft({ ...draft, method: 'side', valueCm: 16 })}>Usa lato dima A4: 16 cm</button>
    <p>Per la dima A4 verifica prima la barra da 10 cm sulla stampa. Per altri marker misura il quadrato nero, escludendo il bianco; per la distanza usa i centri.</p>
    {(error || savedError) && <p role="alert" className="notice">{error || savedError}</p>}
    <button className="secondary" onClick={apply}>Applica griglia quotata</button>
    {marker.grid && <label className="grid-toggle"><input aria-label="Mostra griglia quotata" type="checkbox" checked={marker.grid.enabled} onChange={(event) => onChange({ ...marker, grid: { ...marker.grid, enabled: event.target.checked } })} />Mostra griglia quotata salvata</label>}
    <p>Zero al centro dell’ID {marker.grid?.originId ?? draft.originId}. X verso destra e Y verso il basso secondo l’orientamento stampato del marker. Metti la dima in bolla per assi orizzontali e verticali.</p>
    <small>Quote stimate sul piano dei marker: verifica con un metro. La griglia segue l’aggancio e si nasconde quando i riferimenti non bastano.</small>
  </section>;
}

export function MetricGridOverlay({ marker, homography, size }) {
  const clipId = useId().replace(/:/g, '');
  const model = useMemo(() => {
    if (!marker.grid?.enabled) return null;
    try { return buildMetricGrid(marker); } catch { return null; }
  }, [marker]);
  if (!model || !homography) return null;
  try {
    const screen = (point) => { const [x, y] = projectPhotoPoint(homography, point); return [x * size.width, y * size.height]; };
    const clip = [[0, 0], [1, 0], [1, 1], [0, 1]].map((point) => screen(point).join(',')).join(' ');
    const origin = screen(model.origin);
    // Keep all grid lines, but thin out dimension labels when the wall is far
    // away so neighboring numbers remain readable on a phone.
    const strides = Object.fromEntries(['x', 'y'].map((axis) => {
      const next = model.lines.find((line) => line.axis === axis && line.value === marker.grid.stepCm);
      if (!next) return [axis, 1];
      const point = screen(next.label);
      const spacing = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
      const required = (axis === 'x' ? 50 : 26) / Math.max(spacing, 0.01);
      return [axis, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((n) => n >= required) ?? Math.ceil(required)];
    }));
    return <svg className="metric-overlay" role="img" aria-label={`Griglia quotata, passo ${marker.grid.stepCm} cm, origine ID ${marker.grid.originId}`} viewBox={`0 0 ${size.width} ${size.height}`}>
      <defs><clipPath id={clipId}><polygon points={clip} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {model.lines.map((line) => {
          const from = screen(line.from); const to = screen(line.to); const label = screen(line.label);
          return <g key={`${line.axis}-${line.value}`}>
            <line data-axis={line.axis} data-cm={line.value} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={line.value === 0 ? 'grid-axis' : ''} />
            {line.value !== 0 && Math.abs(line.value / marker.grid.stepCm / strides[line.axis] - Math.round(line.value / marker.grid.stepCm / strides[line.axis])) < 1e-6 && <text x={label[0] + 4} y={label[1] - 4}>{line.axis.toUpperCase()} {Number(line.value.toFixed(2))} cm</text>}
          </g>;
        })}
        <circle cx={origin[0]} cy={origin[1]} r="4" />
        <text x={origin[0] + 6} y={origin[1] - 6}>0,0 · ID {marker.grid.originId}</text>
      </g>
    </svg>;
  } catch { return null; }
}
