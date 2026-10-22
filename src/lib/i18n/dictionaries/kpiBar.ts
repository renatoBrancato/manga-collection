const kpiBar = {
  it: {
    totalVolumes: "Volumi totali",
    estimatedValue: "Valore stimato",
    differentSeries: "Serie diverse",
    tankobonZashi: "Tankobon / Zashi",
    gradedItems: "Pezzi gradati",
    firstPrint: "Prima stampa",
    withWithoutObi: "Con OBI / Senza",
    obiUnknown: (count: number) => `${count} con OBI non specificato`,
    topSeries: "Serie più numerosa",
    noValue: "-",
  },
  en: {
    totalVolumes: "Total volumes",
    estimatedValue: "Estimated value",
    differentSeries: "Different series",
    tankobonZashi: "Tankobon / Zashi",
    gradedItems: "Graded items",
    firstPrint: "First print",
    withWithoutObi: "With OBI / Without",
    obiUnknown: (count: number) => `${count} with unspecified OBI`,
    topSeries: "Largest series",
    noValue: "-",
  },
};

export default kpiBar;
