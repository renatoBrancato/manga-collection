const shareButton = {
  it: {
    openLabel: "🔗 Condividi",
    dialogTitle: "Condividi la collezione",
    close: "Chiudi",
    description:
      "Condividi la tua collezione con un link pubblico in sola lettura: chi lo apre può solo guardare, non può aggiungere o rimuovere nulla.",
    publicCollection: "Collezione pubblica",
    copy: "Copia",
    copied: "Copiato!",
    updateError: (message: string) => `Errore: ${message}`,
  },
  en: {
    openLabel: "🔗 Share",
    dialogTitle: "Share the collection",
    close: "Close",
    description:
      "Share your collection with a public read-only link: whoever opens it can only look, not add or remove anything.",
    publicCollection: "Public collection",
    copy: "Copy",
    copied: "Copied!",
    updateError: (message: string) => `Error: ${message}`,
  },
};

export default shareButton;
