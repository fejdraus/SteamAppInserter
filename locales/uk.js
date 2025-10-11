const uk = {
  common: {
    ok: "OK",
    cancel: "Скасувати",
    remove: "Видалити",
    errorWithMessage: "Помилка: {message}",
  },
  buttons: {
    addToLibrary: "Додати до бібліотеки",
    editDlcLibrary: "Редагувати DLC у бібліотеці",
    removeFromLibrary: "Видалити з бібліотеки",
    loading: "Завантаження...",
    adding: "Додавання...",
    removing: "Видалення...",
  },
  errors: {
    manifestMissing:
      "Маніфест недоступний на публічних дзеркалах. Запросіть доступ вручну.",
    failedAddSelectedDlc: "Не вдалося додати обрані DLC.",
    failedInstallBaseGame: "Не вдалося встановити базову гру.",
    failedFetchInfo: "Не вдалося отримати інформацію про гру.",
    failedRemoveGame: "Не вдалося видалити гру!",
  },
  alerts: {
    addingFailedTitle: "Помилка додавання",
    unableAddTitle: "Неможливо додати гру",
    unableGetDlcTitle: "Неможливо отримати список DLC",
    unableRemoveTitle: "Неможливо видалити",
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
      title: "Оберіть DLC для додавання",
      subtitle:
        "Оберіть DLC, які хочете додати. Зніміть позначки з непотрібних.",
      selectAll: "Вибрати всі DLC",
      confirm: "Застосувати вибір",
      alreadyAdded: "вже додано",
    },
    baseInstall: {
      title: "Додати до бібліотеки",
      message: "У цієї гри немає DLC. Додати її до вашої бібліотеки?",
      confirm: "Додати гру",
    },
    restart: {
      title: "Перезапустити Steam",
      message: "{details} Потрібно перезапустити Steam. Зробити це зараз?",
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
  status: {
    preparing: "Підготовка файлів...",
    downloading: "Завантаження маніфестів...",
    merging: "Застосування обраних DLC...",
    removing: "Видалення з бібліотеки...",
    success: "Готово!",
    failure: "Операція не вдалася.",
  },
  mirrors: {
    title: "Оберіть джерело завантаження",
    default: "Публічні дзеркала (ManifestHub)",
    maniluaUnderConstruction: "API Manilua (у розробці)",
    maniluaDisabled: "",
    manilua: "API Manilua (потрібен ключ)",
  },
  auth: {
    title: "API-ключ Manilua",
    instructions: "Введіть свій API-ключ Manilua. Його можна отримати в кабінеті Manilua.",
    placeholder: "manilua_xxxxxxxxxxxxxxxxx",
    example: "Приклад: manilua_abc123...",
    save: "Зберегти",
    saving: "Збереження...",
    required: "Необхідно вказати ключ.",
    invalid: "Ключ недійсний. Спробуйте ще раз.",
    validationFailed: "Перевірка API-ключа не вдалася. Перевірте ключ і спробуйте знову.",
    error: "Помилка перевірки",
  },
};

export default uk;

