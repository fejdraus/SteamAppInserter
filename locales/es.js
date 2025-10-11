const es = {
  common: {
    ok: "Aceptar",
    cancel: "Cancelar",
    remove: "Quitar",
    errorWithMessage: "Error: {message}",
  },
  buttons: {
    addToLibrary: "Añadir a la biblioteca",
    editDlcLibrary: "Editar DLC en la biblioteca",
    removeFromLibrary: "Quitar de la biblioteca",
    loading: "Cargando...",
    adding: "Añadiendo...",
    removing: "Quitando...",
  },
  errors: {
    manifestMissing: "Manifiesto no disponible en los espejos públicos. Solicita acceso manual.",
    failedAddSelectedDlc: "No se pudieron añadir los DLC seleccionados.",
    failedInstallBaseGame: "No se pudo instalar el juego base.",
    failedFetchInfo: "No se pudo obtener la información del juego.",
    failedRemoveGame: "¡No se pudo quitar el juego!",
  },
  alerts: {
    addingFailedTitle: "Error al añadir",
    unableAddTitle: "No se puede añadir el juego",
    unableGetDlcTitle: "No se puede obtener la lista de DLC",
    unableRemoveTitle: "No se puede quitar",
    noDlcTitle: "No hay DLC disponibles",
  },
  messages: {
    changesApplied: "Cambios aplicados.",
    gameAdded: "¡Juego añadido correctamente!",
    gameRemoved: "¡Juego eliminado correctamente!",
    noDlcDetails: "Este juego no tiene DLC para instalar.",
  },
  dialogs: {
    selectDlc: {
      title: "Selecciona los DLC que quieres añadir",
      subtitle: "Selecciona los DLC que quieras añadir. Desmarca los que no necesites.",
      selectAll: "Seleccionar todos los DLC",
      confirm: "Aplicar selección",
      alreadyAdded: "ya añadido",
    },
    baseInstall: {
      title: "Añadir a la biblioteca",
      message: "Este juego no tiene DLC. ¿Quieres añadirlo a tu biblioteca?",
      confirm: "Añadir juego",
    },
    restart: {
      title: "Reiniciar Steam",
      message: "{details} Steam necesita reiniciarse. ¿Reiniciar ahora?",
      confirm: "Reiniciar ahora",
      cancel: "Más tarde",
    },
    remove: {
      title: "Quitar de la biblioteca",
      message: "¿Seguro que quieres quitar este juego de tu biblioteca?",
    },
  },
  labels: {
    dlcWithId: "DLC {id}",
  },
  status: {
    preparing: "Preparando archivos...",
    downloading: "Descargando manifiestos...",
    merging: "Combinando seleccion de DLC...",
    removing: "Quitando de la biblioteca...",
    success: "Listo.",
    failure: "La operacion fallo.",
  },
  mirrors: {
    title: "Elige la fuente de descarga",
    default: "Espejos publicos (ManifestHub)",
    maniluaUnderConstruction: "API de Manilua (en desarrollo)",
    maniluaDisabled: "",
    manilua: "API de Manilua (requiere clave)",
  },
  auth: {
    title: "Clave de la API Manilua",
    instructions: "Introduce tu clave de la API Manilua. Puedes obtenerla en el panel de Manilua.",
    placeholder: "manilua_xxxxxxxxxxxxxxxxx",
    example: "Ejemplo: manilua_abc123...",
    save: "Guardar",
    saving: "Guardando...",
    required: "La clave es obligatoria.",
    invalid: "La clave no es valida. Intentalo de nuevo.",
    validationFailed: "La validacion de la clave fallo. Comprueba la clave e intentalo de nuevo.",
    error: "Error de validacion",
  },
};

export default es;


