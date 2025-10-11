const fr = {
  common: {
    ok: "OK",
    cancel: "Annuler",
    remove: "Retirer",
    errorWithMessage: "Erreur : {message}",
  },
  buttons: {
    addToLibrary: "Ajouter à la bibliothèque",
    editDlcLibrary: "Modifier les DLC de la bibliothèque",
    removeFromLibrary: "Retirer de la bibliothèque",
    loading: "Chargement...",
    adding: "Ajout en cours...",
    removing: "Retrait en cours...",
  },
  errors: {
    manifestMissing: "Manifeste introuvable sur les miroirs publics. Demandez un accès manuel.",
    failedAddSelectedDlc: "Impossible d'ajouter les DLC sélectionnés.",
    failedInstallBaseGame: "Impossible d'installer le jeu de base.",
    failedFetchInfo: "Impossible de récupérer les informations du jeu.",
    failedRemoveGame: "Impossible de retirer le jeu !",
  },
  alerts: {
    addingFailedTitle: "Échec de l'ajout",
    unableAddTitle: "Impossible d'ajouter le jeu",
    unableGetDlcTitle: "Impossible d'obtenir la liste des DLC",
    unableRemoveTitle: "Impossible de retirer",
    noDlcTitle: "Aucun DLC disponible",
  },
  messages: {
    changesApplied: "Modifications appliquées.",
    gameAdded: "Jeu ajouté avec succès !",
    gameRemoved: "Jeu retiré avec succès !",
    noDlcDetails: "Ce jeu n'a pas de DLC à installer.",
  },
  dialogs: {
    selectDlc: {
      title: "Sélectionner les DLC à ajouter",
      subtitle: "Sélectionnez les DLC à ajouter. Décochez ceux que vous ne voulez pas.",
      selectAll: "Tout sélectionner",
      confirm: "Appliquer la sélection",
      alreadyAdded: "déjà ajouté",
    },
    baseInstall: {
      title: "Ajouter à la bibliothèque",
      message: "Ce jeu n'a aucun DLC. Voulez-vous l'ajouter à votre bibliothèque ?",
      confirm: "Ajouter le jeu",
    },
    restart: {
      title: "Redémarrer Steam",
      message: "{details} Steam doit redémarrer. Redémarrer maintenant ?",
      confirm: "Redémarrer maintenant",
      cancel: "Plus tard",
    },
    remove: {
      title: "Retirer de la bibliothèque",
      message: "Êtes-vous sûr de vouloir retirer ce jeu de votre bibliothèque ?",
    },
  },
  labels: {
    dlcWithId: "DLC {id}",
  },
};

export default fr;
