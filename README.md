# Tracce · WebAR

Sovrapponi le foto delle tracce degli impianti alla parete reale, usandogli angoli
 delle scatole come riferimenti. App statica in React, Vite e Three.js, senza backend.

**App:** https://cbmarco.github.io/tracce-webar/

## Uso

1. Carica una foto dal tuo dispositivo (JPG, PNG o WebP).
2. Seleziona i quattro angoli di una o più scatole, senza inserire misure.
3. Scegli ArUco per l’aggancio automatico, WebAR spaziale se supportato, oppure fotocamera con omografia.
4. Il lavoro viene salvato automaticamente nel localStorage del browser. Puoi anche esportarlo in un JSON locale.

La lente aiuta a posizionare e correggere gli angoli.
WebXR allinea la prima scatola ai punti rilevati sulla parete. La modalità video usa tutti gli
angoli annotati e un tracking sperimentale. Verifica la precisione sul posto.
L'immagine non è una verifica sufficiente per decidere dove forare.

## Foto nuove con marker (percorso consigliato)

1. Dalla schermata iniziale scegli un ID e scarica il PNG per termica. Apri Kitty Printer e stampa il PNG senza ritagliare il bordo bianco. La stampa usa solo il margine del dizionario, senza quello aggiuntivo precedente; i marker già stampati restano validi.
2. Fissa il marker piatto sul piano della parete, in una posizione stabile. Per una parete ampia usa tre marker con ID diversi, distribuiti a triangolo sullo stesso piano della parete. Includili tutti nella foto e usa ID diversi anche sulle altre pareti.
3. Scatta le tracce includendo il marker intero e ben leggibile, poi carica la foto in Tracce. Il riconoscimento avviene localmente e salva gli angoli di tutti i marker leggibili nella foto (fino a 12). ID duplicati o marker rilevati troppo piccoli/tagliati vengono segnalati.
4. Premi **Apri WebAR con marker** e inquadra gli stessi marker, nella stessa posizione e orientamento: la foto si sovrappone senza selezionare scatole. Per le foto con più marker servono almeno due riferimenti leggibili e concordi; la barra indica quanti sono usati.
5. Il collegamento viene salvato nel browser e nel JSON esportato. Se sposti uno dei marker, rifai la foto; il solo ID non permette di ricostruirne la posizione originale.

L’allineamento con più marker usa insieme tutti gli angoli concordi e scarta i gruppi incoerenti. Con meno di due marker utilizzabili la sovrapposizione si nasconde e si riaggancia quando tornano visibili. Le sessioni precedenti con un solo marker restano compatibili e mantengono il loro funzionamento. La precisione reale va verificata sul posto; più marker non sostituiscono una stampa leggibile.

Se il marker non viene letto, l’app lo segnala e permette di usare il percorso tramite scatole. Le modalità WebXR spaziale e fotocamera manuale richiedono ancora almeno una scatola annotata. Il percorso con marker usa l’omografia nel video del browser e allinea il piano della parete.

## ArUco in basso a sinistra della placca

1. Prepara la foto indicando i quattro angoli della prima scatola.
2. Apri **ArUco sulla placca**, scegli un ID (0–249) e scarica il marker SVG.
   Per la stampante termica usa **Scarica marker PNG per termica**, poi **Apri Kitty Printer**:
   collega la stampante e carica il PNG come immagine, senza ritagliare il margine bianco.
   Il PNG è quadrato, 384 × 384 pixel; torna a Tracce dopo la stampa per il collegamento.
   Il dizionario è **ARUCO_MIP_36h12**, non DICT_4X4_50: usa la stampa generata dall’app.
3. Stampa in nero su bianco, conservando il margine bianco. Fissa il marker in basso
   a sinistra della placca, nello stesso punto e sullo stesso piano dei riferimenti.
4. Per una foto vecchia senza marker: inquadra marker e prima scatola, premi
   **Ferma e collega marker** e seleziona gli stessi quattro angoli della foto.
   Usa gli stessi bordi: una placca più grande non coincide con la scatola sottostante.
5. Salva il collegamento. Da quel momento la foto si aggancia automaticamente quando
   il marker corretto è visibile. Uscendo dal campo la proiezione si nasconde;
   tornando in vista si riaggancia. Il collegamento resta nel localStorage e nel JSON esportato.

Se sposti il marker rispetto alla placca o cambi foto, ripeti la calibrazione.
Inquadra un solo esemplare dello stesso ID; usa ID differenti su pareti differenti.
Il margine bianco e una stampa abbastanza leggibile aiutano il riconoscimento.
La posizione in basso a sinistra è una convenzione di montaggio: l’app misura
la relazione dalla calibrazione, senza ipotizzare distanze o offset in centimetri.

Questa modalità usa la fotocamera del browser e l’omografia, senza richiedere
WebXR o accesso alla camera immersiva. Il rilevamento funziona localmente tramite
[js-aruco2](https://github.com/damianofalcioni/js-aruco2). Le rotazioni del marker
sono riconosciute; il posizionamento rispetto alla placca deve restare ripetibile.
La precisione su pareti reali va verificata, soprattutto lontano da un marker piccolo.

## Privacy

Il repository e il sito non contengono foto di case, dati di impianti o sessioni.
Le foto caricate e il video vengono elaborati nel browser, senza upload,
telemetria o account. Foto, bozze e riferimenti vengono salvati nel localStorage
del dispositivo, non nel repository. “Le tue pareti” permette di riprendere o
eliminare le sessioni. Le foto grandi vengono ridimensionate per il salvataggio
locale; se lo spazio è esaurito l’app propone l’esportazione, senza cancellare
le sessioni precedenti. Cancellare i dati del browser elimina questo archivio. Il JSON esportato può contenere la tua foto: conservalo
privatamente e non aggiungerlo al repository. Vedi [PRIVACY.md](PRIVACY.md).

## Sviluppo

```sh
nvm use
npm ci
npm run dev
```

Apri http://localhost:5174/tracce-webar/. Fotocamera e WebXR richiedono HTTPS
oppure localhost. Sul telefono, usa il sito HTTPS di GitHub Pages.
WebXR richiede un dispositivo e un browser con `immersive-ar`, `hit-test` e
`dom-overlay`; altrimenti usa la modalità fotocamera.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

I test usano immagini sintetiche generate in memoria, senza foto personali.

## GitHub Pages

In **Settings → Pages → Build and deployment**, seleziona **GitHub Actions**.
Il workflow verifica codice, test, build e contenuti pubblici prima del deploy.
Il percorso degli asset viene ricavato dal nome del repository durante la build.
Per ospitare il sito alla radice di un dominio, compila con `BASE_PATH=/ npm run build`.

Il build statico è in `dist/`; non contiene foto o dati dell'utente.
