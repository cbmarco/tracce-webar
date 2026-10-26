import React, { useEffect, useRef, useState } from 'react';
import { startWallXR } from './webxr.js';
import { cornerNames } from './session.js';

export default function XRView({ photo, box, onBack, onCamera }) {
  const root = useRef(null); const canvas = useRef(null); const xr = useRef(null); const mounted = useRef(true);
  const [starting, setStarting] = useState(false); const [active, setActive] = useState(false);
  const [state, setState] = useState({ hit: false, pose: false, count: 0, aligned: false });
  const [error, setError] = useState(''); const [opacity, setOpacity] = useState(0.6);
  useEffect(() => () => { mounted.current = false; xr.current?.end().catch(() => {}); }, []);
  async function start() {
    setStarting(true); setError('');
    try {
      const control = await startWallXR({ root: root.current, canvas: canvas.current, photo, box,
        onUpdate: (value) => { if (mounted.current) setState(value); },
        onEnd: () => { xr.current = null; if (mounted.current) { setActive(false); setState({ hit: false, pose: false, count: 0, aligned: false }); } },
      });
      if (!mounted.current) { await control.end(); return; }
      xr.current = control; setActive(true);
    } catch (cause) { if (mounted.current) setError(`WebAR non avviato: ${cause.message}. Puoi usare la modalità fotocamera.`); }
    finally { if (mounted.current) setStarting(false); }
  }
  return <section className="xr-shell">
    <canvas className="xr-canvas" ref={canvas} aria-hidden="true" />
    <div ref={root} className={`xr-overlay ${active ? 'is-presenting' : ''}`}>
      {!active ? <div className="panel xr-intro">
        <div className="eyebrow">WEBAR · TRACKING SPAZIALE</div><h2>Appoggia la foto alla parete</h2>
        <p>Muovi lentamente il telefono per rilevare la parete. Poi porta il mirino sui quattro angoli della <strong>prima scatola</strong> e confermali in ordine.</p>
        <img className="reference-thumb" src={photo} alt="Foto da ancorare" />
        <p>Riferimento: {box.widthCm} × {box.heightCm} cm. Le dimensioni reali determinano la scala sulla parete.</p>
        {error && <div role="alert" className="notice">{error}</div>}
        <button className="primary" disabled={starting} onClick={start}>{starting ? 'Avvio WebAR…' : 'Entra in WebAR'}</button>
        <button className="secondary" disabled={starting} onClick={onCamera}>Usa fotocamera e omografia</button>
        <button className="quiet" disabled={starting} onClick={onBack}>← Scegli modalità</button>
      </div> : <>
        <div className="xr-top"><span className="badge good">● WebAR spaziale</span><button className="secondary" onClick={() => xr.current?.end()}>Esci da AR</button></div>
        <div className="xr-guidance"><span className="eyebrow">{state.aligned ? 'PARETE AGGANCIATA' : `ANGOLO ${state.count + 1} DI 4`}</span>
          <h2>{!state.pose ? 'Ritrova la parete' : state.aligned ? 'Le tracce sono sulla parete' : cornerNames[state.count]}</h2>
          <p>{!state.pose ? 'Tracking sospeso. Muovi lentamente il telefono in un’area ben illuminata.' : state.aligned ? 'Puoi spostarti: il dispositivo mantiene la posizione della foto.' : state.hit ? 'Porta il mirino verde sull’angolo e conferma.' : 'Scansiona la parete finché compare il mirino verde.'}</p>
        </div>
        <div className="xr-bottom panel">
          {error && <p role="alert" className="notice">{error}</p>}
          {!state.aligned ? <><progress aria-label="Angoli WebAR" max="4" value={state.count} /><button className="primary" disabled={!state.hit || !state.pose} onClick={() => { try { setError(''); xr.current.capture(); } catch (cause) { setError(cause.message); } }}>Conferma angolo</button>{state.count > 0 && <button className="quiet" onClick={() => xr.current.undo()}>↶ Annulla angolo</button>}</> : <>
            <label className="range-label">Visibilità foto <output>{Math.round(opacity * 100)}%</output><input type="range" aria-label="Visibilità foto" min="0" max="1" step="0.01" value={opacity} onChange={(event) => { const value = Number(event.target.value); setOpacity(value); xr.current.setOpacity(value); }} /></label>
            <button className="secondary" onClick={() => { setError(''); xr.current.reset(); }}>Riaggancia parete</button>
          </>}
        </div>
      </>}
    </div>
  </section>;
}
