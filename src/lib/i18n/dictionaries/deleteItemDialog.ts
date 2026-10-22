const deleteItemDialog = {
  it: {
    title: (label: string) => `Rimuovere ${label}?`,
    description: "Il pezzo verrà tolto dalla collezione.",
    forgetHistoryLabel: "Cancella anche la traccia del suo valore nello storico",
    forgetHistoryOn: "Come se non l'avessi mai aggiunto: i grafici dei giorni passati non lo conteranno più.",
    forgetHistoryOff: "Lascialo spento se l'hai venduto: il valore dei giorni passati resta nei grafici.",
    genericError: "Rimozione non riuscita",
    cancel: "Annulla",
    confirm: "Rimuovi",
    confirming: "Rimozione…",
  },
  en: {
    title: (label: string) => `Remove ${label}?`,
    description: "The item will be removed from the collection.",
    forgetHistoryLabel: "Also erase its value history",
    forgetHistoryOn: "As if you had never added it: past days in the charts will no longer count it.",
    forgetHistoryOff: "Leave this off if you sold it: its past value stays in the charts.",
    genericError: "Removal failed",
    cancel: "Cancel",
    confirm: "Remove",
    confirming: "Removing…",
  },
};

export default deleteItemDialog;
