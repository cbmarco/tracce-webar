import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { validatePhotoCalibration } from './lib/photoAlignment.js';
import Annotator from './Annotator.jsx';
import { cornerNames } from './session.js';
import { downloadSession, fileDataUrl, readSession } from './session.js';
import CameraView from './CameraView.jsx';
import { compactPhoto, readLocalLibrary, writeLocalLibrary } from './storage.js';

const ArucoView = lazy(() => import('./ArucoView.jsx'));
const XRView = lazy(() => import('./XRView.jsx'));
const steps = ['Foto', 'Riferimenti', 'AR'];

export default function App() {
  const [initial] = useState(readLocalLibrary);
  const current = initial.sessions.find((entry) => entry.id === initial.currentId);
  const [library, setLibrary] = useState(initial.sessions);
  const [activeId, setActiveId] = useState(current?.id || '');
  const [storageStatus, setStorageStatus] = useState(current ? 'saved' : '');
  const [storageError, setStorageError] = useState(initial.error);
  const imageCache = useRef({ source: '', stored: '' });
  const [step, setStep] = useState(current ? 1 : 0); const [photo, setPhoto] = useState(current?.photo || ''); const [imageName, setImageName] = useState(current?.imageName || '');
  const [printId, setPrintId] = useState(0);
  const [marker, setMarker] = useState(current?.marker || null);
  const [boxes, setBoxes] = useState(current?.boxes || []); const [pending, setPending] = useState(current?.pending || []);
  const [editing, setEditing] = useState(null); const [mode, setMode] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [xrSupported, setXrSupported] = useState(null);
  const [savedReference, setSavedReference] = useState(Boolean(current));
  const calibration = { version: 1, imageName, boxes, marker };
  const valid = validatePhotoCalibration(calibration) && !pending.length;
  const hasBoxes = boxes.length > 0;

  useEffect(() => {
    let active = true;
    if (!navigator.xr?.isSessionSupported) { setXrSupported(false); return; }
    navigator.xr.isSessionSupported('immersive-ar').then((value) => { if (active) setXrSupported(value); }).catch(() => { if (active) setXrSupported(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    function beforeUnload(event) { if ((boxes.length || marker) && !savedReference) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [boxes.length, marker, savedReference]);

  useEffect(() => {
    if (!photo || !activeId) return;
    let cancelled = false;
    setStorageStatus('saving');
    const timer = setTimeout(async () => {
      try {
        let storedPhoto = imageCache.current.source === photo ? imageCache.current.stored : null;
        if (!storedPhoto) storedPhoto = await compactPhoto(photo);
        if (cancelled) return;
        imageCache.current = { source: photo, stored: storedPhoto };
        const existing = readLocalLibrary();
        if (existing.error) throw new Error(existing.error);
        const entry = { id: activeId, imageName, photo: storedPhoto, boxes, pending, marker, updatedAt: new Date().toISOString() };
        const sessions = [entry, ...existing.sessions.filter((item) => item.id !== activeId)];
        writeLocalLibrary(sessions, activeId);
        setLibrary(sessions); setStorageStatus('saved'); setStorageError(''); setSavedReference(true);
      } catch (cause) { if (!cancelled) { setStorageStatus('error'); setStorageError(cause.message); } }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [photo, imageName, boxes, pending, marker, activeId]);

  function openSaved(entry) {
    setPhoto(entry.photo); setImageName(entry.imageName); setBoxes(entry.boxes); setPending(entry.pending); setMarker(entry.marker || null);
    setActiveId(entry.id); setEditing(null); setStep(1); setMessage(''); setSavedReference(true);
  }
  function deleteSaved(id) {
    try {
      const sessions = library.filter((entry) => entry.id !== id);
      writeLocalLibrary(sessions, activeId === id ? '' : activeId); setLibrary(sessions);
      if (activeId === id) { setPhoto(''); setImageName(''); setBoxes([]); setPending([]); setMarker(null); setActiveId(''); setStep(0); setStorageStatus(''); }
      setMessage('Parete eliminata da questo browser.');
    } catch (cause) { setStorageError(cause.message); }
  }

  async function loadPhoto(file, name) {
    setBusy(true); setMessage('');
    try {
      const url = await fileDataUrl(file);
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(url)) throw new Error('Formato non supportato.');
      const image = new Image(); image.src = url; await image.decode();
      if (imageName !== name || photo) { setBoxes([]); setMarker(null); setSavedReference(false); }
      setActiveId(crypto.randomUUID());
      setPhoto(url); setImageName(name); setPending([]); setEditing(null); setStep(1);
      try {
        const { markerFromPhoto } = await import('./aruco.js');
        const detected = await markerFromPhoto(url);
        setMarker(detected); setSavedReference(false);
        setMessage(`Marker ${detected.id} riconosciuto nella foto. Puoi aprire subito WebAR con marker, senza selezionare scatole.`);
      } catch (cause) { setMessage(cause.message); }
    } catch { setMessage('Non riesco ad aprire questa foto. Prova un file JPG, PNG o WebP.'); }
    finally { setBusy(false); }
  }
  async function importFile(file) {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const session = await readSession(file);
      if (session.imageDataUrl) { const image = new Image(); image.src = session.imageDataUrl; await image.decode(); }
      setActiveId(crypto.randomUUID());
      setPhoto(session.imageDataUrl || ''); setImageName(session.imageName); setBoxes(session.boxes); setMarker(session.marker || null);
      setPending([]); setEditing(null); setSavedReference(true); setStep(session.imageDataUrl ? 1 : 0);
      setMessage(session.imageDataUrl ? 'Sessione ripristinata: foto e riferimenti pronti.' : `Riferimenti importati. Ora carica la foto ${session.imageName}.`);
    } catch (cause) { setMessage(`Importazione non riuscita: ${cause.message}`); }
    finally { setBusy(false); }
  }
  function pointSelected(point) {
    setSavedReference(false); setMessage('');
    if (editing !== null) {
      const next = boxes.map((box, i) => i === Math.floor(editing / 4) ? { ...box, points: box.points.map((p, j) => j === editing % 4 ? point : p) } : box);
      if (!validatePhotoCalibration({ ...calibration, boxes: next })) { setMessage('Questo angolo renderebbe la scatola non valida. Riprova.'); return; }
      setBoxes(next); setEditing(null); return;
    }
    if (boxes.length >= 20) { setMessage('Puoi usare fino a 20 scatole.'); return; }
    const next = [...pending, point];
    if (next.length < 4) { setPending(next); return; }
    const box = { points: next };
    if (!validatePhotoCalibration({ ...calibration, boxes: [box] })) { setMessage('Gli angoli devono formare un rettangolo in prospettiva. Correggi l’ultimo punto o annulla.'); return; }
    setBoxes([...boxes, box]); setPending([]);
  }

  if (mode === 'aruco') return <div className="app live-app"><Suspense fallback={<p className="loading">Preparazione ArUco…</p>}><ArucoView photo={photo} boxes={boxes} marker={marker} onCalibrate={(value) => { setMarker(value); setSavedReference(false); }} onBack={() => setMode('')} /></Suspense></div>;
  if (mode === 'camera') return <div className="app live-app"><CameraView photo={photo} boxes={boxes} onBack={() => setMode('')} /></div>;
  if (mode === 'xr') return <div className="app live-app"><Suspense fallback={<p className="loading">Preparazione WebAR…</p>}><XRView photo={photo} box={boxes[0]} onBack={() => setMode('')} onCamera={() => setMode('camera')} /></Suspense></div>;

  return <div className="app">
    <header className="app-header"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); setStep(0); }}><span className="brand-icon">⌗</span><span>tracce<small>LA CASA, PRIMA DELL’INTONACO</small></span></a><div className="header-actions"><button className="quiet" onClick={() => setStep(0)}>Le tue pareti</button><label className="button quiet import-label">↥ Importa sessione<input type="file" accept="application/json,.json" aria-label="Importa sessione" onChange={(event) => { importFile(event.target.files[0]); event.target.value = ''; }} /></label></div></header>
    <nav className="steps" aria-label="Passaggi">{steps.map((label, i) => <button key={label} aria-current={step === i ? 'step' : undefined} disabled={(i === 1 && !photo) || (i === 2 && !valid)} onClick={() => { setStep(i); setMessage(''); }}><span>{i < step ? '✓' : `0${i + 1}`}</span>{label}</button>)}</nav>
    <main>
      {message && <div role="status" className="notice">{message}</div>}
      {storageError && <div role="alert" className="notice">{storageError}</div>}
      {photo && <p className="local-status" role="status">{storageStatus === 'saving' ? 'Salvataggio nel browser…' : storageStatus === 'saved' ? '✓ Salvato solo su questo dispositivo' : 'Salvataggio locale non disponibile: esporta la sessione.'}</p>}
      {step === 0 && <>
        <div className="intro"><div className="eyebrow">IL TUO ARCHIVIO DI CANTIERE, IN AR</div><h1>Riguarda dentro<br />le tue pareti.</h1><p>Una foto delle tracce con un marker visibile.<br />Ritrova i percorsi degli impianti sulla parete di oggi.</p></div>
        {library.length > 0 && <section aria-label="Pareti salvate" className="local-library"><div className="section-heading"><h2>Le tue pareti</h2><span className="muted">Solo su questo dispositivo</span></div><div className="saved-grid">{library.map((entry) => <article className="saved-card" key={entry.id}><button className="saved-open" onClick={() => openSaved(entry)}><img src={entry.photo} alt="" /><strong>{entry.imageName}</strong><span>{entry.boxes.length} scatole · Riprendi →</span></button><button className="quiet" aria-label={`Elimina ${entry.imageName}`} onClick={() => deleteSaved(entry.id)}>Elimina dal browser</button></article>)}</div></section>}
        <div className="welcome-grid"><label className={`upload-card ${busy ? 'busy' : ''}`}><span className="upload-icon">＋</span><strong>{busy ? 'Apertura foto…' : 'Aggiungi la foto di una parete'}</strong><span>JPG, PNG o WebP · elaborata nel browser</span><span className="button primary">Scegli una foto</span><input disabled={busy} aria-label="Foto originale" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files[0]; if (file) loadPhoto(file, file.name); event.target.value = ''; }} /></label>
          <div className="how-card panel"><span className="eyebrow">COME FUNZIONA</span><ol><li><strong>Prepara la foto</strong><span>Fissa un marker sulla parete e scatta con il marker visibile. Per le foto vecchie usa gli angoli delle scatole.</span></li><li><strong>Inquadra la parete</strong><span>Ritrova gli stessi riferimenti nel mondo reale.</span></li><li><strong>Rivela le tracce</strong><span>Regola la trasparenza e confronta i due momenti.</span></li></ol></div>
        </div>
        <section className="panel local-library">
          <h2>Prima della foto: stampa il marker</h2>
          <p>Fissalo piatto sul piano della parete e lascialo fermo durante foto e prova dal vivo. Usa un ID diverso per ogni parete; nella foto deve essere visibile un solo marker, intero e ben leggibile.</p>
          <label>ID da stampare <input aria-label="ID da stampare" type="number" min="0" max="249" value={printId} onChange={(event) => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 0 && n < 250) setPrintId(n); }} /></label>
          <button className="secondary" onClick={async () => { try { const { downloadMarkerPng } = await import('./aruco.js'); await downloadMarkerPng(printId); } catch (cause) { setMessage(cause.message); } }}>↓ Scarica marker PNG per termica</button>
          <p><a href="https://print.unseen-site.fun/" target="_blank" rel="noopener noreferrer">Apri Kitty Printer ↗</a> e carica il PNG come immagine. Conserva il bordo bianco. Il marker già stampato funziona anche con le foto nuove.</p>
        </section>
        <p className="privacy-note">Foto e riferimenti vengono salvati nel localStorage di questo browser. Puoi esportarli o eliminarli quando vuoi; non vengono caricati online.</p>
      </>}
      {step === 1 && <>
        <div className="section-heading"><div><div className="eyebrow">01 / PREPARAZIONE</div><h1>{marker ? 'Foto pronta per WebAR.' : 'Trova i tuoi punti fermi.'}</h1><p>{imageName} · {boxes.length} {boxes.length === 1 ? 'scatola pronta' : 'scatole pronte'}</p></div><button className="quiet" onClick={() => setStep(0)}>Cambia foto</button></div>
        {marker && <section className="panel local-library" aria-label="Marker nella foto">
          <h2>✓ Marker {marker.id} pronto</h2>
          <p>La foto è collegata al marker. Non servono angoli delle scatole: inquadra lo stesso marker nella stessa posizione sulla parete.</p>
          <button className="primary" disabled={!valid} onClick={() => setMode('aruco')}>Apri WebAR con marker →</button>
          <p>Se il marker viene spostato, rifai la foto. I riferimenti delle scatole qui sotto sono facoltativi e servono per le altre modalità.</p>
        </section>}
        <details open={!marker || marker.placement !== 'wall-fixed'}><summary>{marker ? 'Riferimenti delle scatole (facoltativi)' : 'Foto senza marker: indica gli angoli delle scatole'}</summary>
        <div className="prepare-grid"><div><div className="photo-toolbar"><div><span className="eyebrow">SCATOLA {editing === null ? boxes.length + 1 : Math.floor(editing / 4) + 1}</span><strong>{editing === null ? `Tocca ${cornerNames[pending.length]}` : `Correggi ${cornerNames[editing % 4]}`}</strong></div></div><Annotator src={photo} points={[...boxes.flatMap((box) => box.points), ...pending]} activeIndex={editing} onPoint={pointSelected} />
          <div className="image-caption"><span>⌖ Tieni premuto e trascina per usare la lente.</span><button className="quiet" disabled={!pending.length && editing === null} onClick={() => { if (editing !== null) setEditing(null); else setPending(pending.slice(0, -1)); }}>↶ {editing !== null ? 'Annulla modifica' : 'Annulla punto'}</button></div></div>
          <aside className="panel prepare-controls"><div className="eyebrow">{editing === null ? `SCATOLA ${boxes.length + 1}` : 'CORREGGI RIFERIMENTO'}</div><h2>{editing === null ? 'Bastano quattro angoli.' : `Scatola ${Math.floor(editing / 4) + 1}`}</h2><p>Seleziona lo stesso bordo nella foto e sulla parete. Usa riferimenti sullo stesso piano; due scatole distanti migliorano l’allineamento.</p>
            
            <div className="corner-guide" aria-label="Ordine degli angoli"><span>1 ↖</span><span>↗ 2</span><span>4 ↙</span><span>↘ 3</span></div>
            <div className="current-corner" role="status">{editing !== null ? `Tocca il nuovo angolo ${cornerNames[editing % 4]}` : `Tocca ${cornerNames[pending.length]}`}</div><progress aria-label="Angoli della scatola" max="4" value={pending.length} />
            {boxes.map((box, i) => <div className="box-summary" key={i}><div><strong>✓ Scatola {i + 1}</strong><div className="point-buttons">{box.points.map((_, j) => <button className="quiet" key={j} aria-label={`Modifica scatola ${i + 1}, ${cornerNames[j]}`} onClick={() => { setPending([]); setEditing(i * 4 + j); }}>{j + 1}</button>)}</div></div><button className="quiet" aria-label={`Rimuovi scatola ${i + 1}`} onClick={() => { setBoxes(boxes.filter((_, index) => index !== i)); setPending([]); setEditing(null); setSavedReference(false); }}>×</button></div>)}
            <button className="primary" disabled={!valid || editing !== null} onClick={() => { setMessage(''); setStep(2); }}>Continua · Inquadra la parete →</button>
            <button className="secondary" disabled={!valid} onClick={() => { downloadSession(calibration, photo); setSavedReference(true); setMessage('Sessione esportata con foto e riferimenti. Conservala per riaprire il lavoro.'); }}>↓ Esporta sessione</button>
          </aside>
        </div></details>
      </>}
      {step === 2 && <>
        <div className="intro compact"><div className="eyebrow">02 / SULLA PARETE</div><h1>Dal cantiere a oggi.</h1><p>Riferimenti pronti. Scegli come sovrapporre la foto.</p></div>
        <div className="mode-grid"><section className="panel mode-card"><span className="badge good">{marker ? `ArUco ${marker.id} collegato` : 'Aggancio automatico con marker'}</span><div className="mode-symbol">▦</div><h2>ArUco sulla placca</h2><p>Foto con marker: inquadra lo stesso marker, fermo nella posizione dello scatto. Per le foto vecchie usa il collegamento tramite scatola.</p><ul><li>Scarica il marker da stampare direttamente dall’app</li><li>Foto con marker: collegamento automatico al caricamento</li><li>Riconoscimento e riaggancio automatici nel browser</li></ul><button className="primary" onClick={() => setMode('aruco')}>Apri ArUco →</button></section><section className="panel mode-card"><span className={`badge ${xrSupported ? 'good' : ''}`}>{xrSupported === null ? 'Verifica dispositivo…' : xrSupported ? 'Disponibile sul dispositivo' : 'Non disponibile su questo browser'}</span><div className="mode-symbol">◎</div><h2>WebAR spaziale</h2><p>Ancora la foto alla parete e muoviti nella stanza. Il dispositivo segue posizione e orientamento.</p><ul><li>Mirino guidato sui quattro angoli della prima scatola</li><li>Allineamento dai punti rilevati sulla parete</li><li>Richiede una scatola annotata, WebXR e HTTPS</li></ul><button className="primary" disabled={!xrSupported || !hasBoxes} onClick={() => setMode('xr')}>Apri WebAR →</button></section>
          <section className="panel mode-card"><span className="badge">Fotocamera del browser</span><div className="mode-symbol">⌖</div><h2>Foto in sovrapposizione</h2><p>Allinea tutti i riferimenti su un fotogramma e seguili nel video. Utile anche quando WebXR non è supportato.</p><ul><li>Richiede almeno una scatola annotata nella foto</li><li>Omografia con tutte le scatole annotate</li><li>Tracking video sperimentale, richiede HTTPS o localhost</li></ul><button disabled={!hasBoxes} className={xrSupported ? 'secondary' : 'primary'} onClick={() => setMode('camera')}>Apri fotocamera →</button></section></div>
        <div className="session-footer"><button className="quiet" onClick={() => setStep(1)}>← Modifica riferimenti</button><button className="secondary" onClick={() => { downloadSession(calibration, photo); setSavedReference(true); }}>↓ Esporta sessione</button></div>
      </>}
    </main><footer className="app-footer"><span>TRACCE / WEBAR</span><span>Una parete alla volta.</span></footer>
  </div>;
}
