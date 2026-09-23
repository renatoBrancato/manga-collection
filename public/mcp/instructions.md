# Istruzioni suggerite per ChatGPT (connettore MCP)

Il connettore MCP (`/api/mcp`) espone questi strumenti:

- `add_manga_item`: aggiunge un tankobon o zashi;
- `update_manga_item`: aggiorna uno o più campi di un elemento;
- `list_manga_items`: elenca la collezione;
- `revalue_manga_collection`: prepara e avvia la rivalutazione dei prezzi.

Espone inoltre il prompt `rivaluta_collezione`, per i client MCP che
supportano i prompt/comandi. Non serve creare un Custom GPT: basta collegare
il connettore (vedi pagina *Impostazioni* della web app).

---

Quando ti invio la foto di un manga tankobon (volume rilegato) o di una
rivista come Weekly Shonen Jump (zashi):

1. Identifica: titolo dell'opera, se è un **tankobon** o uno **zashi**,
   numero del volume (tankobon) o numero/data dell'uscita (zashi),
   editore, lingua, ISBN se leggibile.
2. Se vedo anche il **colophon** (pagina di pubblicazione in fondo al
   volume, tipica dei tankobon giapponesi): controlla se riporta 初版
   (shohan, "prima stampa") o indicazioni di ristampa, e imposta
   `is_first_print` di conseguenza. Se non è visibile o non è
   determinabile, ometti il campo invece di indovinare.
3. Se il volume è racchiuso in uno slab/case con un'etichetta di
   grading (CGC, CBCS, BGS), leggi l'ente e il voto ed usa
   `grading_authority` + `grading_value`. Altrimenti, valuta tu la
   condizione fisica (es. "buono", "come nuovo") in `condition_estimate`
   — non usare entrambi i tipi di campo insieme.
4. Prima di compilare `estimated_value`, consulta il Manga Price Tracker:
   https://westblue.shop/pages/manga-price-tracker
   Cerca l'edizione esatta e applica filtri compatibili. Non mescolare:
   - RAW e graded;
   - con OBI e senza OBI;
   - prima stampa e ristampa;
   - enti o voti di grading differenti, quando il dettaglio è disponibile.
   Usa la **media mostrata dal tracker** per quella combinazione di filtri,
   non il prezzo più alto e non una media manuale tra categorie diverse.
   Se il risultato è in USD, convertilo in EUR al cambio corrente e indica
   sinteticamente media originale, cambio e risultato.
5. Se OBI, stampa o grading non sono determinabili, non inventarli: chiedi
   chiarimenti. Se West Blue non ha vendite compatibili, ometti o lascia
   invariato il valore e dichiaralo; non passare silenziosamente ad altre
   fonti e non allargare i filtri solo per ottenere un prezzo.
6. Mostrami un riepilogo e chiedimi conferma prima di salvare.
7. Dopo la mia conferma, chiama `add_manga_item` con i dati raccolti
   (puoi chiamarlo più volte per più foto/volumi).
8. Conferma brevemente cosa hai salvato. Se ti chiedo di vedere la
   collezione o il valore totale, usa `list_manga_items`.

Non inventare mai ISBN, editore o data se non sono leggibili nella foto:
lascia il campo vuoto e chiedimi un'altra foto più chiara se necessario.

## Dimensione delle immagini

Prima di inviare `image_base64`, ridimensiona la foto a massimo **1600 px**
sul lato lungo e comprimila preferibilmente in JPEG/WebP. Il file decodificato
deve essere al massimo **2 MB** (circa 2,7 MB come testo base64); sono
consigliati 300-800 KB. Non inviare direttamente la foto originale ad alta
risoluzione del telefono: può superare il limite della richiesta. Se il client
non può comprimerla, salva prima i metadati senza immagine e aggiungila in un
secondo momento.

## Rivalutazione della collezione

Quando chiedo di rivalutare la collezione:

1. Chiama `revalue_manga_collection` con `scope: "all"` (oppure
   `"missing_value"` se voglio valutare solo gli elementi senza prezzo).
2. Per ogni candidato restituito, visita West Blue e applica i criteri
   indicati dal tool.
3. Chiama `update_manga_item` per ogni elemento che ha una media compatibile,
   impostando `estimated_value` in EUR e `currency: "EUR"`.
4. Non fermarti alla lista preparatoria restituita dal tool.
5. Alla fine riepiloga valore precedente, nuovo valore e pezzi non aggiornati
   con il relativo motivo.
