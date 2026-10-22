const settings = {
  it: {
    heading: "🔌 Connessione MCP",
    backToCollection: "← Torna alla collezione",
    apiKeyTitle: "La tua API key personale",
    apiKeyDescription:
      "Usala nella configurazione dell'Action del tuo Custom GPT così i volumi scansionati vengono salvati nel tuo account.",
    howToConnectTitle: "Come collegare ChatGPT (connettore MCP)",
    step1Before: "Su chatgpt.com apri ",
    step1Strong: "Impostazioni → App e connettori",
    step1After: " (potrebbe servire attivare prima la \"Developer mode\" nelle impostazioni avanzate).",
    step2Before: "Clicca ",
    step2Strong: "Crea/Aggiungi connettore",
    step2After: " e inserisci come URL:",
    step3Before: "Come autenticazione scegli ",
    step3Strong:
      "API Key / ****** e incolla la tua API key qui sopra. Ogni utente configura la propria: i dati restano separati per account.",
    step4Before: "Salva. ChatGPT rileverà automaticamente gli strumenti ",
    step4Middle: " e ",
    step4After: ".",
    step5:
      "In chat, allega la foto del volume (copertina, dorso ed eventualmente il colophon per la prima stampa) e chiedi a ChatGPT di identificarlo, stimarne il valore cercando sul web, e salvarlo nella collezione: userà automaticamente il connettore.",
  },
  en: {
    heading: "🔌 MCP connection",
    backToCollection: "← Back to collection",
    apiKeyTitle: "Your personal API key",
    apiKeyDescription:
      "Use it in your Custom GPT's Action configuration so scanned volumes are saved to your account.",
    howToConnectTitle: "How to connect ChatGPT (MCP connector)",
    step1Before: "On chatgpt.com open ",
    step1Strong: "Settings → Apps & Connectors",
    step1After: " (you may need to enable \"Developer mode\" in the advanced settings first).",
    step2Before: "Click ",
    step2Strong: "Create/Add connector",
    step2After: " and enter this URL:",
    step3Before: "For authentication choose ",
    step3Strong:
      "API Key / ****** and paste your API key above. Each user sets up their own: data stays separate per account.",
    step4Before: "Save. ChatGPT will automatically detect the ",
    step4Middle: " and ",
    step4After: " tools.",
    step5:
      "In chat, attach a photo of the volume (cover, spine, and optionally the colophon for first prints) and ask ChatGPT to identify it, estimate its value by searching the web, and save it to the collection: it will automatically use the connector.",
  },
};

export default settings;
