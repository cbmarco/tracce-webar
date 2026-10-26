import React, { useEffect, useMemo, useRef, useState } from 'react';
import { photoCssMatrix, photoHomography } from './lib/photoAlignment.js';
import Annotator from './Annotator.jsx';
import { cornerNames } from './session.js';
import { trackPhotoPoints } from './photoTracker.js';

export default function CameraView({ photo, boxes, onBack }) {
  const video = useRef(null); const stream = useRef(null); const stage = useRef(null);
  const [status, setStatus] = useState('opening');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState('');
  const [points, setPoints] = useState([]);
  const [tracking, setTracking] = useState(false);
  const [opacity, setOpacity] = useState(0.6);
  const [ratio, setRatio] = useState(4 / 3);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [photoSize, setPhotoSize] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const sourcePoints = useMemo(() => boxes.flatMap((box) => box.points), [boxes]);
  const ready = points.length === sourcePoints.length;

  useEffect(() => {
    let cancelled = false;
    const image = new Image(); image.onload = () => { if (!cancelled) setPhotoSize([image.naturalWidth, image.naturalHeight]); }; image.src = photo;
    return () => { cancelled = true; };
  }, [photo]);
  useEffect(() => {
    let cancelled = false; let ownedStream;
    async function open() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Apri l’app via HTTPS o su localhost per usare la fotocamera.');
        ownedStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (cancelled) { ownedStream.getTracks().forEach((track) => track.stop()); return; }
        stream.current = ownedStream; video.current.srcObject = ownedStream;
        await video.current.play();
        if (cancelled) return;
        setRatio(video.current.videoWidth / video.current.videoHeight); setStatus('live');
        ownedStream.getVideoTracks()[0].addEventListener('ended', () => { if (!cancelled) { setTracking(false); setFrame(''); setPoints([]); setStatus('error'); setError('La fotocamera si è interrotta. Puoi riaprirla.'); } });
      } catch (cause) {
        ownedStream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) { setStatus('error'); setError(cause.name === 'NotAllowedError' ? 'Accesso alla fotocamera negato. Consenti l’accesso nelle impostazioni del browser e riprova.' : cause.message); }
      }
    }
    open();
    return () => { cancelled = true; ownedStream?.getTracks().forEach((track) => track.stop()); };
  }, [attempt]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function hidden() { if (document.hidden) { setTracking(false); setFrame(''); setPoints([]); setError('Aggancia di nuovo la parete dopo il cambio di app.'); } }
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);

  const projection = useMemo(() => {
    if (!ready || !photoSize) return {};
    try { return { css: photoCssMatrix(photoHomography(sourcePoints, points), ...photoSize, size.width, size.height) }; }
    catch (cause) { return { error: cause.message }; }
  }, [ready, photoSize, points, sourcePoints, size]);

  useEffect(() => {
    if (!tracking) return;
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = Math.round(480 / ratio);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let previous; let currentPoints = points; let timer; let cancelled = false;
    function gray(source) {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return Uint8Array.from({ length: canvas.width * canvas.height }, (_, i) => (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3);
    }
    function tick() {
      if (cancelled) return;
      try {
        const next = gray(video.current);
        currentPoints = trackPhotoPoints(previous, next, currentPoints, canvas.width, canvas.height);
        photoHomography(sourcePoints, currentPoints);
        setPoints(currentPoints); previous = next; timer = setTimeout(tick, 85);
      } catch (cause) { setTracking(false); setPoints([]); setFrame(''); setError(cause.message); }
    }
    const seed = new Image(); seed.onload = () => { if (!cancelled) { previous = gray(seed); tick(); } }; seed.src = frame;
    return () => { cancelled = true; clearTimeout(timer); };
    // The tracker owns evolving points; restart only on explicit user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking]);

  function freeze() {
    const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    if (!canvas.width) return;
    canvas.getContext('2d').drawImage(video.current, 0, 0);
    setTracking(false); setPoints([]); setFrame(canvas.toDataURL('image/png')); setError('');
  }
  return <section className="camera-mode">
    <div className="mode-heading"><button className="quiet" onClick={onBack}>← Modalità</button><span className={`badge ${tracking ? 'good' : ''}`}>{tracking ? '● Tracking video' : 'Fotocamera'}</span></div>
    <div className="camera-layout">
      <div className="camera-well">
        <div ref={stage} className="camera-stage" style={{ aspectRatio: ratio, width: `min(100%, ${62 * ratio}dvh)` }}>
          <video ref={video} muted playsInline style={{ visibility: frame && !tracking ? 'hidden' : 'visible' }} />
          {frame && !tracking && <div className="frozen"><Annotator src={frame} points={points} label="Fotogramma da allineare" onPoint={ready ? null : (point) => setPoints([...points, point])} /></div>}
          {projection.css && <img className="projection" src={photo} alt="Tracce sovrapposte" style={{ width: photoSize[0], height: photoSize[1], transform: projection.css, opacity }} />}
          {!frame && !tracking && status === 'live' && <div className="viewfinder" aria-hidden="true" />}
        </div>
        {status === 'opening' && <p role="status">Apertura fotocamera…</p>}
      </div>
      <aside className="camera-controls panel">
        <div className="eyebrow">{tracking ? 'PARETE AGGANCIATA' : frame ? 'ALLINEA GLI ANGOLI' : 'INQUADRA LA PARETE'}</div>
        <h2>{tracking ? 'Le tracce, davanti a te.' : ready ? 'Controlla la sovrapposizione' : frame ? `Scatola ${Math.floor(points.length / 4) + 1} · ${cornerNames[points.length % 4]}` : 'Ritrova le stesse scatole'}</h2>
        <p>{tracking ? 'Muoviti lentamente. Se la foto scivola, ripeti l’aggancio.' : frame ? 'Tocca gli stessi angoli della foto. Tieni fermo il telefono fino all’avvio del tracking.' : 'Inquadra i riferimenti e ferma un fotogramma per posizionare gli angoli con precisione.'}</p>
        <img className="reference-thumb" src={photo} alt="Promemoria foto originale" />
        {frame && !tracking && <><progress max={sourcePoints.length} value={points.length} aria-label="Angoli sul video" /><span className="muted">{points.length} di {sourcePoints.length} angoli</span></>}
        {(error || projection.error) && <div role="alert" className="notice">{error || projection.error}</div>}
        {status === 'error' ? <button className="primary" onClick={() => { setError(''); setStatus('opening'); setAttempt(attempt + 1); }}>Riprova fotocamera</button> : <>
          {ready && !tracking && projection.css && <button className="primary" onClick={() => { setError(''); setTracking(true); }}>Avvia sovrapposizione live</button>}
          {status === 'live' && <button className={frame ? 'secondary' : 'primary'} onClick={freeze}>{tracking || frame ? 'Riaggancia parete' : 'Ferma e allinea'}</button>}
          {frame && !tracking && points.length > 0 && <button className="quiet" onClick={() => setPoints(points.slice(0, -1))}>↶ Annulla ultimo angolo</button>}
        </>}
        {ready && <label className="range-label">Visibilità foto <output>{Math.round(opacity * 100)}%</output><input aria-label="Visibilità foto" type="range" min="0" max="1" step="0.01" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
        <small>Tracking video sperimentale. Verifica l’allineamento prima di usare la foto come riferimento.</small>
      </aside>
    </div>
  </section>;
}
