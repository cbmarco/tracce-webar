import React, { useEffect, useMemo, useRef, useState } from 'react';
import Annotator from './Annotator.jsx';
import { cornerNames } from './session.js';
import { markerReferences, markerSourceFromFrame, photoCssMatrix, photoHomography } from './lib/photoAlignment.js';
import { createMarkerDetector, downloadMarker, downloadMarkerPng, findMarker, findTrackedMarkers, markerSvg } from './aruco.js';

export default function ArucoView({ photo, boxes, marker, onCalibrate, onBack }) {
  const video = useRef(null); const stage = useRef(null); const detector = useRef(null);
  const [status, setStatus] = useState('opening'); const [error, setError] = useState('');
  const [id, setId] = useState(marker?.id ?? 0); const [detection, setDetection] = useState({ state: 'missing', marker: null });
  const [frame, setFrame] = useState(null); const [points, setPoints] = useState([]);
  const [ratio, setRatio] = useState(4 / 3); const [size, setSize] = useState({ width: 1, height: 1 });
  const [photoSize, setPhotoSize] = useState(null); const [opacity, setOpacity] = useState(0.6); const [attempt, setAttempt] = useState(0);
  const calibration = marker?.id === id ? marker : null;
  const references = markerReferences(calibration);
  const multi = references.length > 1;
  const preview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markerSvg(id))}`, [id]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image(); image.onload = () => { if (!cancelled) setPhotoSize([image.naturalWidth, image.naturalHeight]); }; image.src = photo;
    return () => { cancelled = true; };
  }, [photo]);
  useEffect(() => {
    let cancelled = false; let stream;
    async function open() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Apri l’app via HTTPS o localhost per usare la fotocamera.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        video.current.srcObject = stream; await video.current.play();
        if (cancelled) return;
        setRatio(video.current.videoWidth / video.current.videoHeight); setStatus('live');
        stream.getVideoTracks()[0].addEventListener('ended', () => { if (!cancelled) { setStatus('error'); setDetection({ state: 'missing', marker: null }); setFrame(null); setError('La fotocamera si è interrotta. Riaprila per continuare.'); } });
      } catch (cause) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) { setStatus('error'); setError(cause.name === 'NotAllowedError' ? 'Accesso alla fotocamera negato. Consenti l’accesso nel browser e riprova.' : cause.message); }
      }
    }
    open();
    return () => { cancelled = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [attempt]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (status !== 'live' || frame) return;
    detector.current ??= createMarkerDetector();
    const canvas = document.createElement('canvas'); canvas.width = Math.min(1920, video.current.videoWidth || 960); canvas.height = Math.round(canvas.width / ratio);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let timer; let cancelled = false;
    function tick() {
      if (cancelled) return;
      if (document.hidden) { setDetection({ state: 'missing', marker: null }); timer = setTimeout(tick, 200); return; }
      try {
        context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        setDetection(multi ? findTrackedMarkers(pixels, calibration, detector.current) : findMarker(pixels, id, detector.current));
      } catch (cause) { setDetection({ state: 'missing', marker: null }); setError(cause.message); }
      timer = setTimeout(tick, 100);
    }
    const hidden = () => { if (document.hidden) setDetection({ state: 'missing', marker: null }); };
    document.addEventListener('visibilitychange', hidden); tick();
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [status, frame, id, ratio, multi, calibration]);

  const projection = useMemo(() => {
    if (!calibration || !detection.marker || frame || !photoSize) return {};
    try { return { css: photoCssMatrix(detection.homography ?? photoHomography(calibration.sourceCorners, detection.marker.corners), ...photoSize, size.width, size.height) }; }
    catch { return { error: 'Allineamento non valido. Inquadra il marker più frontalmente o ripeti il collegamento.' }; }
  }, [calibration, detection, frame, photoSize, size]);

  function freeze() {
    try {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = Math.round(960 / ratio);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
      const found = findMarker(context.getImageData(0, 0, canvas.width, canvas.height), id, detector.current);
      if (!found.marker) throw new Error('Il marker deve essere completamente visibile quando fermi l’immagine.');
      setFrame({ src: canvas.toDataURL('image/png'), markerCorners: found.marker.corners }); setPoints([]); setError('');
    } catch (cause) { setError(cause.message); }
  }
  function save() {
    try {
      const next = markerSourceFromFrame(id, boxes[0].points, points, frame.markerCorners);
      onCalibrate(next); setFrame(null); setPoints([]); setError('');
    } catch (cause) { setError(cause.message); }
  }
  const detected = Boolean(detection.marker);
  const reason = multi ? detection.state === 'inconsistent' ? 'I marker non concordano: verifica che siano fermi sullo stesso piano della parete.' : detection.state === 'ambiguous' ? 'ID duplicato in vista: ogni marker deve avere un ID diverso.' : `Marker utilizzabili: ${detection.count ?? 0}/${references.length}. Inquadra almeno due marker interi e leggibili tra gli ID ${references.map((m) => m.id).join(', ')}.` : detection.state === 'too-small' ? 'Avvicinati al marker per leggere bene i suoi angoli.' : detection.state === 'wrong-id' ? `È visibile un altro marker: serve l’ID ${id}.` : detection.state === 'ambiguous' ? `Sono visibili più marker con ID ${id}: inquadrane uno solo.` : detection.state === 'clipped' ? 'Inquadra il marker intero, lasciando spazio attorno.' : `Inquadra il marker ${id} nella stessa posizione dello scatto.`;

  return <section className="camera-mode">
    <div className="mode-heading"><button className="quiet" onClick={onBack}>← Modalità</button><span role="status" className={`badge ${detected && !frame ? 'good' : ''}`}>{frame ? 'Collega alla foto' : multi ? detected ? `● ${detection.count}/${references.length} marker agganciati` : `${detection.count ?? 0}/${references.length} marker · servono almeno 2` : detected ? `● ArUco ${id} rilevato` : `Ricerca ArUco ${id}…`}</span></div>
    <div className="camera-layout"><div className="camera-well"><div ref={stage} className="camera-stage" style={{ aspectRatio: ratio, width: `min(100%, ${62 * ratio}dvh)` }}>
      <video ref={video} muted playsInline style={{ visibility: frame ? 'hidden' : 'visible' }} />
      {frame && <div className="frozen"><Annotator src={frame.src} points={points} label="Fotogramma di calibrazione ArUco" onPoint={points.length === 4 ? null : (point) => setPoints([...points, point])} /></div>}
      {projection.css && <img className="projection" src={photo} alt="Tracce agganciate ad ArUco" style={{ width: photoSize[0], height: photoSize[1], transform: projection.css, opacity }} />}
      {detected && !frame && <svg className="marker-outline" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{(detection.matches ?? [detection.marker]).map((item) => <polygon key={item.id} points={item.corners.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} />)}</svg>}
    </div>{status === 'opening' && <p role="status">Apertura fotocamera…</p>}</div>
      <aside className="camera-controls panel aruco-controls">
        <div className="eyebrow">ARUCO · AGGANCIO AUTOMATICO</div><h2>{frame ? points.length === 4 ? 'Salva il collegamento' : `Prima scatola · ${cornerNames[points.length]}` : calibration ? 'Inquadra e ritrova le tracce' : 'Collega il marker alla foto'}</h2>
        <p>{frame ? 'Seleziona i quattro angoli della prima scatola nello stesso ordine della foto originale. Usa gli stessi angoli: il bordo di una placca più grande non equivale al bordo della scatola.' : calibration ? detected ? multi ? 'La foto si allinea usando insieme i marker visibili. Servono almeno due marker concordi; con un solo marker la sovrapposizione si nasconde.' : 'La foto segue il marker. Se esce dal campo, la sovrapposizione si nasconde e riprende quando torna visibile.' : reason : 'Per le foto già scattate, il primo collegamento si fa una sola volta: ferma il video con marker e prima scatola visibili.'}</p>
        <div className="marker-kit"><div className="plate-diagram" aria-label="Marker in basso a sinistra della placca"><div className="plate-outline"><span>PLACCA</span><img src={preview} alt={`ArUco ${id} da stampare`} /></div></div><label>ID marker<input aria-label="ID marker ArUco" type="number" min="0" max="249" value={id} disabled={Boolean(frame) || !boxes.length || multi} onChange={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 0 && next < 250) { setId(next); setDetection({ state: 'missing', marker: null }); setError(''); } }} /></label><button className="secondary" onClick={() => downloadMarker(id)}>↓ Scarica marker SVG</button></div>
        <div className="panel">
          <h3>Stampa termica · Kitty Printer</h3>
          <button className="secondary" onClick={async () => { try { await downloadMarkerPng(id); setError(''); } catch (cause) { setError(cause.message); } }}>↓ Scarica marker PNG per termica</button>
          <p>1. Scarica il PNG dell’ID {id}. 2. Apri Kitty Printer, collega la stampante e carica il PNG come immagine. 3. Stampa il quadrato intero, senza ritagliare il bordo bianco.</p>
          <a className="secondary" href="https://print.unseen-site.fun/" target="_blank" rel="noopener noreferrer">Apri Kitty Printer ↗</a>
          <p>PNG 384 × 384 pixel con margine ridotto. Per le foto nuove: fissa il marker, scatta e carica la foto. Il collegamento viene riconosciuto automaticamente. Per le foto vecchie: usa «Ferma e collega marker» con la prima scatola visibile.</p>
        </div>
        <p className="marker-placement">Il marker deve restare nella stessa posizione e con lo stesso orientamento della foto, piatto sul piano della parete. Conserva il bordo bianco. Se lo sposti, rifai la foto o il collegamento.</p>
        {frame && <><img className="reference-thumb" src={photo} alt="Prima scatola nella foto originale" /><progress aria-label="Angoli di calibrazione ArUco" max="4" value={points.length} /></>}
        {(error || projection.error) && <div role="alert" className="notice">{error || projection.error}</div>}
        {status === 'error' ? <button className="primary" onClick={() => { setError(''); setStatus('opening'); setAttempt(attempt + 1); }}>Riprova fotocamera</button> : frame ? <>
          <button className="primary" disabled={points.length !== 4} onClick={save}>Salva collegamento ArUco</button>
          <button className="quiet" disabled={!points.length} onClick={() => setPoints(points.slice(0, -1))}>↶ Annulla angolo</button>
          <button className="quiet" onClick={() => { setFrame(null); setPoints([]); }}>Annulla calibrazione</button>
        </> : boxes.length > 0 && !multi ? <button className={calibration ? 'secondary' : 'primary'} disabled={status !== 'live' || !detected} onClick={freeze}>{calibration ? 'Ricalibra marker' : 'Ferma e collega marker'}</button> : <p>Collegamento dalla foto pronto: inquadra i riferimenti salvati, senza calibrazione manuale.</p>}
        {calibration && !frame && <label className="range-label">Visibilità foto <output>{Math.round(opacity * 100)}%</output><input aria-label="Visibilità foto" type="range" min="0" max="1" step="0.01" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
        <small>Dizionario ARUCO_MIP_36h12, ID 0–249. Il collegamento resta nel localStorage e nell’esportazione della sessione. Verifica l’allineamento lontano dal marker.</small>
      </aside>
    </div>
  </section>;
}
