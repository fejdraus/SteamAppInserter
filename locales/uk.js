const uk = {
  common: {
    ok: "OK",
    cancel: "Скасувати",
    remove: "Видалити",
    errorWithMessage: "Помилка: {message}",
  },
  buttons: {
    addToLibrary: "Додати до бібліотеки",
    editDlcLibrary: "Редагувати бібліотеку DLC",
    removeFromLibrary: "Видалити з бібліотеки",
    loading: "Завантаження...",
    adding: "Додавання...",
    removing: "Видалення...",
  },
  errors: {
    manifestMissing:
      "Маніфест недоступний на публічних дзеркалах. Запросіть доступ вручну.",
    failedAddSelectedDlc: "Не вдалося додати вибрані DLC.",
    failedInstallBaseGame: "Не вдалося встановити базову гру.",
    failedFetchInfo: "Не вдалося отримати інформацію про гру.",
    failedRemoveGame: "Не вдалося видалити гру!",
  },
  alerts: {
    addingFailedTitle: "Помилка додавання",
    unableAddTitle: "Не вдається додати гру",
    unableGetDlcTitle: "Не вдається отримати список DLC",
    unableRemoveTitle: "Не вдається видалити",
    noDlcTitle: "Немає доступних DLC",
  },
  messages: {
    changesApplied: "Зміни застосовано.",
    gameAdded: "Гру успішно додано!",
    gameRemoved: "Гру успішно видалено!",
    noDlcDetails: "Ця гра не має DLC для встановлення.",
  },
  dialogs: {
    selectDlc: {
      title: "Виберіть DLC для додавання",
      subtitle: "Позначте DLC, які хочете додати. Зніміть позначку з непотрібних.",
      selectAll: "Вибрати всі DLC",
      confirm: "Застосувати вибір",
      alreadyAdded: "вже додано",
    },
    baseInstall: {
      title: "Додати до бібліотеки",
      message: "У цієї гри немає DLC. Додати її до своєї бібліотеки?",
      confirm: "Додати гру",
    },
    restart: {
      title: "Перезапустити Steam",
      message: "{details} Потрібно перезапустити Steam. Перезапустити зараз?",
      confirm: "Перезапустити",
      cancel: "Пізніше",
    },
    remove: {
      title: "Видалити з бібліотеки",
      message: "Ви впевнені, що хочете видалити цю гру з бібліотеки?",
    },
  },
  labels: {
    dlcWithId: "DLC {id}",
  },
};

export default uk;
