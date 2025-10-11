const ptBR = {
  common: {
    ok: "OK",
    cancel: "Cancelar",
    remove: "Remover",
    errorWithMessage: "Erro: {message}",
  },
  buttons: {
    addToLibrary: "Adicionar à biblioteca",
    editDlcLibrary: "Editar biblioteca de DLC",
    removeFromLibrary: "Remover da biblioteca",
    loading: "Carregando...",
    adding: "Adicionando...",
    removing: "Removendo...",
  },
  errors: {
    manifestMissing: "Manifesto indisponível nos espelhos públicos. Solicite acesso manual.",
    failedAddSelectedDlc: "Não foi possível adicionar os DLC selecionados.",
    failedInstallBaseGame: "Não foi possível instalar o jogo base.",
    failedFetchInfo: "Não foi possível obter as informações do jogo.",
    failedRemoveGame: "Não foi possível remover o jogo!",
  },
  alerts: {
    addingFailedTitle: "Falha ao adicionar",
    unableAddTitle: "Não foi possível adicionar o jogo",
    unableGetDlcTitle: "Não foi possível obter a lista de DLC",
    unableRemoveTitle: "Não foi possível remover",
    noDlcTitle: "Nenhum DLC disponível",
  },
  messages: {
    changesApplied: "Alterações aplicadas.",
    gameAdded: "Jogo adicionado com sucesso!",
    gameRemoved: "Jogo removido com sucesso!",
    noDlcDetails: "Este jogo não possui DLC para instalar.",
  },
  dialogs: {
    selectDlc: {
      title: "Selecione os DLC para adicionar",
      subtitle: "Selecione os DLC que deseja adicionar. Desmarque os que não quiser.",
      selectAll: "Selecionar todos os DLC",
      confirm: "Aplicar seleção",
      alreadyAdded: "já adicionado",
    },
    baseInstall: {
      title: "Adicionar à biblioteca",
      message: "Este jogo não possui DLC. Deseja adicioná-lo à sua biblioteca?",
      confirm: "Adicionar jogo",
    },
    restart: {
      title: "Reiniciar Steam",
      message: "{details} A Steam precisa reiniciar. Reiniciar agora?",
      confirm: "Reiniciar agora",
      cancel: "Depois",
    },
    remove: {
      title: "Remover da biblioteca",
      message: "Tem certeza de que deseja remover este jogo da sua biblioteca?",
    },
  },
  labels: {
    dlcWithId: "DLC {id}",
  },
  status: {
    preparing: "Preparando arquivos...",
    downloading: "Baixando manifestos...",
    merging: "Mesclando selecao de DLC...",
    removing: "Removendo da biblioteca...",
    success: "Concluido!",
    failure: "A operacao falhou.",
  },
};

export default ptBR;
