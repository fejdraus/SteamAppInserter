// @ts-ignore
import { ShowMessageBox, callable } from '@steambrew/webkit';
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

const getDlcListRpc = callable<[{ appid: string }], RawBackendResponse>('Backend.get_dlc_list');
const installDlcsRpc = callable<[{ appid: string; dlcs: string[] }], RawBackendResponse>('Backend.install_dlcs');
const deletegame = callable<[{ id: string }], boolean>('Backend.deletelua');
const checkPirated = callable<[{ id: string }], boolean>('Backend.checkpirated');
const restartt = callable<[], boolean>('Backend.restart');

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
        // Prevent accidental background clicks from doing anything.
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
        if (typeof ShowMessageBox === 'function') {
            await Promise.resolve(ShowMessageBox({ title, message }));
            return;
        }
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
        const details = toNonEmptyString(obj.details, success ? '' : t('errors.manifestMissing'));
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
            details: toNonEmptyString(obj.details),
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

const showDlcSelection = async (appId: string, dlcList: DlcEntry[]): Promise<boolean> => {
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
            const mainLine = document.createElement('div');
            mainLine.textContent = entry.name && entry.name.trim().length
                ? entry.name
                : t('labels.dlcWithId', { id: entry.appid });
            const secondary = document.createElement('div');
            secondary.style.fontSize = '12px';
            secondary.style.opacity = '0.7';
            const parts: string[] = [];
            if (entry.alreadyInstalled) {
                parts.push(t('dialogs.selectDlc.alreadyAdded'));
                checkbox.checked = true;
            }
            secondary.textContent = parts.join(' - ');
            textContainer.appendChild(mainLine);
            if (secondary.textContent) {
                textContainer.appendChild(secondary);
            }

            label.appendChild(checkbox);
            label.appendChild(textContainer);
            list.appendChild(label);

            checkbox.addEventListener('change', () => {
                updateMasterState();
            });

            // Skip adding a divider after the last item to avoid double borders with the list container.
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
            cancelButton.disabled = state;
            if (state) {
                dialog.setAttribute('aria-busy', 'true');
            } else {
                dialog.removeAttribute('aria-busy');
            }
        };

        cancelButton.addEventListener('click', () => {
            finish(false);
        });

        confirmButton.addEventListener('click', async () => {
            const selected = dlcCheckboxes.filter((input) => input.checked).map((input) => input.value);

            setDisabled(true);
            try {
                const responseRaw = await installDlcsRpc({ appid: appId, dlcs: selected });
                const response = normalizeInstallDlcsResult(responseRaw);

                if (response.success) {
                    finish(true);
                } else {
                    setDisabled(false);
                    await presentMessage(t('alerts.addingFailedTitle'), response.details || t('errors.failedAddSelectedDlc'));
                }
            } catch (error) {
                setDisabled(false);
                await presentMessage(
                    t('alerts.addingFailedTitle'),
                    t('common.errorWithMessage', { message: error instanceof Error ? error.message : String(error) })
                );
            }
        });

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
            // Schedule a delayed call if not already scheduled
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

// Constants
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
const handleDlcInstallation = async (appId: string, dlcList: DlcEntry[], onRefreshButtons: () => Promise<void>): Promise<void> => {
    const wasInstalled = await showDlcSelection(appId, dlcList);
    if (wasInstalled) {
        await promptSteamRestart(t('messages.changesApplied'), onRefreshButtons);
    } else {
        // Cancel was clicked, just refresh buttons
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
const handleBaseGameInstallation = async (appId: string, addBtn: HTMLButtonElement, isPirated: boolean, onRefreshButtons: () => Promise<void>): Promise<void> => {
    const shouldInstall = await confirmBaseGameInstall();
    if (!shouldInstall) {
        resetAddButton(addBtn, isPirated);
        return;
    }

    addBtn.innerHTML = buttonLabel('ADDING');
    try {
        const installRaw = await installDlcsRpc({ appid: appId, dlcs: [] });
        const installResult = normalizeInstallDlcsResult(installRaw);
        if (installResult.success) {
            await promptSteamRestart(t('messages.gameAdded'), onRefreshButtons);
        } else {
            await presentMessage(
                t('alerts.unableAddTitle'),
                installResult.details || t('errors.failedInstallBaseGame')
            );
            resetAddButton(addBtn, isPirated);
        }
    } catch (installErr) {
        const errorMessage = installErr instanceof Error ? installErr.message : String(installErr);
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

                    try {
                        const success = await deletegame({ id: appId });
                        if (success) {
                            await promptSteamRestart(t('messages.gameRemoved'), insertButtons);
                        } else {
                            await presentMessage(t('alerts.unableRemoveTitle'), t('errors.failedRemoveGame'));
                            removeBtn.disabled = false;
                            removeBtn.innerHTML = buttonLabel('REMOVE_FROM_LIBRARY');
                        }
                    } catch (err) {
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
                addBtn.disabled = true;
                addBtn.innerHTML = buttonLabel('LOADING');

                try {
                    // Get DLC list without downloading
                    const rawResult = await getDlcListRpc({ appid: appId });
                    const dlcResult = normalizeInstallResult(rawResult);

                    if (!dlcResult.success) {
                        // Failed to fetch DLC list
                        await presentMessage(
                            t('alerts.unableGetDlcTitle'),
                            dlcResult.details ?? t('errors.failedFetchInfo')
                        );
                        resetAddButton(addBtn, isPirated);
                        return;
                    }

                    // Success - check if game has DLC
                    if (dlcResult.dlc && dlcResult.dlc.length) {
                        // Game has DLC - show selection dialog
                        await handleDlcInstallation(appId, dlcResult.dlc, insertButtons);
                    } else if (!isPirated) {
                        // No DLC and game not installed - offer base game installation
                        await handleBaseGameInstallation(appId, addBtn, isPirated, insertButtons);
                    } else {
                        // No DLC and game already installed - show message
                        await presentMessage(
                            t('alerts.noDlcTitle'),
                            t('messages.noDlcDetails')
                        );
                        resetAddButton(addBtn, isPirated);
                    }
                } catch (err) {
                    await handleAddError(err, addBtn, isPirated);
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

    // Throttle MutationObserver callback to prevent excessive calls
    const throttledInsertCheck = throttle(() => {
        const appId = getAppId();
        if (appId && !document.getElementById(ADD_BTN_ID) && !document.getElementById(REMOVE_BTN_ID)) {
            insertButtons();
        }
    }, MUTATION_OBSERVER_THROTTLE_MS);

    const keepAlive = new MutationObserver(throttledInsertCheck);

    keepAlive.observe(document.body, { childList: true, subtree: true });
}
