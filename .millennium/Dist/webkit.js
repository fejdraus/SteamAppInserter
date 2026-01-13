const MILLENNIUM_IS_CLIENT_MODULE = false;
const pluginName = "steam-app-adder";
function InitializePlugins() {
    var _a, _b;
    /**
     * This function is called n times depending on n plugin count,
     * Create the plugin list if it wasn't already created
     */
    (_a = (window.PLUGIN_LIST || (window.PLUGIN_LIST = {})))[pluginName] || (_a[pluginName] = {});
    (_b = (window.MILLENNIUM_PLUGIN_SETTINGS_STORE || (window.MILLENNIUM_PLUGIN_SETTINGS_STORE = {})))[pluginName] || (_b[pluginName] = {});
    window.MILLENNIUM_SIDEBAR_NAVIGATION_PANELS || (window.MILLENNIUM_SIDEBAR_NAVIGATION_PANELS = {});
    /**
     * Accepted IPC message types from Millennium backend.
     */
    let IPCType;
    (function (IPCType) {
        IPCType[IPCType["CallServerMethod"] = 0] = "CallServerMethod";
    })(IPCType || (IPCType = {}));
    let MillenniumStore = window.MILLENNIUM_PLUGIN_SETTINGS_STORE[pluginName];
    let IPCMessageId = `Millennium.Internal.IPC.[${pluginName}]`;
    let isClientModule = MILLENNIUM_IS_CLIENT_MODULE;
    const ComponentTypeMap = {
        DropDown: ['string', 'number', 'boolean'],
        NumberTextInput: ['number'],
        StringTextInput: ['string'],
        FloatTextInput: ['number'],
        CheckBox: ['boolean'],
        NumberSlider: ['number'],
        FloatSlider: ['number'],
    };
    MillenniumStore.ignoreProxyFlag = false;
    function DelegateToBackend(pluginName, name, value) {
        return MILLENNIUM_BACKEND_IPC.postMessage(IPCType.CallServerMethod, {
            pluginName,
            methodName: '__builtins__.__update_settings_value__',
            argumentList: { name, value },
        });
    }
    async function ClientInitializeIPC() {
        /** Wait for the MainWindowBrowser to not be undefined */
        while (typeof MainWindowBrowserManager === 'undefined') {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        MainWindowBrowserManager?.m_browser?.on('message', (messageId, data) => {
            if (messageId !== IPCMessageId) {
                return;
            }
            const { name, value } = JSON.parse(data);
            MillenniumStore.ignoreProxyFlag = true;
            MillenniumStore.settingsStore[name] = value;
            DelegateToBackend(pluginName, name, value);
            MillenniumStore.ignoreProxyFlag = false;
        });
    }
    if (isClientModule) {
        ClientInitializeIPC();
    }
    const StartSettingPropagation = (name, value) => {
        if (MillenniumStore.ignoreProxyFlag) {
            return;
        }
        if (isClientModule) {
            DelegateToBackend(pluginName, name, value);
            /** If the browser doesn't exist yet, no use sending anything to it. */
            if (typeof MainWindowBrowserManager !== 'undefined') {
                MainWindowBrowserManager?.m_browser?.PostMessage(IPCMessageId, JSON.stringify({ name, value }));
            }
        }
        else {
            /** Send the message to the SharedJSContext */
            SteamClient.BrowserView.PostMessageToParent(IPCMessageId, JSON.stringify({ name, value }));
        }
    };
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    const DefinePluginSetting = (obj) => {
        return new Proxy(obj, {
            set(target, property, value) {
                if (!(property in target)) {
                    throw new TypeError(`Property ${String(property)} does not exist on plugin settings`);
                }
                const settingType = ComponentTypeMap[target[property].type];
                const range = target[property]?.range;
                /** Clamp the value between the given range */
                if (settingType.includes('number') && typeof value === 'number') {
                    if (range) {
                        value = clamp(value, range[0], range[1]);
                    }
                    value || (value = 0); // Fallback to 0 if the value is undefined or null
                }
                /** Check if the value is of the proper type */
                if (!settingType.includes(typeof value)) {
                    throw new TypeError(`Expected ${settingType.join(' or ')}, got ${typeof value}`);
                }
                target[property].value = value;
                StartSettingPropagation(String(property), value);
                return true;
            },
            get(target, property) {
                if (property === '__raw_get_internals__') {
                    return target;
                }
                if (property in target) {
                    return target[property].value;
                }
                return undefined;
            },
        });
    };
    MillenniumStore.DefinePluginSetting = DefinePluginSetting;
    MillenniumStore.settingsStore = DefinePluginSetting({});
}
InitializePlugins()
const __call_server_method__ = (methodName, kwargs) => Millennium.callServerMethod(pluginName, methodName, kwargs)
function __wrapped_callable__(route) {
    if (route.startsWith('webkit:')) {
        return MILLENNIUM_API.callable((methodName, kwargs) => MILLENNIUM_API.__INTERNAL_CALL_WEBKIT_METHOD__(pluginName, methodName, kwargs), route.replace(/^webkit:/, ''));
    }
    return MILLENNIUM_API.callable(__call_server_method__, route);
}
let PluginEntryPointMain = function() { var millennium_main = (function (exports, webkit) {
  'use strict';

  function _arrayLikeToArray(r, a) {
    (null == a || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
    return n;
  }
  function _arrayWithoutHoles(r) {
    if (Array.isArray(r)) return _arrayLikeToArray(r);
  }
  function asyncGeneratorStep(n, t, e, r, o, a, c) {
    try {
      var i = n[a](c),
        u = i.value;
    } catch (n) {
      return void e(n);
    }
    i.done ? t(u) : Promise.resolve(u).then(r, o);
  }
  function _asyncToGenerator(n) {
    return function () {
      var t = this,
        e = arguments;
      return new Promise(function (r, o) {
        var a = n.apply(t, e);
        function _next(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
        }
        function _throw(n) {
          asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
        }
        _next(void 0);
      });
    };
  }
  function _classCallCheck(a, n) {
    if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
  }
  function _defineProperties(e, r) {
    for (var t = 0; t < r.length; t++) {
      var o = r[t];
      o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, _toPropertyKey(o.key), o);
    }
  }
  function _createClass(e, r, t) {
    return r && _defineProperties(e.prototype, r), Object.defineProperty(e, "prototype", {
      writable: false
    }), e;
  }
  function _iterableToArray(r) {
    if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
  }
  function _nonIterableSpread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  function _regenerator() {
    /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
    var e,
      t,
      r = "function" == typeof Symbol ? Symbol : {},
      n = r.iterator || "@@iterator",
      o = r.toStringTag || "@@toStringTag";
    function i(r, n, o, i) {
      var c = n && n.prototype instanceof Generator ? n : Generator,
        u = Object.create(c.prototype);
      return _regeneratorDefine(u, "_invoke", function (r, n, o) {
        var i,
          c,
          u,
          f = 0,
          p = o || [],
          y = false,
          G = {
            p: 0,
            n: 0,
            v: e,
            a: d,
            f: d.bind(e, 4),
            d: function (t, r) {
              return i = t, c = 0, u = e, G.n = r, a;
            }
          };
        function d(r, n) {
          for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) {
            var o,
              i = p[t],
              d = G.p,
              l = i[2];
            r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0));
          }
          if (o || r > 1) return a;
          throw y = true, n;
        }
        return function (o, p, l) {
          if (f > 1) throw TypeError("Generator is already running");
          for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) {
            i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u);
            try {
              if (f = 2, i) {
                if (c || (o = "next"), t = i[o]) {
                  if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object");
                  if (!t.done) return t;
                  u = t.value, c < 2 && (c = 0);
                } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1);
                i = e;
              } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break;
            } catch (t) {
              i = e, c = 1, u = t;
            } finally {
              f = 1;
            }
          }
          return {
            value: t,
            done: y
          };
        };
      }(r, o, i), true), u;
    }
    var a = {};
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    t = Object.getPrototypeOf;
    var c = [][n] ? t(t([][n]())) : (_regeneratorDefine(t = {}, n, function () {
        return this;
      }), t),
      u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c);
    function f(e) {
      return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e;
    }
    return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine(u), _regeneratorDefine(u, o, "Generator"), _regeneratorDefine(u, n, function () {
      return this;
    }), _regeneratorDefine(u, "toString", function () {
      return "[object Generator]";
    }), (_regenerator = function () {
      return {
        w: i,
        m: f
      };
    })();
  }
  function _regeneratorDefine(e, r, n, t) {
    var i = Object.defineProperty;
    try {
      i({}, "", {});
    } catch (e) {
      i = 0;
    }
    _regeneratorDefine = function (e, r, n, t) {
      function o(r, n) {
        _regeneratorDefine(e, r, function (e) {
          return this._invoke(r, n, e);
        });
      }
      r ? i ? i(e, r, {
        value: n,
        enumerable: !t,
        configurable: !t,
        writable: !t
      }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2));
    }, _regeneratorDefine(e, r, n, t);
  }
  function _toConsumableArray(r) {
    return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
  }
  function _toPrimitive(t, r) {
    if ("object" != typeof t || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r);
      if ("object" != typeof i) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (String )(t);
  }
  function _toPropertyKey(t) {
    var i = _toPrimitive(t, "string");
    return "symbol" == typeof i ? i : i + "";
  }
  function _typeof(o) {
    "@babel/helpers - typeof";

    return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
      return typeof o;
    } : function (o) {
      return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
    }, _typeof(o);
  }
  function _unsupportedIterableToArray(r, a) {
    if (r) {
      if ("string" == typeof r) return _arrayLikeToArray(r, a);
      var t = {}.toString.call(r).slice(8, -1);
      return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
    }
  }

  var en = {
    common: {
      ok: "OK",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving...",
      removeAllDlc: "Remove all DLC",
      remove: "Remove",
      errorWithMessage: "Error: {message}"
    },
    buttons: {
      addToLibrary: "Add to library",
      editDlcLibrary: "Edit DLC library",
      removeFromLibrary: "Remove from library",
      loading: "Loading...",
      adding: "Adding...",
      removing: "Removing..."
    },
    errors: {
      manifestMissing: "Manifest not found on public mirrors. Please request manual access.",
      failedAddSelectedDlc: "Failed to add selected DLC.",
      failedInstallBaseGame: "Failed to install the base game.",
      failedFetchInfo: "Failed to fetch game information.",
      failedRemoveGame: "Failed to remove the game!"
    },
    alerts: {
      addingFailedTitle: "Adding failed",
      unableAddTitle: "Unable to add game",
      unableGetDlcTitle: "Unable to get DLC list",
      unableRemoveTitle: "Unable to remove",
      noDlcTitle: "No DLC available"
    },
    messages: {
      changesApplied: "Changes applied.",
      gameAdded: "Game added successfully!",
      gameRemoved: "Game removed successfully!",
      noDlcDetails: "This game has no DLC to install."
    },
    dialogs: {
      selectDlc: {
        title: "Select DLC to add",
        subtitle: "Select DLC to add. Uncheck any you don't want to add.",
        selectAll: "Select all DLC",
        confirm: "Apply selection",
        alreadyAdded: "already added"
      },
      baseInstall: {
        title: "Add to library",
        message: "This game has no DLC. Do you want to add it to your library?",
        confirm: "Add game"
      },
      restart: {
        title: "Restart Steam",
        message: "{details} Steam needs to restart. Restart now?",
        confirm: "Restart now",
        cancel: "Later"
      },
      remove: {
        title: "Remove from library",
        message: "Are you sure you want to remove this game from your library?"
      }
    },
    labels: {
      dlcWithId: "DLC {id}"
    },
    status: {
      preparing: "Preparing files...",
      downloading: "Downloading and scanning...",
      merging: "Merging DLC selections...",
      removing: "Removing from library...",
      success: "All done!",
      failure: "Operation failed."
    },
    mirrors: {
      title: "Choose download source",
      "default": "Public mirror (ManifestHub)",
      ryuu: "Ryuu",
      maniluaUnderConstruction: "Manilua API (in development)",
      maniluaDisabled: "",
      kernelos: "KernelOS"
    },
    auth: {
      title: "Manilua API Key",
      instructions: "Enter your Manilua API key. You can obtain it from the Manilua dashboard.",
      placeholder: "manilua_xxxxxxxxxxxxxxxxx",
      example: "Example: manilua_abc123...",
      save: "Save",
      saving: "Saving...",
      required: "API key is required.",
      invalid: "API key is invalid. Please try again.",
      validationFailed: "API key validation failed. Please verify the key and try again.",
      error: "Validation error"
    },
    backend: {
      manifestAlreadyExists: "Manifest already exists",
      manifestNotAvailablePublic: "Manifest for {name} ({appid}) is not available on the public mirrors.",
      manifestNotAvailablePublicNoName: "Manifest for {appid} is not available on the public mirrors.",
      manifestSavedNoJson: "Manifest saved to {target} (no JSON processing)",
      manifestSaved: "Manifest saved to {target}",
      couldNotDetermineAppid: "Could not determine AppID.",
      manifestNotAvailableManilua: "Manifest for {name} ({appid}) is not available via the Manilua mirror. Please check your API key.",
      manifestNotAvailableManiluaNoName: "Manifest for {appid} is not available via the Manilua mirror. Please verify your API key.",
      manifestNotFoundManilua: "Manifest for {name} ({appid}) not found on the Manilua mirror.",
      manifestNotFoundManiluaNoName: "Manifest for {appid} not found on the Manilua mirror.",
      apiKeyRejectedManilua: "API key is rejected by the Manilua mirror. Please check your API key.",
      manifestNotFoundOnMirror: "Manifest for {name} ({appid}) not found on {source} mirror.",
      couldNotDetermineAppidFromMessage: "Could not determine AppID from message.",
      maniluaRequiresApiKey: "The Manilua mirror requires a valid API key.",
      dlcAdded: "Added {count} DLC to {target}.",
      apiKeyNotConfigured: "API key not configured.",
      apiKeyRequired: "API key is required.",
      apiKeyMustStartWith: "API key must start with {prefix}.",
      apiKeyValidationFailed: "API key validation failed.",
      apiKeySaved: "API key saved.",
      unexpectedValidationResponse: "Unexpected response while validating API key.",
      apiKeyInvalid: "API key is invalid.",
      apiKeyRejected: "API key was rejected by the Manilua service.",
      validationRequestFailed: "Validation request failed with HTTP {status}.",
      validationException: "API key validation failed: {error}",
      manifestNotAvailableRyuu: "Manifest for {name} ({appid}) is not available via the Ryuu mirror.",
      manifestNotAvailableRyuuNoName: "Manifest for {appid} is not available via the Ryuu mirror.",
      manifestNotFoundRyuu: "Manifest for {name} ({appid}) not found on the Ryuu mirror.",
      manifestNotFoundRyuuNoName: "Manifest for {appid} not found on the Ryuu mirror."
    },
    compat: {
      works: "Works",
      mayNotWork: "May not work",
      needsBypass: "Needs bypass",
      drmDetected: "DRM detected (Denuvo, etc.)",
      accountRequired: "Requires third-party account",
      onlineOnly: "Online only",
      hasOnline: "Has online features"
    },
    settings: {
      title: "Settings",
      vtDescription: "Scan downloaded files for malware before installation. Get your free API key at virustotal.com",
      vtPlaceholder: "Enter VirusTotal API key...",
      vtEnabled: "Key configured",
      vtDisabled: "Key invalid",
      vtNotConfigured: "Key not set",
      vtInvalidKey: "Invalid key format (64 characters required)"
    }
  };

  var es = {
    common: {
      ok: "Aceptar",
      cancel: "Cancelar",
      removeAllDlc: "Eliminar todos los DLC",
      remove: "Quitar",
      errorWithMessage: "Error: {message}"
    },
    buttons: {
      addToLibrary: "Añadir a la biblioteca",
      editDlcLibrary: "Editar DLC en la biblioteca",
      removeFromLibrary: "Quitar de la biblioteca",
      loading: "Cargando...",
      adding: "Añadiendo...",
      removing: "Quitando..."
    },
    errors: {
      manifestMissing: "Manifiesto no disponible en los espejos públicos. Solicita acceso manual.",
      failedAddSelectedDlc: "No se pudieron añadir los DLC seleccionados.",
      failedInstallBaseGame: "No se pudo instalar el juego base.",
      failedFetchInfo: "No se pudo obtener la información del juego.",
      failedRemoveGame: "¡No se pudo quitar el juego!"
    },
    alerts: {
      addingFailedTitle: "Error al añadir",
      unableAddTitle: "No se puede añadir el juego",
      unableGetDlcTitle: "No se puede obtener la lista de DLC",
      unableRemoveTitle: "No se puede quitar",
      noDlcTitle: "No hay DLC disponibles"
    },
    messages: {
      changesApplied: "Cambios aplicados.",
      gameAdded: "¡Juego añadido correctamente!",
      gameRemoved: "¡Juego eliminado correctamente!",
      noDlcDetails: "Este juego no tiene DLC para instalar."
    },
    dialogs: {
      selectDlc: {
        title: "Selecciona los DLC que quieres añadir",
        subtitle: "Selecciona los DLC que quieras añadir. Desmarca los que no necesites.",
        selectAll: "Seleccionar todos los DLC",
        confirm: "Aplicar selección",
        alreadyAdded: "ya añadido"
      },
      baseInstall: {
        title: "Añadir a la biblioteca",
        message: "Este juego no tiene DLC. ¿Quieres añadirlo a tu biblioteca?",
        confirm: "Añadir juego"
      },
      restart: {
        title: "Reiniciar Steam",
        message: "{details} Steam necesita reiniciarse. ¿Reiniciar ahora?",
        confirm: "Reiniciar ahora",
        cancel: "Más tarde"
      },
      remove: {
        title: "Quitar de la biblioteca",
        message: "¿Seguro que quieres quitar este juego de tu biblioteca?"
      }
    },
    labels: {
      dlcWithId: "DLC {id}"
    },
    status: {
      preparing: "Preparando archivos...",
      downloading: "Descargando y escaneando...",
      merging: "Combinando seleccion de DLC...",
      removing: "Quitando de la biblioteca...",
      success: "Listo.",
      failure: "La operacion fallo."
    },
    mirrors: {
      title: "Elige la fuente de descarga",
      "default": "Espejo público (ManifestHub)",
      ryuu: "Ryuu",
      maniluaUnderConstruction: "API de Manilua (en desarrollo)",
      maniluaDisabled: "",
      kernelos: "KernelOS",
      manilua: "API de Manilua (requiere clave)"
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
      error: "Error de validacion"
    },
    backend: {
      manifestAlreadyExists: "El manifiesto ya existe",
      manifestNotAvailablePublic: "El manifiesto para {name} ({appid}) no está disponible en los espejos públicos.",
      manifestNotAvailablePublicNoName: "El manifiesto para {appid} no está disponible en los espejos públicos.",
      manifestSavedNoJson: "Manifiesto guardado en {target} (sin procesamiento JSON)",
      manifestSaved: "Manifiesto guardado en {target}",
      couldNotDetermineAppid: "No se pudo determinar el AppID.",
      manifestNotAvailableManilua: "El manifiesto para {name} ({appid}) no está disponible a través del espejo Manilua. Comprueba tu clave API.",
      manifestNotAvailableManiluaNoName: "El manifiesto para {appid} no está disponible a través del espejo Manilua. Verifica tu clave API.",
      manifestNotFoundManilua: "El manifiesto para {name} ({appid}) no se encuentra en el espejo Manilua.",
      manifestNotFoundManiluaNoName: "El manifiesto para {appid} no se encuentra en el espejo Manilua.",
      apiKeyRejectedManilua: "La clave API ha sido rechazada por el espejo Manilua. Comprueba tu clave API.",
      manifestNotFoundOnMirror: "El manifiesto para {name} ({appid}) no se encontró en el espejo {source}.",
      couldNotDetermineAppidFromMessage: "No se pudo determinar el AppID del mensaje.",
      maniluaRequiresApiKey: "El espejo Manilua requiere una clave API válida.",
      dlcAdded: "Se añadieron {count} DLC a {target}.",
      apiKeyNotConfigured: "La clave API no está configurada.",
      apiKeyRequired: "La clave API es obligatoria.",
      apiKeyMustStartWith: "La clave API debe comenzar con {prefix}.",
      apiKeyValidationFailed: "La validación de la clave API falló.",
      apiKeySaved: "Clave API guardada.",
      unexpectedValidationResponse: "Respuesta inesperada al validar la clave API.",
      apiKeyInvalid: "La clave API no es válida.",
      apiKeyRejected: "La clave API fue rechazada por el servicio Manilua.",
      validationRequestFailed: "La solicitud de validación falló con HTTP {status}.",
      validationException: "La validación de la clave API falló: {error}"
    },
    compat: {
      works: "Funciona",
      mayNotWork: "Puede no funcionar",
      needsBypass: "Necesita bypass",
      drmDetected: "DRM detectado (Denuvo, etc.)",
      accountRequired: "Requiere cuenta de terceros",
      onlineOnly: "Solo en línea",
      hasOnline: "Tiene funciones en línea"
    },
    settings: {
      title: "Configuración",
      vtDescription: "Escanear archivos descargados en busca de malware antes de la instalación. Obtén tu clave API gratuita en virustotal.com",
      vtPlaceholder: "Introduce la clave API de VirusTotal...",
      vtEnabled: "Clave introducida",
      vtDisabled: "Clave incorrecta",
      vtNotConfigured: "Clave no introducida",
      vtInvalidKey: "Formato de clave inválido (se requieren 64 caracteres)"
    }
  };

  var fr = {
    common: {
      ok: "OK",
      cancel: "Annuler",
      removeAllDlc: "Supprimer tous les DLC",
      remove: "Retirer",
      errorWithMessage: "Erreur : {message}"
    },
    buttons: {
      addToLibrary: "Ajouter à la bibliothèque",
      editDlcLibrary: "Modifier les DLC de la bibliothèque",
      removeFromLibrary: "Retirer de la bibliothèque",
      loading: "Chargement...",
      adding: "Ajout en cours...",
      removing: "Retrait en cours..."
    },
    errors: {
      manifestMissing: "Manifeste introuvable sur les miroirs publics. Demandez un accès manuel.",
      failedAddSelectedDlc: "Impossible d'ajouter les DLC sélectionnés.",
      failedInstallBaseGame: "Impossible d'installer le jeu de base.",
      failedFetchInfo: "Impossible de récupérer les informations du jeu.",
      failedRemoveGame: "Impossible de retirer le jeu !"
    },
    alerts: {
      addingFailedTitle: "Échec de l'ajout",
      unableAddTitle: "Impossible d'ajouter le jeu",
      unableGetDlcTitle: "Impossible d'obtenir la liste des DLC",
      unableRemoveTitle: "Impossible de retirer",
      noDlcTitle: "Aucun DLC disponible"
    },
    messages: {
      changesApplied: "Modifications appliquées.",
      gameAdded: "Jeu ajouté avec succès !",
      gameRemoved: "Jeu retiré avec succès !",
      noDlcDetails: "Ce jeu n'a pas de DLC à installer."
    },
    dialogs: {
      selectDlc: {
        title: "Sélectionner les DLC à ajouter",
        subtitle: "Sélectionnez les DLC à ajouter. Décochez ceux que vous ne voulez pas.",
        selectAll: "Tout sélectionner",
        confirm: "Appliquer la sélection",
        alreadyAdded: "déjà ajouté"
      },
      baseInstall: {
        title: "Ajouter à la bibliothèque",
        message: "Ce jeu n'a aucun DLC. Voulez-vous l'ajouter à votre bibliothèque ?",
        confirm: "Ajouter le jeu"
      },
      restart: {
        title: "Redémarrer Steam",
        message: "{details} Steam doit redémarrer. Redémarrer maintenant ?",
        confirm: "Redémarrer maintenant",
        cancel: "Plus tard"
      },
      remove: {
        title: "Retirer de la bibliothèque",
        message: "Êtes-vous sûr de vouloir retirer ce jeu de votre bibliothèque ?"
      }
    },
    labels: {
      dlcWithId: "DLC {id}"
    },
    status: {
      preparing: "Preparation des fichiers...",
      downloading: "Téléchargement et analyse...",
      merging: "Fusion des selections de DLC...",
      removing: "Retrait de la bibliotheque...",
      success: "Termine !",
      failure: "L'operation a echoue."
    },
    mirrors: {
      title: "Choisissez la source de telechargement",
      "default": "Miroir public (ManifestHub)",
      ryuu: "Ryuu",
      maniluaUnderConstruction: "API Manilua (en cours de developpement)",
      maniluaDisabled: "",
      kernelos: "KernelOS",
      manilua: "API Manilua (cle requise)"
    },
    auth: {
      title: "Cle API Manilua",
      instructions: "Saisissez votre cle API Manilua. Vous pouvez l'obtenir depuis le tableau de bord Manilua.",
      placeholder: "manilua_xxxxxxxxxxxxxxxxx",
      example: "Exemple : manilua_abc123...",
      save: "Enregistrer",
      saving: "Enregistrement...",
      required: "La cle est obligatoire.",
      invalid: "Cle invalide. Veuillez reessayer.",
      validationFailed: "La validation de la cle a echoue. Verifiez la cle et reessayez.",
      error: "Erreur de validation"
    },
    backend: {
      manifestAlreadyExists: "Le manifeste existe déjà",
      manifestNotAvailablePublic: "Le manifeste pour {name} ({appid}) n'est pas disponible sur les miroirs publics.",
      manifestNotAvailablePublicNoName: "Le manifeste pour {appid} n'est pas disponible sur les miroirs publics.",
      manifestSavedNoJson: "Manifeste enregistré dans {target} (sans traitement JSON)",
      manifestSaved: "Manifeste enregistré dans {target}",
      couldNotDetermineAppid: "Impossible de déterminer l'AppID.",
      manifestNotAvailableManilua: "Le manifeste pour {name} ({appid}) n'est pas disponible via le miroir Manilua. Vérifiez votre clé API.",
      manifestNotAvailableManiluaNoName: "Le manifeste pour {appid} n'est pas disponible via le miroir Manilua. Vérifiez votre clé API.",
      manifestNotFoundManilua: "Le manifeste pour {name} ({appid}) est introuvable sur le miroir Manilua.",
      manifestNotFoundManiluaNoName: "Le manifeste pour {appid} est introuvable sur le miroir Manilua.",
      apiKeyRejectedManilua: "La clé API a été rejetée par le miroir Manilua. Vérifiez votre clé API.",
      manifestNotFoundOnMirror: "Le manifeste pour {name} ({appid}) introuvable sur le miroir {source}.",
      couldNotDetermineAppidFromMessage: "Impossible de déterminer l'AppID du message.",
      maniluaRequiresApiKey: "Le miroir Manilua nécessite une clé API valide.",
      dlcAdded: "{count} DLC ajoutés à {target}.",
      apiKeyNotConfigured: "La clé API n'est pas configurée.",
      apiKeyRequired: "La clé API est obligatoire.",
      apiKeyMustStartWith: "La clé API doit commencer par {prefix}.",
      apiKeyValidationFailed: "La validation de la clé API a échoué.",
      apiKeySaved: "Clé API enregistrée.",
      unexpectedValidationResponse: "Réponse inattendue lors de la validation de la clé API.",
      apiKeyInvalid: "La clé API n'est pas valide.",
      apiKeyRejected: "La clé API a été rejetée par le service Manilua.",
      validationRequestFailed: "La demande de validation a échoué avec HTTP {status}.",
      validationException: "La validation de la clé API a échoué : {error}"
    },
    compat: {
      works: "Fonctionne",
      mayNotWork: "Peut ne pas fonctionner",
      needsBypass: "Contournement nécessaire",
      drmDetected: "DRM détecté (Denuvo, etc.)",
      accountRequired: "Compte tiers requis",
      onlineOnly: "En ligne uniquement",
      hasOnline: "Fonctionnalités en ligne"
    },
    settings: {
      title: "Paramètres",
      vtDescription: "Analyser les fichiers téléchargés pour détecter les malwares avant installation. Obtenez votre clé API gratuite sur virustotal.com",
      vtPlaceholder: "Entrez la clé API VirusTotal...",
      vtEnabled: "Clé saisie",
      vtDisabled: "Clé incorrecte",
      vtNotConfigured: "Clé non saisie",
      vtInvalidKey: "Format de clé invalide (64 caractères requis)"
    }
  };

  var ptBR = {
    common: {
      ok: "OK",
      cancel: "Cancelar",
      removeAllDlc: "Remover todos os DLC",
      remove: "Remover",
      errorWithMessage: "Erro: {message}"
    },
    buttons: {
      addToLibrary: "Adicionar à biblioteca",
      editDlcLibrary: "Editar biblioteca de DLC",
      removeFromLibrary: "Remover da biblioteca",
      loading: "Carregando...",
      adding: "Adicionando...",
      removing: "Removendo..."
    },
    errors: {
      manifestMissing: "Manifesto indisponível nos espelhos públicos. Solicite acesso manual.",
      failedAddSelectedDlc: "Não foi possível adicionar os DLC selecionados.",
      failedInstallBaseGame: "Não foi possível instalar o jogo base.",
      failedFetchInfo: "Não foi possível obter as informações do jogo.",
      failedRemoveGame: "Não foi possível remover o jogo!"
    },
    alerts: {
      addingFailedTitle: "Falha ao adicionar",
      unableAddTitle: "Não foi possível adicionar o jogo",
      unableGetDlcTitle: "Não foi possível obter a lista de DLC",
      unableRemoveTitle: "Não foi possível remover",
      noDlcTitle: "Nenhum DLC disponível"
    },
    messages: {
      changesApplied: "Alterações aplicadas.",
      gameAdded: "Jogo adicionado com sucesso!",
      gameRemoved: "Jogo removido com sucesso!",
      noDlcDetails: "Este jogo não possui DLC para instalar."
    },
    dialogs: {
      selectDlc: {
        title: "Selecione os DLC para adicionar",
        subtitle: "Selecione os DLC que deseja adicionar. Desmarque os que não quiser.",
        selectAll: "Selecionar todos os DLC",
        confirm: "Aplicar seleção",
        alreadyAdded: "já adicionado"
      },
      baseInstall: {
        title: "Adicionar à biblioteca",
        message: "Este jogo não possui DLC. Deseja adicioná-lo à sua biblioteca?",
        confirm: "Adicionar jogo"
      },
      restart: {
        title: "Reiniciar Steam",
        message: "{details} A Steam precisa reiniciar. Reiniciar agora?",
        confirm: "Reiniciar agora",
        cancel: "Depois"
      },
      remove: {
        title: "Remover da biblioteca",
        message: "Tem certeza de que deseja remover este jogo da sua biblioteca?"
      }
    },
    labels: {
      dlcWithId: "DLC {id}"
    },
    status: {
      preparing: "Preparando arquivos...",
      downloading: "Baixando e verificando...",
      merging: "Mesclando selecao de DLC...",
      removing: "Removendo da biblioteca...",
      success: "Concluido!",
      failure: "A operacao falhou."
    },
    mirrors: {
      title: "Escolha a fonte de download",
      "default": "Espelho público (ManifestHub)",
      ryuu: "Ryuu",
      maniluaUnderConstruction: "API Manilua (em desenvolvimento)",
      maniluaDisabled: "",
      kernelos: "KernelOS",
      manilua: "API Manilua (requer chave)"
    },
    auth: {
      title: "Chave da API Manilua",
      instructions: "Informe sua chave da API Manilua. Voce pode obtela no painel do Manilua.",
      placeholder: "manilua_xxxxxxxxxxxxxxxxx",
      example: "Exemplo: manilua_abc123...",
      save: "Salvar",
      saving: "Salvando...",
      required: "A chave e obrigatoria.",
      invalid: "Chave invalida. Tente novamente.",
      validationFailed: "Falha na validacao da chave. Verifique a chave e tente novamente.",
      error: "Erro de validacao"
    },
    backend: {
      manifestAlreadyExists: "O manifesto já existe",
      manifestNotAvailablePublic: "O manifesto para {name} ({appid}) não está disponível nos espelhos públicos.",
      manifestNotAvailablePublicNoName: "O manifesto para {appid} não está disponível nos espelhos públicos.",
      manifestSavedNoJson: "Manifesto salvo em {target} (sem processamento JSON)",
      manifestSaved: "Manifesto salvo em {target}",
      couldNotDetermineAppid: "Não foi possível determinar o AppID.",
      manifestNotAvailableManilua: "O manifesto para {name} ({appid}) não está disponível através do espelho Manilua. Verifique sua chave API.",
      manifestNotAvailableManiluaNoName: "O manifesto para {appid} não está disponível através do espelho Manilua. Verifique sua chave API.",
      manifestNotFoundManilua: "O manifesto para {name} ({appid}) não foi encontrado no espelho Manilua.",
      manifestNotFoundManiluaNoName: "O manifesto para {appid} não foi encontrado no espelho Manilua.",
      apiKeyRejectedManilua: "A chave API foi rejeitada pelo espelho Manilua. Verifique sua chave API.",
      manifestNotFoundOnMirror: "O manifesto para {name} ({appid}) não foi encontrado no espelho {source}.",
      couldNotDetermineAppidFromMessage: "Não foi possível determinar o AppID da mensagem.",
      maniluaRequiresApiKey: "O espelho Manilua requer uma chave API válida.",
      dlcAdded: "{count} DLC adicionados a {target}.",
      apiKeyNotConfigured: "A chave API não está configurada.",
      apiKeyRequired: "A chave API é obrigatória.",
      apiKeyMustStartWith: "A chave API deve começar com {prefix}.",
      apiKeyValidationFailed: "A validação da chave API falhou.",
      apiKeySaved: "Chave API salva.",
      unexpectedValidationResponse: "Resposta inesperada ao validar a chave API.",
      apiKeyInvalid: "A chave API não é válida.",
      apiKeyRejected: "A chave API foi rejeitada pelo serviço Manilua.",
      validationRequestFailed: "A solicitação de validação falhou com HTTP {status}.",
      validationException: "A validação da chave API falhou: {error}"
    },
    compat: {
      works: "Funciona",
      mayNotWork: "Pode não funcionar",
      needsBypass: "Precisa de bypass",
      drmDetected: "DRM detectado (Denuvo, etc.)",
      accountRequired: "Requer conta de terceiros",
      onlineOnly: "Apenas online",
      hasOnline: "Tem recursos online"
    },
    settings: {
      title: "Configurações",
      vtDescription: "Verificar arquivos baixados em busca de malware antes da instalação. Obtenha sua chave API gratuita em virustotal.com",
      vtPlaceholder: "Digite a chave API do VirusTotal...",
      vtEnabled: "Chave inserida",
      vtDisabled: "Chave incorreta",
      vtNotConfigured: "Chave não inserida",
      vtInvalidKey: "Formato de chave inválido (64 caracteres necessários)"
    }
  };

  var uk = {
    common: {
      ok: "OK",
      cancel: "Скасувати",
      save: "Зберегти",
      saving: "Збереження...",
      removeAllDlc: "Видалити всі DLC",
      remove: "Видалити",
      errorWithMessage: "Помилка: {message}"
    },
    buttons: {
      addToLibrary: "Додати до бібліотеки",
      editDlcLibrary: "Редагувати DLC у бібліотеці",
      removeFromLibrary: "Видалити з бібліотеки",
      loading: "Завантаження...",
      adding: "Додавання...",
      removing: "Видалення..."
    },
    errors: {
      manifestMissing: "Маніфест недоступний на публічних дзеркалах. Запросіть доступ вручну.",
      failedAddSelectedDlc: "Не вдалося додати обрані DLC.",
      failedInstallBaseGame: "Не вдалося встановити базову гру.",
      failedFetchInfo: "Не вдалося отримати інформацію про гру.",
      failedRemoveGame: "Не вдалося видалити гру!"
    },
    alerts: {
      addingFailedTitle: "Помилка додавання",
      unableAddTitle: "Неможливо додати гру",
      unableGetDlcTitle: "Неможливо отримати список DLC",
      unableRemoveTitle: "Неможливо видалити",
      noDlcTitle: "Немає доступних DLC"
    },
    messages: {
      changesApplied: "Зміни застосовано.",
      gameAdded: "Гру успішно додано!",
      gameRemoved: "Гру успішно видалено!",
      noDlcDetails: "Ця гра не має DLC для встановлення."
    },
    dialogs: {
      selectDlc: {
        title: "Оберіть DLC для додавання",
        subtitle: "Оберіть DLC, які хочете додати. Зніміть позначки з непотрібних.",
        selectAll: "Вибрати всі DLC",
        confirm: "Застосувати вибір",
        alreadyAdded: "вже додано"
      },
      baseInstall: {
        title: "Додати до бібліотеки",
        message: "У цієї гри немає DLC. Додати її до вашої бібліотеки?",
        confirm: "Додати гру"
      },
      restart: {
        title: "Перезапустити Steam",
        message: "{details} Потрібно перезапустити Steam. Зробити це зараз?",
        confirm: "Перезапустити",
        cancel: "Пізніше"
      },
      remove: {
        title: "Видалити з бібліотеки",
        message: "Ви впевнені, що хочете видалити цю гру з бібліотеки?"
      }
    },
    labels: {
      dlcWithId: "DLC {id}"
    },
    status: {
      preparing: "Підготовка файлів...",
      downloading: "Завантаження та перевірка...",
      merging: "Застосування обраних DLC...",
      removing: "Видалення з бібліотеки...",
      success: "Готово!",
      failure: "Операція не вдалася."
    },
    mirrors: {
      title: "Оберіть джерело завантаження",
      "default": "Публічне дзеркало (ManifestHub)",
      ryuu: "Ryuu",
      maniluaUnderConstruction: "API Manilua (у розробці)",
      maniluaDisabled: "",
      kernelos: "KernelOS",
      manilua: "API Manilua (потрібен ключ)"
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
      error: "Помилка перевірки"
    },
    backend: {
      manifestAlreadyExists: "Маніфест вже існує",
      manifestNotAvailablePublic: "Маніфест для {name} ({appid}) недоступний на публічних дзеркалах.",
      manifestNotAvailablePublicNoName: "Маніфест для {appid} недоступний на публічних дзеркалах.",
      manifestSavedNoJson: "Маніфест збережено в {target} (без обробки JSON)",
      manifestSaved: "Маніфест збережено в {target}",
      couldNotDetermineAppid: "Не вдалося визначити AppID.",
      manifestNotAvailableManilua: "Маніфест для {name} ({appid}) недоступний через дзеркало Manilua. Перевірте свій API-ключ.",
      manifestNotAvailableManiluaNoName: "Маніфест для {appid} недоступний через дзеркало Manilua. Перевірте свій API-ключ.",
      manifestNotFoundManilua: "Маніфест для {name} ({appid}) не знайдено на дзеркалі Manilua.",
      manifestNotFoundManiluaNoName: "Маніфест для {appid} не знайдено на дзеркалі Manilua.",
      apiKeyRejectedManilua: "Ключ API відхилено дзеркалом Manilua. Перевірте свій API-ключ.",
      manifestNotFoundOnMirror: "Маніфест для {name} ({appid}) не знайдено на дзеркалі {source}.",
      couldNotDetermineAppidFromMessage: "Не вдалося визначити AppID з повідомлення.",
      maniluaRequiresApiKey: "Дзеркало Manilua потребує дійсний API-ключ.",
      dlcAdded: "Додано {count} DLC до {target}.",
      apiKeyNotConfigured: "API-ключ не налаштовано.",
      apiKeyRequired: "Необхідно вказати API-ключ.",
      apiKeyMustStartWith: "API-ключ має починатися з {prefix}.",
      apiKeyValidationFailed: "Перевірка API-ключа не вдалася.",
      apiKeySaved: "API-ключ збережено.",
      unexpectedValidationResponse: "Неочікувана відповідь при перевірці API-ключа.",
      apiKeyInvalid: "API-ключ недійсний.",
      apiKeyRejected: "API-ключ відхилено сервісом Manilua.",
      validationRequestFailed: "Запит перевірки не вдався з HTTP {status}.",
      validationException: "Перевірка API-ключа не вдалася: {error}",
      manifestNotAvailableRyuu: "Маніфест для {name} ({appid}) недоступний через дзеркало Ryuu.",
      manifestNotAvailableRyuuNoName: "Маніфест для {appid} недоступний через дзеркало Ryuu.",
      manifestNotFoundRyuu: "Маніфест для {name} ({appid}) не знайдено на дзеркалі Ryuu.",
      manifestNotFoundRyuuNoName: "Маніфест для {appid} не знайдено на дзеркалі Ryuu."
    },
    compat: {
      works: "Працює",
      mayNotWork: "Може не працювати",
      needsBypass: "Потрібен обхід",
      drmDetected: "Виявлено DRM (Denuvo та ін.)",
      accountRequired: "Потрібен сторонній акаунт",
      onlineOnly: "Тільки онлайн",
      hasOnline: "Є онлайн-функції"
    },
    settings: {
      title: "Налаштування",
      vtDescription: "Перевіряти завантажені файли на віруси перед встановленням. Отримайте безкоштовний API-ключ на virustotal.com",
      vtPlaceholder: "Введіть API-ключ VirusTotal...",
      vtEnabled: "Ключ введено",
      vtDisabled: "Ключ невірний",
      vtNotConfigured: "Ключ не введено",
      vtInvalidKey: "Невірний формат ключа (потрібно 64 символи)"
    }
  };

  var FALLBACK_LOCALE = "en";
  var STATIC_TRANSLATIONS = {
    en: en,
    es: es,
    fr: fr,
    "pt-BR": ptBR,
    uk: uk
  };
  function normaliseLocale(locale) {
    if (!locale || typeof locale !== "string") {
      return FALLBACK_LOCALE;
    }
    var trimmed = locale.trim();
    if (!trimmed) {
      return FALLBACK_LOCALE;
    }
    var lower = trimmed.toLowerCase();
    if (lower === "pt-br" || lower === "pt_br") return "pt-BR";
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("fr")) return "fr";
    if (lower === "ua" || lower.startsWith("uk")) return "uk";
    if (lower === "ukrainian") return "uk";
    var base = lower.split(/[-_]/)[0];
    var matched = Object.keys(STATIC_TRANSLATIONS).find(function (code) {
      return code.toLowerCase() === base;
    });
    return matched !== null && matched !== void 0 ? matched : FALLBACK_LOCALE;
  }
  var I18n = /*#__PURE__*/function () {
    function I18n() {
      _classCallCheck(this, I18n);
      this.translations = new Map();
      this.currentLocale = FALLBACK_LOCALE;
      this.initialised = false;
      this.initPromise = null;
    }
    return _createClass(I18n, [{
      key: "init",
      value: function () {
        var _init = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
          return _regenerator().w(function (_context) {
            while (1) switch (_context.n) {
              case 0:
                if (!this.initialised) {
                  _context.n = 1;
                  break;
                }
                return _context.a(2);
              case 1:
                if (!this.initPromise) {
                  this.initPromise = this.bootstrap();
                }
                _context.n = 2;
                return this.initPromise;
              case 2:
                this.initialised = true;
              case 3:
                return _context.a(2);
            }
          }, _callee, this);
        }));
        function init() {
          return _init.apply(this, arguments);
        }
        return init;
      }()
    }, {
      key: "t",
      value: function t(key, vars) {
        var _ref, _this$lookup;
        var resolved = (_ref = (_this$lookup = this.lookup(this.currentLocale, key)) !== null && _this$lookup !== void 0 ? _this$lookup : this.lookup(FALLBACK_LOCALE, key)) !== null && _ref !== void 0 ? _ref : key;
        if (typeof resolved !== "string") {
          return key;
        }
        if (!vars) {
          return resolved;
        }
        return resolved.replace(/\{(.*?)\}/g, function (_, token) {
          var value = vars[token.trim()];
          return value === undefined || value === null ? "" : String(value);
        });
      }
    }, {
      key: "bootstrap",
      value: function () {
        var _bootstrap = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
          var preferred;
          return _regenerator().w(function (_context2) {
            while (1) switch (_context2.n) {
              case 0:
                preferred = normaliseLocale(this.detectPreferredLocale());
                this.loadLocale(preferred);
                if (!(!this.translations.has(preferred) && preferred !== FALLBACK_LOCALE)) {
                  _context2.n = 1;
                  break;
                }
                this.loadLocale(FALLBACK_LOCALE);
                this.currentLocale = FALLBACK_LOCALE;
                return _context2.a(2);
              case 1:
                this.currentLocale = preferred;
              case 2:
                return _context2.a(2);
            }
          }, _callee2, this);
        }));
        function bootstrap() {
          return _bootstrap.apply(this, arguments);
        }
        return bootstrap;
      }()
    }, {
      key: "detectPreferredLocale",
      value: function detectPreferredLocale() {
        var candidates = [];
        if (typeof window !== "undefined") {
          var _window, _window2, _window3, _window3$GetSteamUILa;
          var steamLanguage = ((_window = window) === null || _window === void 0 ? void 0 : _window.g_strLanguage) || ((_window2 = window) === null || _window2 === void 0 || (_window2 = _window2.LocalizationManager) === null || _window2 === void 0 ? void 0 : _window2.m_strLanguage) || ((_window3 = window) === null || _window3 === void 0 || (_window3 = _window3.SteamClient) === null || _window3 === void 0 || (_window3 = _window3.System) === null || _window3 === void 0 || (_window3$GetSteamUILa = _window3.GetSteamUILanguage) === null || _window3$GetSteamUILa === void 0 ? void 0 : _window3$GetSteamUILa.call(_window3));
          if (steamLanguage) {
            candidates.push(steamLanguage);
          }
        }
        if (typeof navigator !== "undefined") {
          if (Array.isArray(navigator.languages)) {
            candidates.push.apply(candidates, _toConsumableArray(navigator.languages));
          }
          if (navigator.language) {
            candidates.push(navigator.language);
          }
          if (navigator.userLanguage) {
            candidates.push(navigator.userLanguage);
          }
        }
        var found = candidates.find(function (locale) {
          var normalised = normaliseLocale(locale);
          return normalised !== FALLBACK_LOCALE || locale === FALLBACK_LOCALE;
        });
        return found !== null && found !== void 0 ? found : FALLBACK_LOCALE;
      }
    }, {
      key: "loadLocale",
      value: function loadLocale(locale) {
        if (this.translations.has(locale)) {
          return;
        }
        var data = STATIC_TRANSLATIONS[locale];
        if (data) {
          this.translations.set(locale, data);
        }
      }
    }, {
      key: "lookup",
      value: function lookup(locale, key) {
        var translations = this.translations.get(locale);
        if (!translations) {
          return undefined;
        }
        return key.split(".").reduce(function (value, segment) {
          if (value && _typeof(value) === "object" && !Array.isArray(value)) {
            return value[segment];
          }
          return undefined;
        }, translations);
      }
    }]);
  }();
  var i18nInstance = new I18n();
  function initI18n() {
    return _initI18n.apply(this, arguments);
  }
  function _initI18n() {
    _initI18n = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            _context3.n = 1;
            return i18nInstance.init();
          case 1:
            return _context3.a(2);
        }
      }, _callee3);
    }));
    return _initI18n.apply(this, arguments);
  }
  function t(key, vars) {
    return i18nInstance.t(key, vars);
  }

  let currentMirror = null;
  const getDlcListRpc = __wrapped_callable__('Backend.get_dlc_list');
  const installDlcsRpc = __wrapped_callable__('Backend.install_dlcs');
  const deletegame = __wrapped_callable__('Backend.delete_lua');
  const checkPirated = __wrapped_callable__('Backend.checkpirated');
  const restartt = __wrapped_callable__('Backend.restart');
  const setManiluaApiKeyRpc = __wrapped_callable__('Backend.set_manilua_api_key');
  const getManiluaApiStatusRpc = __wrapped_callable__('Backend.get_manilua_api_status');
  const setVtApiKeyRpc = __wrapped_callable__('Backend.set_vt_api_key');
  const getVtApiStatusRpc = __wrapped_callable__('Backend.get_vt_api_status');
  let isBusy = false;
  const apiState = {
      hasKey: false,
      isValid: false,
      maskedKey: '',
      checked: false,
  };
  const COMPAT_BADGE_ID = 'steam-app-inserter-compat-badge';
  const DRM_TERMS = [
      // Brand names (universal)
      'denuvo', 'securom', 'secucrom', 'arxan', 'vmprotect',
      // English
      'requires 3rd-party drm', 'third-party drm', '3rd-party drm',
      // German
      'drittanbieter-drm',
      // French
      'drm tiers', 'gestion des droits numériques tiers',
      // Spanish
      'drm de terceros',
      // Italian
      'drm di terze parti',
      // Portuguese
      'drm de terceiros',
      // Polish
      'drm innego producenta', 'system drm innego producenta',
      // Ukrainian
      'стороння система захисту', 'drm стороннього виробника',
      // Japanese
      'サードパーティーのdrm',
      // Korean
      '타사 drm',
      // Chinese
      '第三方 drm', '第三方drm'
  ];
  const ACCOUNT_TERMS = [
      // Brand names (universal) - these don't change across languages
      'ea account', 'ea app', 'ea play', 'ubisoft connect', 'uplay',
      'rockstar social club', 'rockstar games launcher', 'battle.net',
      'bethesda.net', '2k account', 'epic account', 'riot account',
      // English
      'requires 3rd-party account', '3rd-party account', 'third-party account',
      // German
      'drittanbieteraccount', 'drittanbieter-account', 'konto eines drittanbieters',
      // French
      'compte tiers', 'nécessite un compte tiers',
      // Spanish
      'cuenta de terceros', 'requiere cuenta de terceros',
      // Italian
      'account di terze parti',
      // Portuguese
      'conta de terceiros',
      // Polish
      'konto na platformie firmy zewnętrznej', 'konto firmy trzeciej',
      // Ukrainian
      'обліковий запис сторонньої компанії', 'сторонній обліковий запис',
      // Japanese
      'サードパーティーのアカウント',
      // Korean
      '타사 계정',
      // Chinese
      '第三方帐户', '第三方账户'
  ];
  const ensureCompatStyles = () => {
      if (document.getElementById('steam-app-inserter-compat-css'))
          return;
      const style = document.createElement('style');
      style.id = 'steam-app-inserter-compat-css';
      style.textContent = `
        .sai-compat-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            line-height: 16px;
            padding: 4px 12px;
            border-radius: 3px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.15);
            user-select: none;
            cursor: help;
            margin-right: 6px;
            font-family: "Motiva Sans", Arial, sans-serif;
            position: relative;
        }
        .sai-compat-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .sai-compat-text {
            color: #c6d4df;
        }
        .sai-compat-tooltip {
            position: absolute !important;
            top: calc(100% + 8px) !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: #171a21 !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 4px !important;
            padding: 10px 14px !important;
            min-width: 200px !important;
            max-width: 320px !important;
            width: max-content !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            z-index: 10000 !important;
            pointer-events: none;
            white-space: normal !important;
            word-wrap: break-word !important;
            text-align: left !important;
            display: block !important;
        }
        .sai-compat-badge:hover .sai-compat-tooltip {
            opacity: 1;
            visibility: visible;
        }
        .sai-compat-tooltip::after {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-bottom-color: #171a21;
        }
        .sai-compat-tooltip-title {
            font-size: 13px !important;
            font-weight: 500 !important;
            color: #ffffff !important;
            display: block !important;
            white-space: normal !important;
        }
        .sai-compat-tooltip-title.has-items {
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .sai-compat-tooltip-item {
            font-size: 12px !important;
            color: #acb2b8 !important;
            line-height: 1.5 !important;
            padding: 3px 0 !important;
            display: flex !important;
            align-items: flex-start !important;
            gap: 8px !important;
            white-space: normal !important;
            overflow: visible !important;
            height: auto !important;
        }
        .sai-compat-tooltip-item::before {
            content: '•';
            color: #67707b;
            flex-shrink: 0;
        }
    `;
      document.head.appendChild(style);
  };
  // Exact copy of kernelua normalization
  const norm = (s) => {
      try {
          return (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      }
      catch {
          return (s || '').toString().toLowerCase();
      }
  };
  const uniqueNormList = (list) => {
      const out = [];
      const seen = new Set();
      for (const x of list) {
          const n = norm(x).trim();
          if (!n)
              continue;
          if (!seen.has(n)) {
              seen.add(n);
              out.push(n);
          }
      }
      return out;
  };
  // Exact copy of kernelua collection (with same selectors)
  const kerneluaCollectStructured = () => {
      const tagNodes = document.querySelectorAll('.glance_tags .app_tag, .popular_tags .app_tag, #category_block a, #category_block .label');
      const specNodes = document.querySelectorAll('.game_area_details_specs a, .game_area_details_specs li, .game_area_features_list li');
      const noticeNodes = document.querySelectorAll('.DRM_notice, .game_meta_data, .glance_ctn, .game_area_purchase');
      const tags = uniqueNormList(Array.from(tagNodes).map(n => n.textContent || ''));
      const specs = uniqueNormList(Array.from(specNodes).map(n => n.textContent || ''));
      const noticesText = norm(Array.from(noticeNodes).map(n => n.textContent || '').join(' \n '));
      return { tags, specs, noticesText };
  };
  // Analysis with debug output
  const analyzeCompatibility = () => {
      const { tags, specs, noticesText } = kerneluaCollectStructured();
      const ONLINE = [
          // English (en)
          'online pvp', 'online co-op', 'co-op online', 'multiplayer online',
          'massively multiplayer', 'mmo', 'mmorpg', 'cross-platform multiplayer',
          'crossplay', 'cross-play', 'requires internet connection', 'always online',
          'live service', 'games as a service', 'pvp', 'multiplayer',
          // Ukrainian (uk)
          'багатокористувацька', 'гравець проти гравця', 'гравець проти оточення',
          'мережева гра', 'кооператив',
          // German (de)
          'online-koop', 'mehrspieler', 'plattformübergreifender mehrspieler', 'koop',
          // French (fr)
          'coop en ligne', 'multijoueur', 'jcj',
          // Spanish (es, es-419)
          'cooperativos en línea', 'cooperativo en línea', 'multijugador',
          // Italian (it)
          'co-op online', 'multigiocatore',
          // Portuguese Brazilian (pt-BR)
          'cooperativo on-line', 'multijogador', 'jogador x jogador',
          // Portuguese European (pt)
          'co-op online', 'baseado em equipas',
          // Polish (pl)
          'sieciowa kooperacja', 'kooperacja', 'wieloosobowe', 'wieloosobowa',
          // Turkish (tr)
          'çok oyunculu', 'çevrimiçi eşli oyun', 'eşli',
          // Czech (cs)
          'pro více hráčů', 'online kooperativní', 'kooperativní',
          // Hungarian (hu)
          'többjátékos', 'online együttműködő', 'együttműködő',
          // Dutch (nl)
          'onlineco-op',
          // Danish (da)
          'online co-op', 'holdbaseret',
          // Swedish (sv)
          'co-op online', 'lagbaserat',
          // Finnish (fi)
          'moninpeli', 'verkkoyhteistyöpeli', 'yhteistyö',
          // Norwegian (no)
          'flerspiller', 'samarbeid på nett', 'samarbeid', 'lagbasert',
          // Romanian (ro)
          'mai mulți jucători', 'cooperativ online', 'cooperativ',
          // Bulgarian (bg)
          'мрежови', 'кооперативни на линия', 'кооперативни', 'играч срещу играч',
          // Greek (el)
          'πολλών παικτών', 'διαδικτυακό συνεργατικό', 'συνεργατικό',
          // Arabic (ar)
          'اللعب الجماعي', 'تعاون عبر الإنترنت', 'تعاون', 'لاعب ضد لاعب',
          // Thai (th)
          'ผู้เล่นหลายคน', 'เล่นแบบร่วมมือกันออนไลน์', 'เล่นแบบร่วมมือกัน',
          // Vietnamese (vi)
          'chơi nhiều người', 'phối hợp trên mạng', 'phối hợp',
          // Japanese (ja)
          'マルチプレイヤー', 'オンライン協力プレイ', '協力プレイ', '対戦',
          'クロスプラットフォームマルチプレイヤー',
          // Korean (ko)
          '멀티플레이어', '온라인 협동', '협동', '크로스 플랫폼 멀티플레이어',
          // Simplified Chinese (zh-CN)
          '多人', '在线合作', '玩家对战', '跨平台多人',
          // Traditional Chinese (zh-TW)
          '線上合作', '玩家對戰', '跨平台多人'
      ];
      const inList = (list, terms) => list.some(x => terms.some(t => x.includes(t)));
      const hasOnline = inList(tags, ONLINE) || inList(specs, ONLINE);
      const hasDrm = DRM_TERMS.some(t => noticesText.includes(t));
      const hasAccount = ACCOUNT_TERMS.some(t => noticesText.includes(t)) ||
          inList(tags, ACCOUNT_TERMS) || inList(specs, ACCOUNT_TERMS);
      let level = 'ok';
      const reasons = [];
      if (hasDrm) {
          level = 'bad';
          reasons.push(t('compat.drmDetected'));
      }
      if (hasAccount) {
          if (level !== 'bad')
              level = 'warn';
          reasons.push(t('compat.accountRequired'));
      }
      if (hasOnline) {
          if (level !== 'bad')
              level = 'warn';
          reasons.push(t('compat.hasOnline'));
      }
      const labels = {
          ok: t('compat.works'),
          warn: t('compat.mayNotWork'),
          bad: t('compat.needsBypass')
      };
      const colors = {
          ok: '#5c7e10',
          warn: '#a0790b',
          bad: '#a0352c'
      };
      return {
          level,
          label: labels[level],
          color: colors[level],
          reasons
      };
  };
  const renderCompatBadge = (container) => {
      document.getElementById(COMPAT_BADGE_ID)?.remove();
      ensureCompatStyles();
      const info = analyzeCompatibility();
      const badge = document.createElement('div');
      badge.id = COMPAT_BADGE_ID;
      badge.className = 'sai-compat-badge';
      const dot = document.createElement('span');
      dot.className = 'sai-compat-dot';
      dot.style.background = info.color;
      const text = document.createElement('span');
      text.className = 'sai-compat-text';
      text.textContent = info.label;
      // Custom tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'sai-compat-tooltip';
      const tooltipTitle = document.createElement('div');
      tooltipTitle.className = 'sai-compat-tooltip-title' + (info.reasons.length > 0 ? ' has-items' : '');
      tooltipTitle.textContent = info.label;
      tooltip.appendChild(tooltipTitle);
      if (info.reasons.length > 0) {
          info.reasons.forEach(reason => {
              const item = document.createElement('div');
              item.className = 'sai-compat-tooltip-item';
              item.textContent = reason;
              tooltip.appendChild(item);
          });
      }
      badge.appendChild(dot);
      badge.appendChild(text);
      badge.appendChild(tooltip);
      // Insert at the beginning of container
      container.insertBefore(badge, container.firstChild);
  };
  const createDialogButton = (label, variant = 'primary') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = variant === 'primary' ? 'btnv6_blue_hoverfade btn_medium' : 'btnv6_lightblue_blue btn_medium';
      button.textContent = label;
      button.style.display = 'inline-flex';
      button.style.justifyContent = 'center';
      button.style.alignItems = 'center';
      button.style.minWidth = '170px';
      button.style.padding = '0 28px';
      button.style.minHeight = '32px';
      button.style.boxSizing = 'border-box';
      return button;
  };
  const wait = (ms) => new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, ms));
  });
  const createDialogShell = (title, subtitle) => {
      if (!document.body) {
          throw new Error('Document body not ready for dialog rendering.');
      }
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0, 0, 0, 0.65)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'flex-start';
      overlay.style.justifyContent = 'center';
      overlay.style.paddingTop = '8vh';
      const dialog = document.createElement('div');
      dialog.style.background = '#171a21';
      dialog.style.color = '#ffffff';
      dialog.style.padding = '24px';
      dialog.style.borderRadius = '8px';
      dialog.style.maxWidth = '520px';
      dialog.style.width = 'calc(100% - 48px)';
      dialog.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.45)';
      dialog.style.fontFamily = '"Motiva Sans", Arial, sans-serif';
      dialog.style.outline = 'none';
      dialog.tabIndex = -1;
      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.margin = '0 0 8px 0';
      dialog.appendChild(titleEl);
      if (subtitle) {
          const subtitleEl = document.createElement('p');
          subtitleEl.textContent = subtitle;
          subtitleEl.style.marginTop = '0';
          subtitleEl.style.fontSize = '14px';
          subtitleEl.style.opacity = '0.85';
          dialog.appendChild(subtitleEl);
      }
      const content = document.createElement('div');
      content.style.margin = '16px 0';
      dialog.appendChild(content);
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '12px';
      actions.style.marginTop = '16px';
      actions.style.paddingTop = '16px';
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const stopPropagation = (event) => event.stopPropagation();
      dialog.addEventListener('click', stopPropagation);
      let closed = false;
      const close = () => {
          if (closed)
              return;
          closed = true;
          dialog.removeEventListener('click', stopPropagation);
          try {
              overlay.remove();
          }
          catch {
              const parent = overlay.parentNode;
              if (parent)
                  parent.removeChild(overlay);
          }
      };
      overlay.addEventListener('click', () => {
      });
      requestAnimationFrame(() => {
          dialog.focus();
      });
      return { overlay, dialog, content, actions, close };
  };
  const presentMessage = async (title, message) => {
      if (!document.body) {
          alert(`${title}\n\n${message}`);
          return;
      }
      await new Promise((resolve) => {
          const { dialog, content, actions, close } = createDialogShell(title);
          const text = document.createElement('p');
          text.textContent = message;
          text.style.margin = '0';
          text.style.fontSize = '14px';
          text.style.opacity = '0.85';
          content.appendChild(text);
          let settled = false;
          const finish = () => {
              if (settled)
                  return;
              settled = true;
              close();
              resolve();
          };
          const okButton = createDialogButton(t('common.ok'), 'primary');
          okButton.addEventListener('click', finish);
          actions.appendChild(okButton);
          const handleKey = (event) => {
              if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey)) {
                  event.preventDefault();
                  finish();
              }
          };
          dialog.addEventListener('keydown', handleKey);
          requestAnimationFrame(() => okButton.focus());
      });
  };
  const presentConfirmation = async ({ title, message, confirmLabel = t('common.ok'), cancelLabel = t('common.cancel'), }) => {
      if (!document.body) {
          return confirm(message);
      }
      return await new Promise((resolve) => {
          const { dialog, content, actions, close } = createDialogShell(title);
          const text = document.createElement('p');
          text.textContent = message;
          text.style.margin = '0';
          text.style.fontSize = '14px';
          text.style.opacity = '0.85';
          content.appendChild(text);
          let settled = false;
          const finish = (value) => {
              if (settled)
                  return;
              settled = true;
              close();
              resolve(value);
          };
          const cancelButton = createDialogButton(cancelLabel, 'secondary');
          cancelButton.addEventListener('click', () => finish(false));
          const confirmButton = createDialogButton(confirmLabel, 'primary');
          confirmButton.addEventListener('click', () => finish(true));
          actions.appendChild(cancelButton);
          cancelButton.addEventListener('click', () => finish(false));
          actions.appendChild(confirmButton);
          const handleKey = (event) => {
              if (event.key === 'Escape') {
                  event.preventDefault();
                  finish(false);
              }
              else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                  event.preventDefault();
                  finish(true);
              }
          };
          dialog.addEventListener('keydown', handleKey);
          requestAnimationFrame(() => confirmButton.focus());
      });
  };
  const toNonEmptyString = (value, fallback = '') => {
      if (typeof value === 'string' && value.trim().length) {
          return value.trim();
      }
      if (typeof value === 'number') {
          return String(value);
      }
      return fallback;
  };
  /**
   * Localize a message from backend response.
   * Checks for message_code and message_params, falls back to details/message/error.
   */
  const localizeBackendMessage = (response) => {
      if (!response || typeof response !== 'object') {
          return '';
      }
      const messageCode = response.message_code;
      const messageParams = response.message_params;
      if (typeof messageCode === 'string' && messageCode.length > 0) {
          return t(messageCode, messageParams || {});
      }
      return toNonEmptyString(response.details || response.message || response.error, '');
  };
  const PROGRESS_STATUS_KEYS = {
      preparing: 'status.preparing',
      downloading: 'status.downloading',
      merging: 'status.merging',
      removing: 'status.removing',
      success: 'status.success',
      failure: 'status.failure',
  };
  const showProgressDialog = (initial = 'preparing') => {
      if (!document?.body) {
          return {
              setStatus: () => undefined,
              close: () => undefined,
          };
      }
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0, 0, 0, 0.55)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '9999';
      const panel = document.createElement('div');
      panel.style.minWidth = '260px';
      panel.style.maxWidth = '360px';
      panel.style.padding = '24px 28px';
      panel.style.background = '#171a21';
      panel.style.borderRadius = '6px';
      panel.style.border = '1px solid rgba(103, 193, 245, 0.45)';
      panel.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.45)';
      panel.style.color = '#ffffff';
      panel.style.fontFamily = '"Motiva Sans", Arial, sans-serif';
      panel.style.textAlign = 'center';
      const message = document.createElement('div');
      message.style.fontSize = '15px';
      message.style.lineHeight = '1.5';
      message.style.minHeight = '40px';
      panel.appendChild(message);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      let closed = false;
      const setStatus = (status) => {
          if (closed) {
              return;
          }
          message.textContent = t(PROGRESS_STATUS_KEYS[status]);
      };
      const removeOverlay = () => {
          try {
              overlay.remove();
          }
          catch {
              const parent = overlay.parentNode;
              if (parent) {
                  parent.removeChild(overlay);
              }
          }
      };
      const close = (nextStatus, delay = 0) => {
          if (closed) {
              return;
          }
          closed = true;
          if (nextStatus) {
              setStatus(nextStatus);
          }
          window.setTimeout(removeOverlay, Math.max(0, delay));
      };
      setStatus(initial);
      return { setStatus, close };
  };
  const MIRROR_OPTIONS = [
      { id: 'default', labelKey: 'mirrors.default', requiresApiKey: false },
      { id: 'kernelos', labelKey: 'mirrors.kernelos', requiresApiKey: false },
      // { id: 'manilua', labelKey: 'mirrors.maniluaUnderConstruction', requiresApiKey: true },
  ];
  const normalizeBasicResponse = (raw) => {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw;
          const success = obj.success !== false;
          const localizedMsg = localizeBackendMessage(obj);
          const message = localizedMsg || undefined;
          const error = !success && message ? message : undefined;
          return { success, message, error };
      }
      if (typeof raw === 'boolean') {
          return { success: raw };
      }
      if (typeof raw === 'string') {
          const trimmed = raw.trim().toLowerCase();
          if (trimmed === 'true') {
              return { success: true };
          }
          if (trimmed === 'false') {
              return { success: false };
          }
          return { success: true, message: raw };
      }
      return { success: false, error: 'Unexpected response from backend.' };
  };
  const extractBooleanFromResponse = (raw, fallback = false) => {
      if (typeof raw === 'boolean') {
          return raw;
      }
      if (typeof raw === 'string') {
          const trimmed = raw.trim();
          try {
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                  raw = JSON.parse(trimmed);
              }
              else if (trimmed.toLowerCase() === 'true') {
                  return true;
              }
              else if (trimmed.toLowerCase() === 'false') {
                  return false;
              }
              else {
                  return fallback;
              }
          }
          catch {
              return fallback;
          }
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw;
          if (typeof obj.configured === 'boolean')
              return obj.configured;
          if (typeof obj.success === 'boolean')
              return obj.success;
          if (typeof obj.isValid === 'boolean')
              return obj.isValid;
          if (typeof obj.hasKey === 'boolean')
              return obj.hasKey;
      }
      if (typeof raw === 'boolean') {
          return raw;
      }
      return fallback;
  };
  const maskApiKey = (value) => {
      const trimmed = value.trim();
      if (!trimmed.length) {
          return '';
      }
      if (trimmed.length <= 4) {
          return '*'.repeat(trimmed.length);
      }
      const prefix = trimmed.slice(0, 4);
      const suffix = trimmed.length > 6 ? trimmed.slice(-2) : '';
      const middleLength = Math.max(0, trimmed.length - prefix.length - suffix.length);
      return `${prefix}${'*'.repeat(middleLength)}${suffix}`;
  };
  const getApiStatus = async (force = false) => {
      if (force)
          apiState.checked = false;
      if (apiState.checked)
          return { ...apiState };
      try {
          const raw = await getManiluaApiStatusRpc();
          let data = raw;
          if (typeof raw === 'string') {
              const t = raw.trim();
              if (t.startsWith('{') && t.endsWith('}')) {
                  try {
                      data = JSON.parse(t);
                  }
                  catch { /* игнор, пойдём в fallback */ }
              }
          }
          if (data && typeof data === 'object' && !Array.isArray(data)) {
              const obj = data;
              apiState.hasKey = obj.hasOwnProperty('hasKey')
                  ? Boolean(obj.hasKey)
                  : extractBooleanFromResponse(raw, false);
              apiState.isValid = obj.hasOwnProperty('isValid')
                  ? obj.isValid !== false
                  : apiState.hasKey;
              apiState.maskedKey = typeof obj.maskedKey === 'string' ? obj.maskedKey : '';
              const msg = obj.message ?? obj.details;
              apiState.message = typeof msg === 'string' ? msg : undefined;
          }
          else {
              const hasKey = extractBooleanFromResponse(raw, false);
              apiState.hasKey = hasKey;
              apiState.isValid = hasKey;
              apiState.maskedKey = '';
              apiState.message = undefined;
          }
      }
      catch (error) {
          apiState.hasKey = false;
          apiState.isValid = false;
          apiState.maskedKey = '';
          apiState.message = error instanceof Error ? error.message : String(error);
      }
      apiState.checked = true;
      return { ...apiState };
  };
  const showApiKeyPrompt = async () => {
      if (!document?.body) {
          return false;
      }
      return await new Promise((resolve) => {
          const { dialog, content, actions, close } = createDialogShell(t('auth.title'));
          content.innerHTML = '';
          const description = document.createElement('div');
          description.style.marginBottom = '12px';
          description.style.fontSize = '14px';
          description.style.opacity = '0.85';
          description.textContent = t('auth.instructions');
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = t('auth.placeholder');
          input.autocomplete = 'off';
          input.style.cssText = [
              'width: 100%',
              'padding: 8px 12px',
              'background: rgba(0,0,0,0.35)',
              'border: 1px solid #5c5c5c',
              'border-radius: 3px',
              'color: #ffffff',
              'font-size: 14px',
              'box-sizing: border-box',
          ].join(';');
          const helper = document.createElement('div');
          helper.style.marginTop = '8px';
          helper.style.fontSize = '12px';
          helper.style.opacity = '0.8';
          helper.textContent = t('auth.example');
          content.appendChild(description);
          content.appendChild(input);
          content.appendChild(helper);
          const cancelButton = createDialogButton(t('common.cancel'), 'secondary');
          const saveButton = createDialogButton(t('auth.save'), 'primary');
          let settled = false;
          const finish = (value) => {
              if (settled) {
                  return;
              }
              settled = true;
              close();
              resolve(value);
          };
          const setHelperError = (message) => {
              helper.textContent = message;
              helper.style.opacity = '1';
              helper.style.color = '#ffa03b';
          };
          const setHelperNormal = () => {
              helper.textContent = t('auth.example');
              helper.style.opacity = '0.8';
              helper.style.color = '';
          };
          cancelButton.onclick = (event) => {
              event.preventDefault();
              finish(false);
          };
          saveButton.onclick = async (event) => {
              event.preventDefault();
              const apiKey = input.value.trim();
              if (!apiKey) {
                  input.style.borderColor = '#d94126';
                  setHelperError(t('auth.required'));
                  input.focus();
                  return;
              }
              input.style.borderColor = '';
              setHelperNormal();
              saveButton.disabled = true;
              cancelButton.disabled = true;
              saveButton.textContent = t('auth.saving');
              try {
                  const raw = await setManiluaApiKeyRpc({ api_key: apiKey });
                  const result = normalizeBasicResponse(raw);
                  if (result.success) {
                      apiState.hasKey = true;
                      apiState.isValid = true;
                      apiState.maskedKey = maskApiKey(apiKey);
                      apiState.message = result.message;
                      apiState.checked = true;
                      finish(true);
                  }
                  else {
                      input.style.borderColor = '#d94126';
                      setHelperError(result.error || result.message || t('auth.invalid'));
                  }
              }
              catch (error) {
                  input.style.borderColor = '#d94126';
                  const message = error instanceof Error ? error.message : String(error);
                  setHelperError(`${t('auth.error')}: ${message}`);
              }
              finally {
                  saveButton.disabled = false;
                  cancelButton.disabled = false;
                  saveButton.textContent = t('auth.save');
              }
          };
          actions.appendChild(cancelButton);
          actions.appendChild(saveButton);
          const handleKey = (event) => {
              if (event.key === 'Escape') {
                  event.preventDefault();
                  finish(false);
              }
              else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                  event.preventDefault();
                  saveButton.click();
              }
          };
          dialog.addEventListener('keydown', handleKey);
          input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                  event.preventDefault();
                  saveButton.click();
              }
          });
          requestAnimationFrame(() => input.focus());
      });
  };
  const ensureManiluaApiKey = async () => {
      let status = await getApiStatus();
      if (status.hasKey && status.isValid !== false) {
          return true;
      }
      if (status.hasKey && status.isValid === false) {
          await presentMessage(t('auth.title'), status.message ?? t('auth.validationFailed'));
      }
      const configured = await showApiKeyPrompt();
      if (!configured) {
          return false;
      }
      await getApiStatus(true);
      status = await getApiStatus();
      if (!status.hasKey || status.isValid === false) {
          await presentMessage(t('auth.title'), status.message ?? t('auth.validationFailed'));
          return false;
      }
      return true;
  };
  const getVtStatus = async () => {
      try {
          let raw = await getVtApiStatusRpc();
          // Parse if it's a JSON string
          if (typeof raw === 'string') {
              try {
                  raw = JSON.parse(raw);
              }
              catch {
                  // Not JSON, keep as is
              }
          }
          if (raw && typeof raw === 'object') {
              const obj = raw;
              return {
                  hasKey: Boolean(obj.hasKey),
                  apiKey: String(obj.apiKey || ''),
                  isEnabled: Boolean(obj.isEnabled),
              };
          }
      }
      catch (err) {
          console.error('Failed to get VT status:', err);
      }
      return { hasKey: false, apiKey: '', isEnabled: false };
  };
  const showSettingsDialog = async () => {
      if (!document?.body)
          return;
      const vtStatus = await getVtStatus();
      return new Promise((resolve) => {
          const { content, actions, close } = createDialogShell(t('settings.title') || 'Settings');
          // VirusTotal section
          const vtSection = document.createElement('div');
          vtSection.style.marginBottom = '16px';
          const vtTitle = document.createElement('div');
          vtTitle.style.fontWeight = 'bold';
          vtTitle.style.marginBottom = '8px';
          vtTitle.style.fontSize = '14px';
          vtTitle.textContent = 'VirusTotal';
          vtSection.appendChild(vtTitle);
          const vtDescription = document.createElement('div');
          vtDescription.style.fontSize = '12px';
          vtDescription.style.color = '#8f98a0';
          vtDescription.style.marginBottom = '12px';
          vtDescription.textContent = t('settings.vtDescription') || 'Scan downloaded files for malware before installation. Get your free API key at virustotal.com';
          vtSection.appendChild(vtDescription);
          const vtInputContainer = document.createElement('div');
          vtInputContainer.style.display = 'flex';
          vtInputContainer.style.gap = '8px';
          vtInputContainer.style.alignItems = 'center';
          const vtInput = document.createElement('input');
          vtInput.type = 'password';
          vtInput.placeholder = t('settings.vtPlaceholder') || 'Enter VirusTotal API key...';
          vtInput.value = vtStatus.apiKey;
          vtInput.style.flex = '1';
          vtInput.style.padding = '8px 12px';
          vtInput.style.background = '#1a1d24';
          vtInput.style.border = '1px solid #3d4450';
          vtInput.style.borderRadius = '4px';
          vtInput.style.color = '#ffffff';
          vtInput.style.fontSize = '13px';
          vtInputContainer.appendChild(vtInput);
          const vtStatus$ = document.createElement('span');
          vtStatus$.style.fontSize = '12px';
          vtStatus$.style.whiteSpace = 'nowrap';
          if (vtStatus.isEnabled) {
              vtStatus$.textContent = '✓ ' + (t('settings.vtEnabled') || 'Enabled');
              vtStatus$.style.color = '#5ba32b';
          }
          else if (vtStatus.hasKey) {
              vtStatus$.textContent = '⚠ ' + (t('settings.vtDisabled') || 'Disabled');
              vtStatus$.style.color = '#f0ad4e';
          }
          else {
              vtStatus$.textContent = t('settings.vtNotConfigured') || 'Not configured';
              vtStatus$.style.color = '#8f98a0';
          }
          vtInputContainer.appendChild(vtStatus$);
          vtSection.appendChild(vtInputContainer);
          content.appendChild(vtSection);
          // Buttons
          const cancelButton = createDialogButton(t('common.cancel'), 'secondary');
          const saveButton = createDialogButton(t('common.save') || 'Save', 'primary');
          const finish = () => {
              close();
              resolve();
          };
          cancelButton.addEventListener('click', finish);
          saveButton.addEventListener('click', async () => {
              const newKey = vtInput.value.trim();
              // Check if unchanged
              if (newKey === vtStatus.apiKey) {
                  finish();
                  return;
              }
              // Validate: key format (VT keys are 64 hex characters, or empty to clear)
              if (newKey && newKey.length !== 64) {
                  vtStatus$.textContent = '✗ ' + (t('settings.vtInvalidKey') || 'Invalid key format');
                  vtStatus$.style.color = '#d94040';
                  return;
              }
              try {
                  saveButton.disabled = true;
                  saveButton.textContent = t('common.saving') || 'Saving...';
                  const raw = await setVtApiKeyRpc({ api_key: newKey });
                  const result = normalizeBasicResponse(raw);
                  if (result.success) {
                      vtStatus$.textContent = newKey ? ('✓ ' + (t('settings.vtEnabled') || 'Enabled')) : (t('settings.vtNotConfigured') || 'Not configured');
                      vtStatus$.style.color = newKey ? '#5ba32b' : '#8f98a0';
                      finish();
                  }
                  else {
                      vtStatus$.textContent = '✗ ' + (result.error || 'Failed to save');
                      vtStatus$.style.color = '#d94040';
                      saveButton.disabled = false;
                      saveButton.textContent = t('common.save') || 'Save';
                  }
              }
              catch (err) {
                  vtStatus$.textContent = '✗ Error';
                  vtStatus$.style.color = '#d94040';
                  saveButton.disabled = false;
                  saveButton.textContent = t('common.save') || 'Save';
              }
          });
          actions.appendChild(cancelButton);
          actions.appendChild(saveButton);
      });
  };
  const showMirrorSelectionModal = async (initial = (currentMirror ?? 'default')) => {
      if (!document?.body)
          return initial;
      const disabledMirrors = new Set([]);
      return await new Promise((resolve) => {
          const { dialog, content, actions, close } = createDialogShell(t('mirrors.title'));
          const list = document.createElement('div');
          list.style.display = 'flex';
          list.style.flexDirection = 'column';
          list.style.gap = '6px';
          list.style.marginBottom = '12px';
          let selected = initial;
          MIRROR_OPTIONS.forEach((option) => {
              const isDisabled = disabledMirrors.has(option.id);
              const row = document.createElement('label');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.gap = '10px';
              row.style.padding = '6px 8px';
              row.style.border = '1px solid rgba(255, 255, 255, 0.1)';
              row.style.borderRadius = '4px';
              row.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
              if (isDisabled)
                  row.style.opacity = '0.6';
              const radio = document.createElement('input');
              radio.type = 'radio';
              radio.name = 'mirror-option';
              radio.value = option.id;
              radio.checked = option.id === selected;
              radio.disabled = isDisabled;
              if (!isDisabled)
                  radio.addEventListener('change', () => (selected = option.id));
              const label = document.createElement('div');
              label.textContent = t(option.labelKey);
              label.style.flex = '1';
              const badgeText = isDisabled ? t('mirrors.maniluaDisabled')
                  : option.requiresApiKey ? t('auth.title') : '';
              row.appendChild(radio);
              row.appendChild(label);
              if (badgeText) {
                  const badge = document.createElement('span');
                  badge.style.fontSize = '11px';
                  badge.style.opacity = '0.7';
                  badge.textContent = badgeText;
                  row.appendChild(badge);
              }
              row.addEventListener('click', () => {
                  if (isDisabled)
                      return;
                  radio.checked = true;
                  selected = option.id;
              });
              list.appendChild(row);
          });
          content.innerHTML = '';
          content.appendChild(list);
          const cancelButton = createDialogButton(t('common.cancel'), 'secondary');
          const confirmButton = createDialogButton(t('common.ok'), 'primary');
          let settled = false;
          const finish = (value) => {
              if (settled)
                  return;
              settled = true;
              close();
              resolve(value);
          };
          cancelButton.onclick = (e) => { e.preventDefault(); finish(null); };
          confirmButton.onclick = async (e) => {
              e.preventDefault();
              const picked = MIRROR_OPTIONS.find(o => o.id === selected);
              if (!picked)
                  return;
              if (disabledMirrors.has(picked.id)) {
                  await presentMessage(t('mirrors.title'), t('mirrors.maniluaDisabled'));
                  return;
              }
              if (picked.requiresApiKey) {
                  if (picked.id === 'manilua') {
                      const ok = await ensureManiluaApiKey();
                      if (!ok)
                          return;
                  }
              }
              currentMirror = selected; // запоминаем только для предвыбора
              finish(selected);
          };
          actions.appendChild(cancelButton);
          actions.appendChild(confirmButton);
          dialog.addEventListener('keydown', (event) => {
              if (event.key === 'Escape') {
                  event.preventDefault();
                  finish(null);
              }
          });
      });
  };
  const ensureMirrorSelection = async () => {
      return await showMirrorSelectionModal(currentMirror ?? 'default');
  };
  const normalizeDlcEntry = (entry) => {
      if (!entry || typeof entry !== 'object')
          return null;
      const obj = entry;
      const appid = toNonEmptyString(obj.appid ?? obj['appid']);
      if (!appid)
          return null;
      const name = toNonEmptyString(obj.name ?? obj['name'], `DLC ${appid}`);
      const alreadyInstalled = Boolean(obj.alreadyInstalled ?? obj['alreadyInstalled']);
      return {
          appid,
          name,
          alreadyInstalled,
      };
  };
  const normalizeInstallResult = (raw) => {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw;
          const dlcRaw = Array.isArray(obj.dlc) ? obj.dlc : [];
          const dlc = dlcRaw.map(normalizeDlcEntry).filter((item) => item !== null);
          const success = Boolean(obj.success);
          const details = localizeBackendMessage(obj) || (success ? '' : t('errors.manifestMissing'));
          const appid = toNonEmptyString(obj.appid, undefined);
          return { success, details, dlc, appid };
      }
      if (typeof raw === 'string') {
          try {
              const parsed = JSON.parse(raw);
              return normalizeInstallResult(parsed);
          }
          catch {
              const lower = raw.toLowerCase().trim();
              if (lower === 'true')
                  return { success: true, details: '', dlc: [] };
              if (lower === 'false')
                  return { success: false, details: t('errors.manifestMissing'), dlc: [] };
              return { success: false, details: raw, dlc: [] };
          }
      }
      if (typeof raw === 'boolean') {
          return {
              success: raw,
              details: raw ? '' : t('errors.manifestMissing'),
              dlc: [],
          };
      }
      return { success: false, details: t('errors.manifestMissing'), dlc: [] };
  };
  const toIdArray = (value) => {
      if (!Array.isArray(value))
          return [];
      return value
          .map((item) => toNonEmptyString(item))
          .filter((item) => Boolean(item));
  };
  const normalizeInstallDlcsResult = (raw) => {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw;
          return {
              success: Boolean(obj.success),
              details: localizeBackendMessage(obj),
              installed: toIdArray(obj.installed),
              failed: toIdArray(obj.failed),
          };
      }
      if (typeof raw === 'string') {
          try {
              const parsed = JSON.parse(raw);
              return normalizeInstallDlcsResult(parsed);
          }
          catch {
              const lower = raw.toLowerCase().trim();
              if (lower === 'true')
                  return { success: true, details: undefined, installed: [], failed: [] };
              if (lower === 'false')
                  return { success: false, details: undefined, installed: [], failed: [] };
              return { success: false, details: raw, installed: [], failed: [] };
          }
      }
      if (typeof raw === 'boolean') {
          return { success: raw, details: undefined, installed: [], failed: [] };
      }
      return { success: false, details: undefined, installed: [], failed: [] };
  };
  const showDlcSelection = async (appId, dlcList, mirror, isEditMode = false) => {
      const normalized = dlcList.map(normalizeDlcEntry).filter((item) => item !== null);
      if (!normalized.length || !document.body)
          return false;
      return await new Promise((resolve) => {
          const { dialog, content, actions, close } = createDialogShell(t('dialogs.selectDlc.title'), t('dialogs.selectDlc.subtitle'));
          content.style.margin = '0';
          const list = document.createElement('div');
          list.style.maxHeight = '40vh';
          list.style.overflowY = 'auto';
          list.style.margin = '16px 0';
          list.style.paddingRight = '8px';
          content.appendChild(list);
          const dlcCheckboxes = [];
          const masterRow = document.createElement('label');
          masterRow.style.display = 'flex';
          masterRow.style.alignItems = 'center';
          masterRow.style.gap = '10px';
          masterRow.style.padding = '6px 0';
          masterRow.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
          masterRow.style.cursor = 'pointer';
          masterRow.style.margin = '0';
          list.appendChild(masterRow);
          const masterCheckbox = document.createElement('input');
          masterCheckbox.type = 'checkbox';
          masterCheckbox.title = t('dialogs.selectDlc.selectAll');
          masterCheckbox.style.transform = 'scale(1.1)';
          masterCheckbox.style.cursor = 'pointer';
          masterCheckbox.dataset.role = 'master';
          masterRow.appendChild(masterCheckbox);
          const masterText = document.createElement('div');
          masterText.textContent = t('dialogs.selectDlc.selectAll');
          masterText.style.fontWeight = '600';
          masterRow.appendChild(masterText);
          const updateMasterState = () => {
              if (!dlcCheckboxes.length) {
                  masterCheckbox.checked = false;
                  masterCheckbox.indeterminate = false;
                  masterCheckbox.disabled = true;
                  return;
              }
              masterCheckbox.disabled = false;
              const allChecked = dlcCheckboxes.every((input) => input.checked);
              const someChecked = dlcCheckboxes.some((input) => input.checked);
              masterCheckbox.checked = allChecked;
              masterCheckbox.indeterminate = !allChecked && someChecked;
          };
          normalized.forEach((entry, index) => {
              const label = document.createElement('label');
              label.dataset.appid = entry.appid;
              label.style.display = 'flex';
              label.style.alignItems = 'center';
              label.style.gap = '10px';
              label.style.padding = '6px 0';
              label.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.value = entry.appid;
              checkbox.dataset.role = 'dlc';
              dlcCheckboxes.push(checkbox);
              const textContainer = document.createElement('div');
              textContainer.textContent = entry.name && entry.name.trim().length
                  ? entry.name
                  : t('labels.dlcWithId', { id: entry.appid });
              if (entry.alreadyInstalled) {
                  checkbox.checked = isEditMode || false;
              }
              label.appendChild(checkbox);
              label.appendChild(textContainer);
              list.appendChild(label);
              checkbox.addEventListener('change', () => {
                  updateMasterState();
              });
              if (index === normalized.length - 1) {
                  label.style.borderBottom = 'none';
              }
          });
          const cancelButton = createDialogButton(t('common.cancel'), 'secondary');
          const confirmButton = createDialogButton(t('dialogs.selectDlc.confirm'), 'primary');
          let settled = false;
          const finish = (wasInstalled) => {
              if (settled)
                  return;
              settled = true;
              close();
              resolve(wasInstalled);
          };
          const setDisabled = (state) => {
              confirmButton.disabled = state;
              if (state) {
                  dialog.setAttribute('aria-busy', 'true');
              }
              else {
                  dialog.removeAttribute('aria-busy');
              }
          };
          confirmButton.addEventListener('click', async () => {
              const selected = dlcCheckboxes.filter((input) => input.checked).map((input) => input.value);
              setDisabled(true);
              const progress = showProgressDialog('preparing');
              try {
                  progress.setStatus('downloading');
                  const responseRaw = await installDlcsRpc({ appid: appId, dlcs: selected, mirror });
                  const response = normalizeInstallDlcsResult(responseRaw);
                  if (response.success) {
                      progress.setStatus('merging');
                      progress.close('success', 600);
                      finish(true);
                  }
                  else {
                      progress.close('failure', 1200);
                      setDisabled(false);
                      await presentMessage(t('alerts.addingFailedTitle'), response.details || t('errors.failedAddSelectedDlc'));
                  }
              }
              catch (error) {
                  progress.close('failure', 1200);
                  setDisabled(false);
                  await presentMessage(t('alerts.addingFailedTitle'), t('common.errorWithMessage', { message: error instanceof Error ? error.message : String(error) }));
              }
          });
          cancelButton.addEventListener('click', () => finish(false));
          actions.appendChild(cancelButton);
          actions.appendChild(confirmButton);
          const handleKey = (event) => {
              if (event.key === 'Escape') {
                  event.preventDefault();
                  finish(false);
              }
          };
          dialog.addEventListener('keydown', handleKey);
          masterCheckbox.addEventListener('change', () => {
              if (!dlcCheckboxes.length)
                  return;
              dlcCheckboxes.forEach((input) => {
                  input.checked = masterCheckbox.checked;
              });
              updateMasterState();
          });
          updateMasterState();
      });
  };
  const confirmBaseGameInstall = async () => {
      return presentConfirmation({
          title: t('dialogs.baseInstall.title'),
          message: t('dialogs.baseInstall.message'),
          confirmLabel: t('dialogs.baseInstall.confirm'),
          cancelLabel: t('common.cancel'),
      });
  };
  /**
   * Throttle function to limit how often a function can be called.
   * @param func Function to throttle
   * @param delay Minimum time between function calls in milliseconds
   */
  const throttle = (func, delay) => {
      let lastCall = 0;
      let timeoutId = null;
      return (...args) => {
          const now = Date.now();
          const timeSinceLastCall = now - lastCall;
          if (timeSinceLastCall >= delay) {
              lastCall = now;
              func(...args);
          }
          else {
              if (!timeoutId) {
                  timeoutId = setTimeout(() => {
                      lastCall = Date.now();
                      timeoutId = null;
                      func(...args);
                  }, delay - timeSinceLastCall);
              }
          }
      };
  };
  const ADD_BTN_ID = "add-app-to-library-btn";
  const REMOVE_BTN_ID = "remove-app-from-library-btn";
  const SETTINGS_BTN_ID = "steam-app-inserter-settings-btn";
  const CONTAINER_SELECTOR = ".apphub_OtherSiteInfo";
  const WAIT_FOR_ELEMENT_TIMEOUT = 20000;
  const MUTATION_OBSERVER_THROTTLE_MS = 500;
  const RETRY_INSERT_DELAY_MS = 1000;
  const BUTTON_KEYS = {
      ADD_TO_LIBRARY: 'buttons.addToLibrary',
      EDIT_DLC_LIBRARY: 'buttons.editDlcLibrary',
      REMOVE_FROM_LIBRARY: 'buttons.removeFromLibrary',
      LOADING: 'buttons.loading',
      ADDING: 'buttons.adding',
      REMOVING: 'buttons.removing',
  };
  const buttonLabel = (key) => `<span>${t(BUTTON_KEYS[key])}</span>`;
  /**
   * Reset add button to initial state with appropriate label
   */
  const resetAddButton = (button, isPirated) => {
      button.disabled = false;
      button.innerHTML = isPirated
          ? buttonLabel('EDIT_DLC_LIBRARY')
          : buttonLabel('ADD_TO_LIBRARY');
  };
  /**
   * Prompt user to restart Steam after successful operation
   * @param message Success message to show
   * @param onRefreshButtons Callback to refresh buttons after canceling restart
   * @returns Promise that resolves when dialog is closed
   */
  const promptSteamRestart = async (message, onRefreshButtons) => {
      const restart = await presentConfirmation({
          title: t('dialogs.restart.title'),
          message: t('dialogs.restart.message', { details: message }),
          confirmLabel: t('dialogs.restart.confirm'),
          cancelLabel: t('dialogs.restart.cancel'),
      });
      if (restart) {
          await restartt();
      }
      else {
          await onRefreshButtons();
      }
  };
  /**
   * Handle DLC installation workflow (fetch list + show selection dialog)
   * @param appId Application ID
   * @param dlcList List of available DLC
   * @param onRefreshButtons Callback to refresh buttons after operation
   */
  const handleDlcInstallation = async (appId, dlcList, onRefreshButtons, mirror, isPirated) => {
      const isEditMode = isPirated;
      const wasInstalled = await showDlcSelection(appId, dlcList, mirror, isEditMode);
      if (wasInstalled) {
          await promptSteamRestart(t('messages.changesApplied'), onRefreshButtons);
      }
      else {
          // Отмена - ничего не делать, просто обновить кнопки
          await onRefreshButtons();
      }
  };
  /**
   * Handle base game installation (game with no DLC)
   * @param appId Application ID
   * @param addBtn Add button element
   * @param isPirated Whether game is already installed
   * @param onRefreshButtons Callback to refresh buttons after operation
   */
  const handleBaseGameInstallation = async (appId, addBtn, isPirated, onRefreshButtons, mirror) => {
      const shouldInstall = await confirmBaseGameInstall();
      if (!shouldInstall) {
          resetAddButton(addBtn, isPirated);
          return;
      }
      addBtn.innerHTML = buttonLabel('ADDING');
      const progress = showProgressDialog('preparing');
      try {
          progress.setStatus('downloading');
          const installRaw = await installDlcsRpc({ appid: appId, dlcs: [], mirror });
          const installResult = normalizeInstallDlcsResult(installRaw);
          if (installResult.success) {
              progress.setStatus('merging');
              progress.close('success', 600);
              await wait(600);
              await promptSteamRestart(t('messages.gameAdded'), onRefreshButtons);
          }
          else {
              progress.close('failure', 1200);
              await presentMessage(t('alerts.unableAddTitle'), installResult.details || t('errors.failedInstallBaseGame'));
              resetAddButton(addBtn, isPirated);
          }
      }
      catch (installErr) {
          const errorMessage = installErr instanceof Error ? installErr.message : String(installErr);
          progress.close('failure', 1200);
          await presentMessage(t('alerts.unableAddTitle'), t('common.errorWithMessage', { message: errorMessage }));
          resetAddButton(addBtn, isPirated);
      }
  };
  /**
   * Handle errors during add button operation
   */
  const handleAddError = async (error, addBtn, isPirated) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await presentMessage(t('alerts.unableGetDlcTitle'), t('common.errorWithMessage', { message: errorMessage }));
      resetAddButton(addBtn, isPirated);
  };
  async function WebkitMain() {
      await initI18n();
      if (!/^https:\/\/store\.steampowered\.com\/app\//.test(location.href))
          return;
      const waitForEl = (selector, timeout = WAIT_FOR_ELEMENT_TIMEOUT) => new Promise((resolve, reject) => {
          const found = document.querySelector(selector);
          if (found)
              return resolve(found);
          const obs = new MutationObserver(() => {
              const el = document.querySelector(selector);
              if (el) {
                  obs.disconnect();
                  resolve(el);
              }
          });
          obs.observe(document.documentElement, { childList: true, subtree: true });
          setTimeout(() => { obs.disconnect(); reject(new Error("timeout")); }, timeout);
      });
      const getAppId = () => {
          const match = location.href.match(/\/app\/(\d+)/);
          return match ? match[1] : null;
      };
      const insertButtons = async () => {
          try {
              const container = await waitForEl(CONTAINER_SELECTOR);
              renderCompatBadge(container);
              const appId = getAppId();
              if (!appId)
                  return;
              const isPirated = await checkPirated({ id: appId });
              document.getElementById(ADD_BTN_ID)?.remove();
              document.getElementById(REMOVE_BTN_ID)?.remove();
              document.getElementById(SETTINGS_BTN_ID)?.remove();
              // Settings button (gear icon)
              const settingsBtn = document.createElement("button");
              settingsBtn.id = SETTINGS_BTN_ID;
              settingsBtn.type = "button";
              settingsBtn.className = "btnv6_blue_hoverfade btn_medium";
              settingsBtn.style.marginRight = "3px";
              settingsBtn.innerHTML = '<span>⚙</span>';
              settingsBtn.title = t('settings.title') || 'Settings';
              settingsBtn.addEventListener("click", async (e) => {
                  e.preventDefault();
                  await showSettingsDialog();
              });
              const addBtn = document.createElement("button");
              addBtn.id = ADD_BTN_ID;
              addBtn.type = "button";
              addBtn.style.marginRight = "3px";
              addBtn.className = "btnv6_blue_hoverfade btn_medium";
              let removeBtn = null;
              if (isPirated) {
                  removeBtn = document.createElement("button");
                  removeBtn.id = REMOVE_BTN_ID;
                  removeBtn.type = "button";
                  removeBtn.style.marginRight = "3px";
                  removeBtn.className = "btnv6_blue_hoverfade btn_medium";
                  removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                  removeBtn.addEventListener("click", async (e) => {
                      e.preventDefault();
                      const confirmed = await presentConfirmation({
                          title: t('dialogs.remove.title'),
                          message: t('dialogs.remove.message'),
                          confirmLabel: t('common.remove'),
                          cancelLabel: t('common.cancel'),
                      });
                      if (!confirmed) {
                          return;
                      }
                      removeBtn.disabled = true;
                      removeBtn.innerHTML = buttonLabel('REMOVING');
                      const progress = showProgressDialog('removing');
                      try {
                          progress.setStatus('removing');
                          const success = await deletegame({ id: appId });
                          if (success) {
                              progress.close('success', 600);
                              await wait(600);
                              await promptSteamRestart(t('messages.gameRemoved'), insertButtons);
                          }
                          else {
                              progress.close('failure', 1200);
                              await presentMessage(t('alerts.unableRemoveTitle'), t('errors.failedRemoveGame'));
                              removeBtn.disabled = false;
                              removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                          }
                      }
                      catch (err) {
                          progress.close('failure', 1200);
                          const message = err instanceof Error ? err.message : String(err);
                          await presentMessage(t('alerts.unableRemoveTitle'), t('common.errorWithMessage', { message }));
                          removeBtn.disabled = false;
                          removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                      }
                  });
                  addBtn.innerHTML = buttonLabel('EDIT_DLC_LIBRARY');
              }
              else {
                  addBtn.innerHTML = buttonLabel('ADD_TO_LIBRARY');
              }
              addBtn.addEventListener("click", async (e) => {
                  e.preventDefault();
                  if (isBusy) {
                      return;
                  }
                  const mirror = await ensureMirrorSelection();
                  if (!mirror) {
                      return;
                  }
                  isBusy = true;
                  addBtn.disabled = true;
                  addBtn.innerHTML = buttonLabel('LOADING');
                  try {
                      const rawResult = await getDlcListRpc({ appid: appId, mirror });
                      const dlcResult = normalizeInstallResult(rawResult);
                      if (!dlcResult.success) {
                          await presentMessage(t('alerts.unableGetDlcTitle'), dlcResult.details ?? t('errors.failedFetchInfo'));
                          resetAddButton(addBtn, isPirated);
                          return;
                      }
                      if (dlcResult.dlc && dlcResult.dlc.length) {
                          await handleDlcInstallation(appId, dlcResult.dlc, insertButtons, mirror, isPirated);
                      }
                      else if (!isPirated) {
                          await handleBaseGameInstallation(appId, addBtn, isPirated, insertButtons, mirror);
                      }
                      else {
                          await presentMessage(t('alerts.noDlcTitle'), t('messages.noDlcDetails'));
                          resetAddButton(addBtn, isPirated);
                      }
                  }
                  catch (err) {
                      await handleAddError(err, addBtn, isPirated);
                  }
                  finally {
                      isBusy = false;
                  }
              });
              // Insert buttons: [settings] [remove if pirated] [add/edit] before [last]
              const last = container.lastElementChild;
              if (last) {
                  container.insertBefore(settingsBtn, last);
                  if (removeBtn) {
                      container.insertBefore(removeBtn, last);
                  }
                  container.insertBefore(addBtn, last);
              }
              else {
                  container.appendChild(settingsBtn);
                  if (removeBtn) {
                      container.appendChild(removeBtn);
                  }
                  container.appendChild(addBtn);
              }
          }
          catch {
              setTimeout(insertButtons, RETRY_INSERT_DELAY_MS);
          }
      };
      if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", insertButtons, { once: true });
      }
      else {
          insertButtons();
      }
      const throttledInsertCheck = throttle(() => {
          const appId = getAppId();
          if (appId && !document.getElementById(ADD_BTN_ID) && !document.getElementById(REMOVE_BTN_ID)) {
              insertButtons();
          }
      }, MUTATION_OBSERVER_THROTTLE_MS);
      const keepAlive = new MutationObserver(throttledInsertCheck);
      keepAlive.observe(document.body, { childList: true, subtree: true });
  }

  exports.default = WebkitMain;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({}, window.MILLENNIUM_API);
 return millennium_main; };
function ExecutePluginModule() {
    let MillenniumStore = window.MILLENNIUM_PLUGIN_SETTINGS_STORE[pluginName];
    function OnPluginConfigChange(key, __, value) {
        if (key in MillenniumStore.settingsStore) {
            MillenniumStore.ignoreProxyFlag = true;
            MillenniumStore.settingsStore[key] = value;
            MillenniumStore.ignoreProxyFlag = false;
        }
    }
    /** Expose the OnPluginConfigChange so it can be called externally */
    MillenniumStore.OnPluginConfigChange = OnPluginConfigChange;
    MILLENNIUM_BACKEND_IPC.postMessage(0, { pluginName: pluginName, methodName: '__builtins__.__millennium_plugin_settings_parser__' }).then(async (response) => {
        /**
         * __millennium_plugin_settings_parser__ will return false if the plugin has no settings.
         * If the plugin has settings, it will return a base64 encoded string.
         * The string is then decoded and parsed into an object.
         */
        if (typeof response.returnValue === 'string') {
            MillenniumStore.ignoreProxyFlag = true;
            /** Initialize the settings store from the settings returned from the backend. */
            MillenniumStore.settingsStore = MillenniumStore.DefinePluginSetting(Object.fromEntries(JSON.parse(atob(response.returnValue)).map((item) => [item.functionName, item])));
            MillenniumStore.ignoreProxyFlag = false;
        }
        /** @ts-ignore: call the plugin main after the settings have been parsed. This prevent plugin settings from being undefined at top level. */
        let PluginModule = PluginEntryPointMain();
        /** Assign the plugin on plugin list. */
        Object.assign(window.PLUGIN_LIST[pluginName], {
            ...PluginModule,
            __millennium_internal_plugin_name_do_not_use_or_change__: pluginName,
        });
        /** Run the rolled up plugins default exported function */
        let pluginProps = await PluginModule.default();
        function isValidSidebarNavComponent(obj) {
            return obj && obj.title !== undefined && obj.icon !== undefined && obj.content !== undefined;
        }
        if (pluginProps && isValidSidebarNavComponent(pluginProps)) {
            window.MILLENNIUM_SIDEBAR_NAVIGATION_PANELS[pluginName] = pluginProps;
        }
        else {
            console.warn(`Plugin ${pluginName} does not contain proper SidebarNavigation props and therefor can't be mounted by Millennium. Please ensure it has a title, icon, and content.`);
            return;
        }
        /** If the current module is a client module, post message id=1 which calls the front_end_loaded method on the backend. */
        if (MILLENNIUM_IS_CLIENT_MODULE) {
            MILLENNIUM_BACKEND_IPC.postMessage(1, { pluginName: pluginName });
        }
    });
}
ExecutePluginModule()