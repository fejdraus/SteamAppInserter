import { callable } from '@steambrew/webkit';
import { initI18n, t } from './i18n.js';

type DlcEntry = {
    appid: string;
    name: string;
    alreadyInstalled?: boolean;
};

type BackendInstallResponse = {
    success: boolean;
    details?: string;
    dlc?: DlcEntry[];
    appid?: string;
};

type BackendInstallDlcsResponse = {
    success: boolean;
    details?: string;
    installed?: string[];
    failed?: string[];
};

type RawBackendResponse = BackendInstallResponse | BackendInstallDlcsResponse | boolean | string | null | undefined;

type ApiStatus = {
    hasKey: boolean;
    isValid: boolean;
    maskedKey: string;
    checked: boolean;
    message?: string;
};

let currentMirror: MirrorId | null = null;
const getDlcListRpc = callable<[{ appid: string; mirror?: string }], RawBackendResponse>('Backend.get_dlc_list');
const installDlcsRpc = callable<[{ appid: string; dlcs: string[]; mirror?: string }], RawBackendResponse>('Backend.install_dlcs');
const deletegame = callable<[{ id: string }], boolean>('Backend.delete_lua');
const checkPirated = callable<[{ id: string }], boolean>('Backend.checkpirated');
const restartt = callable<[], boolean>('Backend.restart');
const setManiluaApiKeyRpc = callable<[{ api_key: string }], RawBackendResponse>('Backend.set_manilua_api_key');
const getManiluaApiStatusRpc = callable<[], RawBackendResponse>('Backend.get_manilua_api_status');

let isBusy = false;
const apiState: ApiStatus = {
    hasKey: false,
    isValid: false,
    maskedKey: '',
    checked: false,
};
type CompatLevel = 'ok' | 'warn' | 'bad';

type CompatInfo = {
    level: CompatLevel;
    label: string;
    color: string;
    reasons: string[];
};

const COMPAT_BADGE_ID = 'steam-app-inserter-compat-badge';

const DRM_TERMS = [
    'denuvo', 'securom', 'secucrom', 'arxan', 'vmprotect',
    'requires 3rd-party drm', 'third-party drm'
];

const ACCOUNT_TERMS = [
    'requires 3rd-party account', '3rd-party account', 'ea account', 'ea app',
    'ea play', 'ubisoft connect', 'uplay', 'rockstar social club', 'rockstar games launcher',
    'battle.net', 'bethesda.net', '2k account', 'epic account', 'riot account'
];

const ensureCompatStyles = (): void => {
    if (document.getElementById('steam-app-inserter-compat-css')) return;
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
const norm = (s: string): string => {
    try {
        return (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    } catch {
        return (s || '').toString().toLowerCase();
    }
};

const uniqueNormList = (list: string[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of list) {
        const n = norm(x).trim();
        if (!n) continue;
        if (!seen.has(n)) {
            seen.add(n);
            out.push(n);
        }
    }
    return out;
};

// Exact copy of kernelua collection (with same selectors)
const kerneluaCollectStructured = (): { tags: string[]; specs: string[]; noticesText: string } => {
    const tagNodes = document.querySelectorAll('.glance_tags .app_tag, .popular_tags .app_tag, #category_block a, #category_block .label');
    const specNodes = document.querySelectorAll('.game_area_details_specs a, .game_area_details_specs li, .game_area_features_list li');
    const noticeNodes = document.querySelectorAll('.DRM_notice, .game_meta_data, .glance_ctn, .game_area_purchase');

    const tags = uniqueNormList(Array.from(tagNodes).map(n => n.textContent || ''));
    const specs = uniqueNormList(Array.from(specNodes).map(n => n.textContent || ''));
    const noticesText = norm(Array.from(noticeNodes).map(n => n.textContent || '').join(' \n '));

    return { tags, specs, noticesText };
};

// Analysis with debug output
const analyzeCompatibility = (): CompatInfo => {
    const { tags, specs, noticesText } = kerneluaCollectStructured();

    const ONLINE = [
        // English
        'online pvp', 'online co-op', 'co-op online', 'multiplayer online',
        'massively multiplayer', 'mmo', 'mmorpg', 'cross-platform multiplayer',
        'crossplay', 'cross-play', 'requires internet connection', 'always online',
        'live service', 'games as a service',
        // Ukrainian
        'багатокористувацька', 'гравець проти гравця', 'гравець проти оточення',
        'мережева гра', 'кооператив'
    ];

    const inList = (list: string[], terms: string[]): boolean =>
        list.some(x => terms.some(t => x.includes(t)));

    const hasOnline = inList(tags, ONLINE) || inList(specs, ONLINE);
    const hasDrm = DRM_TERMS.some(t => noticesText.includes(t));
    const hasAccount = ACCOUNT_TERMS.some(t => noticesText.includes(t)) ||
                       inList(tags, ACCOUNT_TERMS) || inList(specs, ACCOUNT_TERMS);

    let level: CompatLevel = 'ok';
    const reasons: string[] = [];

    if (hasDrm) {
        level = 'bad';
        reasons.push(t('compat.drmDetected'));
    }

    if (hasAccount) {
        if (level !== 'bad') level = 'warn';
        reasons.push(t('compat.accountRequired'));
    }

    if (hasOnline) {
        if (level !== 'bad') level = 'warn';
        reasons.push(t('compat.hasOnline'));
    }

    const labels: Record<CompatLevel, string> = {
        ok: t('compat.works'),
        warn: t('compat.mayNotWork'),
        bad: t('compat.needsBypass')
    };

    const colors: Record<CompatLevel, string> = {
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

const renderCompatBadge = (container: HTMLElement): void => {
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




const createDialogButton = (label: string, variant: 'primary' | 'secondary' = 'primary'): HTMLButtonElement => {
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

const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, ms));
    });

const createDialogShell = (title: string, subtitle?: string) => {
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

    const stopPropagation = (event: MouseEvent) => event.stopPropagation();
    dialog.addEventListener('click', stopPropagation);

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        dialog.removeEventListener('click', stopPropagation);
        try {
            overlay.remove();
        } catch {
            const parent = overlay.parentNode;
            if (parent) parent.removeChild(overlay);
        }
    };

    overlay.addEventListener('click', () => {
    });

    requestAnimationFrame(() => {
        dialog.focus();
    });

    return { overlay, dialog, content, actions, close };
};

type ConfirmationOptions = {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
};

const presentMessage = async (title: string, message: string): Promise<void> => {
    if (!document.body) {
        alert(`${title}\n\n${message}`);
        return;
    }

    await new Promise<void>((resolve) => {
        const { dialog, content, actions, close } = createDialogShell(title);

        const text = document.createElement('p');
        text.textContent = message;
        text.style.margin = '0';
        text.style.fontSize = '14px';
        text.style.opacity = '0.85';
        content.appendChild(text);

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            close();
            resolve();
        };

        const okButton = createDialogButton(t('common.ok'), 'primary');
        okButton.addEventListener('click', finish);
        actions.appendChild(okButton);

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey)) {
                event.preventDefault();
                finish();
            }
        };

        dialog.addEventListener('keydown', handleKey);
        requestAnimationFrame(() => okButton.focus());
    });
};

const presentConfirmation = async ({
    title,
    message,
    confirmLabel = t('common.ok'),
    cancelLabel = t('common.cancel'),
}: ConfirmationOptions): Promise<boolean> => {
    if (!document.body) {
        return confirm(message);
    }

    return await new Promise<boolean>((resolve) => {
        const { dialog, content, actions, close } = createDialogShell(title);

        const text = document.createElement('p');
        text.textContent = message;
        text.style.margin = '0';
        text.style.fontSize = '14px';
        text.style.opacity = '0.85';
        content.appendChild(text);

        let settled = false;
        const finish = (value: boolean) => {
            if (settled) return;
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

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                finish(true);
            }
        };

        dialog.addEventListener('keydown', handleKey);
        requestAnimationFrame(() => confirmButton.focus());
    });
};

const toNonEmptyString = (value: unknown, fallback = ''): string => {
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
const localizeBackendMessage = (response: any): string => {
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
} as const;

type ProgressStatusKey = keyof typeof PROGRESS_STATUS_KEYS;

type ProgressDialog = {
    setStatus: (status: ProgressStatusKey) => void;
    close: (nextStatus?: ProgressStatusKey, delay?: number) => void;
};

const showProgressDialog = (initial: ProgressStatusKey = 'preparing'): ProgressDialog => {
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

    const setStatus = (status: ProgressStatusKey) => {
        if (closed) {
            return;
        }
        message.textContent = t(PROGRESS_STATUS_KEYS[status]);
    };

    const removeOverlay = () => {
        try {
            overlay.remove();
        } catch {
            const parent = overlay.parentNode;
            if (parent) {
                parent.removeChild(overlay);
            }
        }
    };

    const close = (nextStatus?: ProgressStatusKey, delay = 0) => {
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

type MirrorId = 'default' | 'manilua' | 'kernelos';

type MirrorOption = {
    id: MirrorId;
    labelKey: string;
    requiresApiKey: boolean;
};

const MIRROR_OPTIONS: readonly MirrorOption[] = [
    { id: 'default', labelKey: 'mirrors.default', requiresApiKey: false },
    { id: 'kernelos', labelKey: 'mirrors.kernelos', requiresApiKey: false },
    // { id: 'manilua', labelKey: 'mirrors.maniluaUnderConstruction', requiresApiKey: true },
] as const;

type BasicBackendResponse = {
    success: boolean;
    message?: string;
    error?: string;
};

const normalizeBasicResponse = (raw: RawBackendResponse): BasicBackendResponse => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
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

const extractBooleanFromResponse = (raw: RawBackendResponse, fallback = false): boolean => {
    if (typeof raw === 'boolean') {
        return raw;
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        try {
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                raw = JSON.parse(trimmed) as RawBackendResponse;
            } else if (trimmed.toLowerCase() === 'true') {
                return true;
            } else if (trimmed.toLowerCase() === 'false') {
                return false;
            } else {
                return fallback;
            }
        } catch {
            return fallback;
        }
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.configured === 'boolean') return obj.configured;
        if (typeof obj.success === 'boolean') return obj.success;
        if (typeof obj.isValid === 'boolean') return obj.isValid;
        if (typeof obj.hasKey === 'boolean') return obj.hasKey;
    }

    if (typeof raw === 'boolean') {
        return raw;
    }

    return fallback;
};

const maskApiKey = (value: string): string => {
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

const getApiStatus = async (force = false): Promise<ApiStatus> => {
    if (force) apiState.checked = false;
    if (apiState.checked) return { ...apiState };

    try {
        const raw = await getManiluaApiStatusRpc();
        let data: unknown = raw;
        if (typeof raw === 'string') {
            const t = raw.trim();
            if (t.startsWith('{') && t.endsWith('}')) {
                try { data = JSON.parse(t); } catch { /* игнор, пойдём в fallback */ }
            }
        }

        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const obj = data as Record<string, unknown>;
            apiState.hasKey = obj.hasOwnProperty('hasKey')
                ? Boolean((obj as any).hasKey)
                : extractBooleanFromResponse(raw, false);
            apiState.isValid = obj.hasOwnProperty('isValid')
                ? (obj as any).isValid !== false
                : apiState.hasKey;
            apiState.maskedKey = typeof obj.maskedKey === 'string' ? (obj.maskedKey as string) : '';
            const msg = (obj as any).message ?? (obj as any).details;
            apiState.message = typeof msg === 'string' ? msg : undefined;
        } else {
            const hasKey = extractBooleanFromResponse(raw, false);
            apiState.hasKey = hasKey;
            apiState.isValid = hasKey;
            apiState.maskedKey = '';
            apiState.message = undefined;
        }
    } catch (error) {
        apiState.hasKey = false;
        apiState.isValid = false;
        apiState.maskedKey = '';
        apiState.message = error instanceof Error ? error.message : String(error);
    }
    apiState.checked = true;
    return { ...apiState };
};

const showApiKeyPrompt = async (): Promise<boolean> => {
    if (!document?.body) {
        return false;
    }

    return await new Promise<boolean>((resolve) => {
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
        const finish = (value: boolean) => {
            if (settled) {
                return;
            }
            settled = true;
            close();
            resolve(value);
        };

        const setHelperError = (message: string) => {
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
                } else {
                    input.style.borderColor = '#d94126';
                    setHelperError(result.error || result.message || t('auth.invalid'));
                }
            } catch (error) {
                input.style.borderColor = '#d94126';
                const message = error instanceof Error ? error.message : String(error);
                setHelperError(`${t('auth.error')}: ${message}`);
            } finally {
                saveButton.disabled = false;
                cancelButton.disabled = false;
                saveButton.textContent = t('auth.save');
            }
        };

        actions.appendChild(cancelButton);
        actions.appendChild(saveButton);

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
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




const ensureManiluaApiKey = async (): Promise<boolean> => {
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

const showMirrorSelectionModal = async (initial: MirrorId = (currentMirror ?? 'default')): Promise<MirrorId | null> => {
    if (!document?.body) return initial;

    const disabledMirrors = new Set<MirrorId>([]);
    return await new Promise<MirrorId | null>((resolve) => {
        const { dialog, content, actions, close } = createDialogShell(t('mirrors.title'));
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '6px';
        list.style.marginBottom = '12px';

        let selected: MirrorId = initial;

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
            if (isDisabled) row.style.opacity = '0.6';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'mirror-option';
            radio.value = option.id;
            radio.checked = option.id === selected;
            radio.disabled = isDisabled;
            if (!isDisabled) radio.addEventListener('change', () => (selected = option.id));

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
                if (isDisabled) return;
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
        const finish = (value: MirrorId | null) => {
            if (settled) return;
            settled = true;
            close();
            resolve(value);
        };

        cancelButton.onclick = (e) => { e.preventDefault(); finish(null); };

        confirmButton.onclick = async (e) => {
            e.preventDefault();
            const picked = MIRROR_OPTIONS.find(o => o.id === selected);
            if (!picked) return;
            if (disabledMirrors.has(picked.id)) {
                await presentMessage(t('mirrors.title'), t('mirrors.maniluaDisabled'));
                return;
            }
            if (picked.requiresApiKey) {
                if (picked.id === 'manilua') {
                    const ok = await ensureManiluaApiKey();
                    if (!ok) return;
                }
            }
            currentMirror = selected; // запоминаем только для предвыбора
            finish(selected);
        };

        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);

        dialog.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        });
    });
};

const ensureMirrorSelection = async (): Promise<MirrorId | null> => {
    return await showMirrorSelectionModal(currentMirror ?? 'default');
};

const normalizeDlcEntry = (entry: unknown): DlcEntry | null => {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    const appid = toNonEmptyString(obj.appid ?? obj['appid']);
    if (!appid) return null;
    const name = toNonEmptyString(obj.name ?? obj['name'], `DLC ${appid}`);
    const alreadyInstalled = Boolean(obj.alreadyInstalled ?? obj['alreadyInstalled']);
    return {
        appid,
        name,
        alreadyInstalled,
    };
};

const normalizeInstallResult = (raw: RawBackendResponse): BackendInstallResponse => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        const dlcRaw = Array.isArray(obj.dlc) ? obj.dlc : [];
        const dlc = dlcRaw.map(normalizeDlcEntry).filter((item): item is DlcEntry => item !== null);
        const success = Boolean(obj.success);
        const details = localizeBackendMessage(obj) || (success ? '' : t('errors.manifestMissing'));
        const appid = toNonEmptyString(obj.appid, undefined);
        return { success, details, dlc, appid };
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return normalizeInstallResult(parsed as RawBackendResponse);
        } catch {
            const lower = raw.toLowerCase().trim();
            if (lower === 'true') return { success: true, details: '', dlc: [] };
            if (lower === 'false') return { success: false, details: t('errors.manifestMissing'), dlc: [] };
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

const toIdArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => toNonEmptyString(item))
        .filter((item): item is string => Boolean(item));
};

const normalizeInstallDlcsResult = (raw: RawBackendResponse): BackendInstallDlcsResponse => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
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
            return normalizeInstallDlcsResult(parsed as RawBackendResponse);
        } catch {
            const lower = raw.toLowerCase().trim();
            if (lower === 'true') return { success: true, details: undefined, installed: [], failed: [] };
            if (lower === 'false') return { success: false, details: undefined, installed: [], failed: [] };
            return { success: false, details: raw, installed: [], failed: [] };
        }
    }

    if (typeof raw === 'boolean') {
        return { success: raw, details: undefined, installed: [], failed: [] };
    }

    return { success: false, details: undefined, installed: [], failed: [] };
};

const showDlcSelection = async (appId: string, dlcList: DlcEntry[], mirror: MirrorId, isEditMode: boolean = false): Promise<boolean> => {
    const normalized = dlcList.map(normalizeDlcEntry).filter((item): item is DlcEntry => item !== null);
    if (!normalized.length || !document.body) return false;

    return await new Promise<boolean>((resolve) => {
        const { dialog, content, actions, close } = createDialogShell(
            t('dialogs.selectDlc.title'),
            t('dialogs.selectDlc.subtitle')
        );

        content.style.margin = '0';

        const list = document.createElement('div');
        list.style.maxHeight = '40vh';
        list.style.overflowY = 'auto';
        list.style.margin = '16px 0';
        list.style.paddingRight = '8px';
        content.appendChild(list);

        const dlcCheckboxes: HTMLInputElement[] = [];

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
        const finish = (wasInstalled: boolean) => {
            if (settled) return;
            settled = true;
            close();
            resolve(wasInstalled);
        };

        const setDisabled = (state: boolean) => {
            confirmButton.disabled = state;
            if (state) {
                dialog.setAttribute('aria-busy', 'true');
            } else {
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
                } else {
                    progress.close('failure', 1200);
                    setDisabled(false);
                    await presentMessage(t('alerts.addingFailedTitle'), response.details || t('errors.failedAddSelectedDlc'));
                }
            } catch (error) {
                progress.close('failure', 1200);
                setDisabled(false);
                await presentMessage(
                    t('alerts.addingFailedTitle'),
                    t('common.errorWithMessage', { message: error instanceof Error ? error.message : String(error) })
                );
            }
        });

        cancelButton.addEventListener('click', () => finish(false));

        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);

        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            }
        };

        dialog.addEventListener('keydown', handleKey);

        masterCheckbox.addEventListener('change', () => {
            if (!dlcCheckboxes.length) return;
            dlcCheckboxes.forEach((input) => {
                input.checked = masterCheckbox.checked;
            });
            updateMasterState();
        });

        updateMasterState();
    });
};

const confirmBaseGameInstall = async (): Promise<boolean> => {
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
const throttle = <T extends (...args: any[]) => void>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= delay) {
            lastCall = now;
            func(...args);
        } else {
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
} as const;

const buttonLabel = (key: keyof typeof BUTTON_KEYS): string => `<span>${t(BUTTON_KEYS[key])}</span>`;

/**
 * Reset add button to initial state with appropriate label
 */
const resetAddButton = (button: HTMLButtonElement, isPirated: boolean): void => {
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
const promptSteamRestart = async (message: string, onRefreshButtons: () => Promise<void>): Promise<void> => {
    const restart = await presentConfirmation({
        title: t('dialogs.restart.title'),
        message: t('dialogs.restart.message', { details: message }),
        confirmLabel: t('dialogs.restart.confirm'),
        cancelLabel: t('dialogs.restart.cancel'),
    });

    if (restart) {
        await restartt();
    } else {
        await onRefreshButtons();
    }
};

/**
 * Handle DLC installation workflow (fetch list + show selection dialog)
 * @param appId Application ID
 * @param dlcList List of available DLC
 * @param onRefreshButtons Callback to refresh buttons after operation
 */
const handleDlcInstallation = async (
    appId: string,
    dlcList: DlcEntry[],
    onRefreshButtons: () => Promise<void>,
    mirror: MirrorId,
    isPirated: boolean
): Promise<void> => {
    const isEditMode = isPirated;
    const wasInstalled = await showDlcSelection(appId, dlcList, mirror, isEditMode);
    if (wasInstalled) {
        await promptSteamRestart(t('messages.changesApplied'), onRefreshButtons);
    } else {
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
const handleBaseGameInstallation = async (
    appId: string,
    addBtn: HTMLButtonElement,
    isPirated: boolean,
    onRefreshButtons: () => Promise<void>,
    mirror: MirrorId
): Promise<void> => {
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
        } else {
            progress.close('failure', 1200);
            await presentMessage(
                t('alerts.unableAddTitle'),
                installResult.details || t('errors.failedInstallBaseGame')
            );
            resetAddButton(addBtn, isPirated);
        }
    } catch (installErr) {
        const errorMessage = installErr instanceof Error ? installErr.message : String(installErr);
        progress.close('failure', 1200);
        await presentMessage(
            t('alerts.unableAddTitle'),
            t('common.errorWithMessage', { message: errorMessage })
        );
        resetAddButton(addBtn, isPirated);
    }
};

/**
 * Handle errors during add button operation
 */
const handleAddError = async (error: unknown, addBtn: HTMLButtonElement, isPirated: boolean): Promise<void> => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await presentMessage(
        t('alerts.unableGetDlcTitle'),
        t('common.errorWithMessage', { message: errorMessage })
    );
    resetAddButton(addBtn, isPirated);
};

export default async function WebkitMain() {
    await initI18n();

    if (!/^https:\/\/store\.steampowered\.com\/app\//.test(location.href)) return;

    const waitForEl = (selector: string, timeout = WAIT_FOR_ELEMENT_TIMEOUT) => new Promise((resolve, reject) => {
        const found = document.querySelector(selector);
        if (found) return resolve(found);
        const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error("timeout")); }, timeout);
    });

    const getAppId = (): string | null => {
        const match = location.href.match(/\/app\/(\d+)/);
        return match ? match[1] : null;
    };

    const insertButtons = async () => {
        try {
            const container = await waitForEl(CONTAINER_SELECTOR) as HTMLElement;
            renderCompatBadge(container);
            const appId = getAppId();
            if (!appId) return;

            const isPirated = await checkPirated({ id: appId });

            document.getElementById(ADD_BTN_ID)?.remove();
            document.getElementById(REMOVE_BTN_ID)?.remove();

            const addBtn = document.createElement("button");
            addBtn.id = ADD_BTN_ID;
            addBtn.type = "button";
            addBtn.style.marginRight = "3px";
            addBtn.className = "btnv6_blue_hoverfade btn_medium";
            if (isPirated) {
                const removeBtn = document.createElement("button");
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
                        } else {
                            progress.close('failure', 1200);
                            await presentMessage(t('alerts.unableRemoveTitle'), t('errors.failedRemoveGame'));
                            removeBtn.disabled = false;
                            removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                        }
                    } catch (err) {
                        progress.close('failure', 1200);
                        const message = err instanceof Error ? err.message : String(err);
                        await presentMessage(
                            t('alerts.unableRemoveTitle'),
                            t('common.errorWithMessage', { message })
                        );
                        removeBtn.disabled = false;
                        removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                    }
                });

                const last = container.lastElementChild;
                if (last) {
                    container.insertBefore(removeBtn, last);
                } else {
                    container.appendChild(removeBtn);
                }
                addBtn.innerHTML = buttonLabel('EDIT_DLC_LIBRARY');
            } else {
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
                        await presentMessage(
                            t('alerts.unableGetDlcTitle'),
                            dlcResult.details ?? t('errors.failedFetchInfo')
                        );
                        resetAddButton(addBtn, isPirated);
                        return;
                    }

                    if (dlcResult.dlc && dlcResult.dlc.length) {
                        await handleDlcInstallation(appId, dlcResult.dlc, insertButtons, mirror, isPirated);
                    } else if (!isPirated) {
                        await handleBaseGameInstallation(appId, addBtn, isPirated, insertButtons, mirror);
                    } else {
        await presentMessage(
            t('alerts.noDlcTitle'),
            t('messages.noDlcDetails')
        );
        resetAddButton(addBtn, isPirated);
                    }
                } catch (err) {
                    await handleAddError(err, addBtn, isPirated);
                } finally {
                    isBusy = false;
                }
            });

            const last = container.lastElementChild;
            if (last) {
                container.insertBefore(addBtn, last);
            } else {
                container.appendChild(addBtn);
            }
        } catch {
            setTimeout(insertButtons, RETRY_INSERT_DELAY_MS);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", insertButtons, { once: true });
    } else {
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
