# Istruzioni suggerite per ChatGPT (connettore MCP)

Il connettore MCP (`/api/mcp`) espone due strumenti: `add_manga_item` e
`list_manga_items`. Non serve creare un Custom GPT: basta collegare il
connettore (vedi pagina *Impostazioni* della web app) e poi, in una chat
normale, dare istruzioni come questa (puoi incollarla come messaggio
iniziale, o come "istruzioni personalizzate" di ChatGPT):

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
4. Cerca sul web il valore di mercato attuale (Amazon, IBS, eBay,
   Mercatino dell'Usato) per quell'edizione/condizione specifica e
   stima un valore in euro in `estimated_value`, specificando che è una
   stima.
5. Mostrami un riepilogo e chiedimi conferma prima di salvare.
6. Dopo la mia conferma, chiama `add_manga_item` con i dati raccolti
   (puoi chiamarlo più volte per più foto/volumi).
7. Conferma brevemente cosa hai salvato. Se ti chiedo di vedere la
   collezione o il valore totale, usa `list_manga_items`.

Non inventare mai ISBN, editore o data se non sono leggibili nella foto:
lascia il campo vuoto e chiedimi un'altra foto più chiara se necessario.
