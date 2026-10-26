import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { validatePhotoCalibration } from './lib/photoAlignment.js';
import Annotator from './Annotator.jsx';
import { cornerNames } from './session.js';
import { downloadSession, fileDataUrl, readSession } from './session.js';
import CameraView from './CameraView.jsx';
import { compactPhoto, readLocalLibrary, writeLocalLibrary } from './storage.js';

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
  const [boxes, setBoxes] = useState(current?.boxes || []); const [pending, setPending] = useState(current?.pending || []);
  const [width, setWidth] = useState(current?.width || ''); const [height, setHeight] = useState(current?.height || '');
  const [editing, setEditing] = useState(null); const [mode, setMode] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [xrSupported, setXrSupported] = useState(null);
  const [savedReference, setSavedReference] = useState(Boolean(current));
  const calibration = { version: 1, imageName, boxes };
  const valid = validatePhotoCalibration(calibration) && !pending.length;

  useEffect(() => {
    let active = true;
    if (!navigator.xr?.isSessionSupported) { setXrSupported(false); return; }
    navigator.xr.isSessionSupported('immersive-ar').then((value) => { if (active) setXrSupported(value); }).catch(() => { if (active) setXrSupported(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    function beforeUnload(event) { if (boxes.length && !savedReference) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [boxes.length, savedReference]);

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
        const entry = { id: activeId, imageName, photo: storedPhoto, boxes, pending, width, height, updatedAt: new Date().toISOString() };
        const sessions = [entry, ...existing.sessions.filter((item) => item.id !== activeId)];
        writeLocalLibrary(sessions, activeId);
        setLibrary(sessions); setStorageStatus('saved'); setStorageError(''); setSavedReference(true);
      } catch (cause) { if (!cancelled) { setStorageStatus('error'); setStorageError(cause.message); } }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [photo, imageName, boxes, pending, width, height, activeId]);

  function openSaved(entry) {
    setPhoto(entry.photo); setImageName(entry.imageName); setBoxes(entry.boxes); setPending(entry.pending);
    setWidth(entry.width); setHeight(entry.height); setActiveId(entry.id); setEditing(null); setStep(1); setMessage(''); setSavedReference(true);
  }
  function deleteSaved(id) {
    try {
      const sessions = library.filter((entry) => entry.id !== id);
      writeLocalLibrary(sessions, activeId === id ? '' : activeId); setLibrary(sessions);
      if (activeId === id) { setPhoto(''); setImageName(''); setBoxes([]); setPending([]); setActiveId(''); setStep(0); setStorageStatus(''); }
      setMessage('Parete eliminata da questo browser.');
    } catch (cause) { setStorageError(cause.message); }
  }

  async function loadPhoto(file, name) {
    setBusy(true); setMessage('');
    try {
      const url = await fileDataUrl(file);
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(url)) throw new Error('Formato non supportato.');
      const image = new Image(); image.src = url; await image.decode();
      if (imageName !== name || photo) { setBoxes([]); setSavedReference(false); }
      setActiveId(crypto.randomUUID());
      setPhoto(url); setImageName(name); setPending([]); setEditing(null); setStep(1);
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
      setPhoto(session.imageDataUrl || ''); setImageName(session.imageName); setBoxes(session.boxes);
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
    if (!(Number(width) > 0 && Number(height) > 0)) { setMessage('Inserisci larghezza e altezza del bordo della scatola prima di selezionare gli angoli.'); return; }
    if (boxes.length >= 20) { setMessage('Puoi usare fino a 20 scatole.'); return; }
    const next = [...pending, point];
    if (next.length < 4) { setPending(next); return; }
    const box = { widthCm: Number(width), heightCm: Number(height), points: next };
    if (!validatePhotoCalibration({ ...calibration, boxes: [box] })) { setMessage('Gli angoli devono formare un rettangolo in prospettiva. Correggi l’ultimo punto o annulla.'); return; }
    setBoxes([...boxes, box]); setPending([]);
  }

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
        <div className="intro"><div className="eyebrow">IL TUO ARCHIVIO DI CANTIERE, IN AR</div><h1>Riguarda dentro<br />le tue pareti.</h1><p>Una foto delle tracce. Le scatole come riferimenti.<br />Ritrova i percorsi degli impianti sulla parete di oggi.</p></div>
        {library.length > 0 && <section aria-label="Pareti salvate" className="local-library"><div className="section-heading"><h2>Le tue pareti</h2><span className="muted">Solo su questo dispositivo</span></div><div className="saved-grid">{library.map((entry) => <article className="saved-card" key={entry.id}><button className="saved-open" onClick={() => openSaved(entry)}><img src={entry.photo} alt="" /><strong>{entry.imageName}</strong><span>{entry.boxes.length} scatole · Riprendi →</span></button><button className="quiet" aria-label={`Elimina ${entry.imageName}`} onClick={() => deleteSaved(entry.id)}>Elimina dal browser</button></article>)}</div></section>}
        <div className="welcome-grid"><label className={`upload-card ${busy ? 'busy' : ''}`}><span className="upload-icon">＋</span><strong>{busy ? 'Apertura foto…' : 'Aggiungi la foto di una parete'}</strong><span>JPG, PNG o WebP · elaborata nel browser</span><span className="button primary">Scegli una foto</span><input disabled={busy} aria-label="Foto originale" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files[0]; if (file) loadPhoto(file, file.name); event.target.value = ''; }} /></label>
          <div className="how-card panel"><span className="eyebrow">COME FUNZIONA</span><ol><li><strong>Prepara la foto</strong><span>Indica gli angoli delle scatole e le loro dimensioni.</span></li><li><strong>Inquadra la parete</strong><span>Ritrova gli stessi riferimenti nel mondo reale.</span></li><li><strong>Rivela le tracce</strong><span>Regola la trasparenza e confronta i due momenti.</span></li></ol></div>
        </div>
        <p className="privacy-note">Foto e riferimenti vengono salvati nel localStorage di questo browser. Puoi esportarli o eliminarli quando vuoi; non vengono caricati online.</p>
      </>}
      {step === 1 && <>
        <div className="section-heading"><div><div className="eyebrow">01 / PREPARAZIONE</div><h1>Trova i tuoi punti fermi.</h1><p>{imageName} · {boxes.length} {boxes.length === 1 ? 'scatola pronta' : 'scatole pronte'}</p></div><button className="quiet" onClick={() => setStep(0)}>Cambia foto</button></div>
        <div className="prepare-grid"><div><div className="photo-toolbar"><div><span className="eyebrow">SCATOLA {editing === null ? boxes.length + 1 : Math.floor(editing / 4) + 1}</span><strong>{editing === null ? `Tocca ${cornerNames[pending.length]}` : `Correggi ${cornerNames[editing % 4]}`}</strong></div><div className="dimension-grid"><label>Larghezza <span>cm</span><input aria-label="Larghezza (cm)" type="number" min="0.1" step="0.1" placeholder="es. 13,2" value={width} onChange={(event) => setWidth(event.target.value)} /></label><label>Altezza <span>cm</span><input aria-label="Altezza (cm)" type="number" min="0.1" step="0.1" placeholder="es. 7,4" value={height} onChange={(event) => setHeight(event.target.value)} /></label></div></div><Annotator src={photo} points={[...boxes.flatMap((box) => box.points), ...pending]} activeIndex={editing} onPoint={pointSelected} />
          <div className="image-caption"><span>⌖ Tieni premuto e trascina per usare la lente.</span><button className="quiet" disabled={!pending.length && editing === null} onClick={() => { if (editing !== null) setEditing(null); else setPending(pending.slice(0, -1)); }}>↶ {editing !== null ? 'Annulla modifica' : 'Annulla punto'}</button></div></div>
          <aside className="panel prepare-controls"><div className="eyebrow">{editing === null ? `SCATOLA ${boxes.length + 1}` : 'CORREGGI RIFERIMENTO'}</div><h2>{editing === null ? 'Quattro angoli, una misura.' : `Scatola ${Math.floor(editing / 4) + 1}`}</h2><p>Misura il bordo che selezioni. Usa riferimenti sullo stesso piano; due scatole distanti migliorano l’allineamento.</p>
            
            <div className="corner-guide" aria-label="Ordine degli angoli"><span>1 ↖</span><span>↗ 2</span><span>4 ↙</span><span>↘ 3</span></div>
            <div className="current-corner" role="status">{editing !== null ? `Tocca il nuovo angolo ${cornerNames[editing % 4]}` : `Tocca ${cornerNames[pending.length]}`}</div><progress aria-label="Angoli della scatola" max="4" value={pending.length} />
            {boxes.map((box, i) => <div className="box-summary" key={i}><div><strong>✓ Scatola {i + 1}</strong><span>{box.widthCm} × {box.heightCm} cm</span><details className="box-dimensions"><summary>Modifica misure</summary>{[['widthCm', 'Larghezza'], ['heightCm', 'Altezza']].map(([key, label]) => <label key={key}>{label} (cm)<input aria-label={`${label} scatola ${i + 1} (cm)`} type="number" min="0.1" step="0.1" value={box[key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) { setBoxes(boxes.map((entry, index) => index === i ? { ...entry, [key]: value } : entry)); setSavedReference(false); } }} /></label>)}</details><div className="point-buttons">{box.points.map((_, j) => <button className="quiet" key={j} aria-label={`Modifica scatola ${i + 1}, ${cornerNames[j]}`} onClick={() => { setPending([]); setEditing(i * 4 + j); }}>{j + 1}</button>)}</div></div><button className="quiet" aria-label={`Rimuovi scatola ${i + 1}`} onClick={() => { setBoxes(boxes.filter((_, index) => index !== i)); setPending([]); setEditing(null); setSavedReference(false); }}>×</button></div>)}
            <button className="primary" disabled={!valid || editing !== null} onClick={() => { setMessage(''); setStep(2); }}>Continua · Inquadra la parete →</button>
            <button className="secondary" disabled={!valid} onClick={() => { downloadSession(calibration, photo); setSavedReference(true); setMessage('Sessione esportata con foto e riferimenti. Conservala per riaprire il lavoro.'); }}>↓ Esporta sessione</button>
          </aside>
        </div>
      </>}
      {step === 2 && <>
        <div className="intro compact"><div className="eyebrow">02 / SULLA PARETE</div><h1>Dal cantiere a oggi.</h1><p>Riferimenti pronti. Scegli come sovrapporre la foto.</p></div>
        <div className="mode-grid"><section className="panel mode-card"><span className={`badge ${xrSupported ? 'good' : ''}`}>{xrSupported === null ? 'Verifica dispositivo…' : xrSupported ? 'Disponibile sul dispositivo' : 'Non disponibile su questo browser'}</span><div className="mode-symbol">◎</div><h2>WebAR spaziale</h2><p>Ancora la foto alla parete e muoviti nella stanza. Il dispositivo segue posizione e orientamento.</p><ul><li>Mirino guidato sui quattro angoli della prima scatola</li><li>Scala dalle dimensioni reali della scatola</li><li>Richiede WebXR, rilevamento superfici e HTTPS</li></ul><button className="primary" disabled={!xrSupported} onClick={() => setMode('xr')}>Apri WebAR →</button></section>
          <section className="panel mode-card"><span className="badge">Fotocamera del browser</span><div className="mode-symbol">⌖</div><h2>Foto in sovrapposizione</h2><p>Allinea tutti i riferimenti su un fotogramma e seguili nel video. Utile anche quando WebXR non è supportato.</p><ul><li>Selezione precisa con fermo immagine e lente</li><li>Omografia con tutte le scatole annotate</li><li>Tracking video sperimentale, richiede HTTPS o localhost</li></ul><button className={xrSupported ? 'secondary' : 'primary'} onClick={() => setMode('camera')}>Apri fotocamera →</button></section></div>
        <div className="session-footer"><button className="quiet" onClick={() => setStep(1)}>← Modifica riferimenti</button><button className="secondary" onClick={() => { downloadSession(calibration, photo); setSavedReference(true); }}>↓ Esporta sessione</button></div>
      </>}
    </main><footer className="app-footer"><span>TRACCE / WEBAR</span><span>Una parete alla volta.</span></footer>
  </div>;
}
