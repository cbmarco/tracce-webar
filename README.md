# Tracce · WebAR

Sovrapponi le foto delle tracce degli impianti alla parete reale, usandogli angoli
 delle scatole come riferimenti. App statica in React, Vite e Three.js, senza backend.

**App:** https://cbmarco.github.io/tracce-webar/

## Uso

1. Carica una foto dal tuo dispositivo (JPG, PNG o WebP).
2. Seleziona i quattro angoli di una o più scatole, senza inserire misure.
3. Scegli WebAR spaziale, se supportato, oppure fotocamera con omografia.
4. Il lavoro viene salvato automaticamente nel localStorage del browser. Puoi anche esportarlo in un JSON locale.

La lente aiuta a posizionare e correggere gli angoli.
WebXR allinea la prima scatola ai punti rilevati sulla parete. La modalità video usa tutti gli
angoli annotati e un tracking sperimentale. Verifica la precisione sul posto.
L'immagine non è una verifica sufficiente per decidere dove forare.

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
