import layout from "./layout";
import dashboard from "./dashboard";
import login from "./login";
import settings from "./settings";
import shareView from "./shareView";
import itemDetailsModal from "./itemDetailsModal";
import donateButton from "./donateButton";
import logoutButton from "./logoutButton";
import regenerateKeyButton from "./regenerateKeyButton";
import dashboardRecovery from "./dashboardRecovery";
import googleLoginButton from "./googleLoginButton";
import kpiBar from "./kpiBar";
import collectionValueChart from "./collectionValueChart";
import valueChart from "./valueChart";
import deleteItemDialog from "./deleteItemDialog";
import shareButton from "./shareButton";
import itemsTable from "./itemsTable";
import aiChatPanel from "./aiChatPanel";
import addItemForm from "./addItemForm";
import editItemModal from "./editItemModal";
import itemHistoryModal from "./itemHistoryModal";
import stockList from "./stockList";

/**
 * Dizionario globale dell'app, composto da un file per componente/pagina
 * (namespace). Ogni namespace espone `{ it, en }`: qui li raggruppiamo per
 * lingua così `dictionaries.it.itemsTable.xxx` resta tipizzato end-to-end.
 *
 * Nuovi namespace si aggiungono importandoli sopra e inserendoli qui sotto
 * sia per "it" che per "en" con la stessa chiave.
 */
export const dictionaries = {
  it: {
    layout: layout.it,
    dashboard: dashboard.it,
    login: login.it,
    settings: settings.it,
    shareView: shareView.it,
    itemDetailsModal: itemDetailsModal.it,
    donateButton: donateButton.it,
    logoutButton: logoutButton.it,
    regenerateKeyButton: regenerateKeyButton.it,
    dashboardRecovery: dashboardRecovery.it,
    googleLoginButton: googleLoginButton.it,
    kpiBar: kpiBar.it,
    collectionValueChart: collectionValueChart.it,
    valueChart: valueChart.it,
    deleteItemDialog: deleteItemDialog.it,
    shareButton: shareButton.it,
    itemsTable: itemsTable.it,
    aiChatPanel: aiChatPanel.it,
    addItemForm: addItemForm.it,
    editItemModal: editItemModal.it,
    itemHistoryModal: itemHistoryModal.it,
    stockList: stockList.it,
  },
  en: {
    layout: layout.en,
    dashboard: dashboard.en,
    login: login.en,
    settings: settings.en,
    shareView: shareView.en,
    itemDetailsModal: itemDetailsModal.en,
    donateButton: donateButton.en,
    logoutButton: logoutButton.en,
    regenerateKeyButton: regenerateKeyButton.en,
    dashboardRecovery: dashboardRecovery.en,
    googleLoginButton: googleLoginButton.en,
    kpiBar: kpiBar.en,
    collectionValueChart: collectionValueChart.en,
    valueChart: valueChart.en,
    deleteItemDialog: deleteItemDialog.en,
    shareButton: shareButton.en,
    itemsTable: itemsTable.en,
    aiChatPanel: aiChatPanel.en,
    addItemForm: addItemForm.en,
    editItemModal: editItemModal.en,
    itemHistoryModal: itemHistoryModal.en,
    stockList: stockList.en,
  },
} as const;

export type Dictionary = typeof dictionaries.it;
