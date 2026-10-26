# Privacy

Tracce è un'app statica. Non richiede un account e non invia foto, fotogrammi,
riferimenti o sessioni a un server applicativo. Non include analytics, script
remoti, font esterni o immagini dimostrative di abitazioni.

La fotocamera è attivata soltanto dopo la scelta dell'utente e il consenso del
browser. I flussi video vengono fermati all'uscita dalla modalità fotocamera.
Le sessioni WebXR sono gestite dal browser e terminano all'uscita dalla vista AR.
Foto e annotazioni vengono salvate nel localStorage di questo browser. Puoi
riprendere o eliminare ogni parete dalla schermata “Le tue pareti”. Le foto grandi
vengono ridimensionate per ridurre lo spazio occupato. In caso di quota esaurita,
i dati già salvati restano intatti e puoi esportare il lavoro corrente.
L’esportazione salva un JSON sul dispositivo,
con la foto incorporata. Non pubblicare quel file.

Come ogni sito su GitHub Pages, l'accesso al sito comporta richieste al servizio
di hosting e il suo normale trattamento dei dati di connessione. Consulta
l'informativa privacy di GitHub per i dettagli sul servizio di hosting.

Il controllo `npm run privacy:check` verifica una lista esplicita dei file sorgente,
blocca immagini e dati personali e controlla anche gli asset compilati.
La `.gitignore` esclude foto, sessioni JSON, cartelle dati, segreti locali e build.
Il controllo automatico è un aiuto e non sostituisce la revisione dei nuovi file.
