const en = {
  common: {
    ok: "OK",
    cancel: "Cancel",
    remove: "Remove",
    errorWithMessage: "Error: {message}",
  },
  buttons: {
    addToLibrary: "Add to library",
    editDlcLibrary: "Edit DLC library",
    removeFromLibrary: "Remove from library",
    loading: "Loading...",
    adding: "Adding...",
    removing: "Removing...",
  },
  errors: {
    manifestMissing: "Manifest not found on public mirrors. Please request manual access.",
    failedAddSelectedDlc: "Failed to add selected DLC.",
    failedInstallBaseGame: "Failed to install the base game.",
    failedFetchInfo: "Failed to fetch game information.",
    failedRemoveGame: "Failed to remove the game!",
  },
  alerts: {
    addingFailedTitle: "Adding failed",
    unableAddTitle: "Unable to add game",
    unableGetDlcTitle: "Unable to get DLC list",
    unableRemoveTitle: "Unable to remove",
    noDlcTitle: "No DLC available",
  },
  messages: {
    changesApplied: "Changes applied.",
    gameAdded: "Game added successfully!",
    gameRemoved: "Game removed successfully!",
    noDlcDetails: "This game has no DLC to install.",
  },
  dialogs: {
    selectDlc: {
      title: "Select DLC to add",
      subtitle: "Select DLC to add. Uncheck any you don't want to add.",
      selectAll: "Select all DLC",
      confirm: "Apply selection",
      alreadyAdded: "already added",
    },
    baseInstall: {
      title: "Add to library",
      message: "This game has no DLC. Do you want to add it to your library?",
      confirm: "Add game",
    },
    restart: {
      title: "Restart Steam",
      message: "{details} Steam needs to restart. Restart now?",
      confirm: "Restart now",
      cancel: "Later",
    },
    remove: {
      title: "Remove from library",
      message: "Are you sure you want to remove this game from your library?",
    },
  },
  labels: {
    dlcWithId: "DLC {id}",
  },
};

export default en;
