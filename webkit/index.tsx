// @ts-ignore
import { ShowMessageBox, callable } from '@steambrew/webkit';

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

const presentMessage = async (title: string, message: string) => {
    if (typeof ShowMessageBox === 'function') {
        await Promise.resolve(ShowMessageBox({ title, message }));
    } else {
        alert(message);
    }
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
        const details = toNonEmptyString(obj.details, success ? '' : 'Manifest not found on public mirrors. Please request manual access.');
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
            if (lower === 'false') return { success: false, details: 'Manifest not found on public mirrors. Please request manual access.', dlc: [] };
            return { success: false, details: raw, dlc: [] };
        }
    }

    if (typeof raw === 'boolean') {
        return {
            success: raw,
            details: raw ? '' : 'Manifest not found on public mirrors. Please request manual access.',
            dlc: [],
        };
    }

    return { success: false, details: 'Manifest not found on public mirrors. Please request manual access.', dlc: [] };
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

        const title = document.createElement('h2');
        title.textContent = 'Select DLC to add';
        title.style.margin = '0 0 8px 0';
        dialog.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.textContent = 'Select DLC to add. Uncheck any you don\'t want to add.';
        subtitle.style.marginTop = '0';
        subtitle.style.fontSize = '14px';
        subtitle.style.opacity = '0.85';
        dialog.appendChild(subtitle);

        const list = document.createElement('div');
        list.style.maxHeight = '40vh';
        list.style.overflowY = 'auto';
        list.style.margin = '16px 0';
        list.style.paddingRight = '8px';

        normalized.forEach((entry) => {
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

            const textContainer = document.createElement('div');
            const mainLine = document.createElement('div');
            mainLine.textContent = entry.name && entry.name.trim().length ? entry.name : 'DLC ' + entry.appid;
            const secondary = document.createElement('div');
            secondary.style.fontSize = '12px';
            secondary.style.opacity = '0.7';
            const parts: string[] = [];
            if (entry.alreadyInstalled) {
                parts.push('already added');
                checkbox.checked = true;
            }
            secondary.textContent = parts.join(' - ');
            textContainer.appendChild(mainLine);
            if (secondary.textContent) textContainer.appendChild(secondary);

            label.appendChild(checkbox);
            label.appendChild(textContainer);
            list.appendChild(label);
        });

        dialog.appendChild(list);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '12px';
        actions.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
        actions.style.marginTop = '16px';
        actions.style.paddingTop = '16px';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btnv6_lightblue_blue btn_medium';
        cancelButton.textContent = 'Cancel';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btnv6_blue_hoverfade btn_medium';
        confirmButton.textContent = 'Add selected/Remove unselected';

        let overlayClosed = false;
        const closeOverlay = (wasInstalled: boolean) => {
            if (overlayClosed) return;
            overlayClosed = true;
            try {
                overlay.remove();
            } catch {
                const parent = overlay.parentNode;
                if (parent) {
                    parent.removeChild(overlay);
                }
            }
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
            closeOverlay(false);
        });

        confirmButton.addEventListener('click', async () => {
            const inputs = Array.from(list.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
            const selected = inputs.filter((input) => input.checked).map((input) => input.value);

            setDisabled(true);
            try {
                const responseRaw = await installDlcsRpc({ appid: appId, dlcs: selected });
                const response = normalizeInstallDlcsResult(responseRaw);

                if (response.success) {
                    closeOverlay(true);
                } else {
                    setDisabled(false);
                    await presentMessage('Adding failed', response.details || 'Failed to adding selected DLC');
                }
            } catch (error) {
                setDisabled(false);
                await presentMessage('Adding failed', `Error: ${error instanceof Error ? error.message : error}`);
            }
        });

        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    });
};

const confirmBaseGameInstall = async (): Promise<boolean> => {
    return confirm('This game has no DLC. Do you want to add it to your library?');
};

export default function WebkitMain() {
    if (!/^https:\/\/store\.steampowered\.com\/app\//.test(location.href)) return;

    const ADD_BTN_ID = "add-app-to-library-btn";
    const REMOVE_BTN_ID = "remove-app-from-library-btn";

    const waitForEl = (selector: string, timeout = 20000) => new Promise((resolve, reject) => {
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
            const container = await waitForEl(".apphub_OtherSiteInfo") as HTMLElement;
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
                removeBtn.innerHTML = `<span>Remove from library</span>`;

                removeBtn.addEventListener("click", async (e) => {
                    e.preventDefault();

                    if (!confirm("Are you sure you want to remove this game from your library?")) {
                        return;
                    }

                    removeBtn.disabled = true;
                    removeBtn.innerHTML = `<span>Removing...</span>`;

                    try {
                        const success = await deletegame({ id: appId });
                        if (success) {
                            const restart = confirm("Game removed successfully! Steam needs to restart. Restart now?");
                            if (restart) {
                                await restartt();
                            } else {
                                await insertButtons();
                            }
                        } else {
                            await presentMessage("Unable to remove", "Failed to remove the game!");
                            removeBtn.disabled = false;
                            removeBtn.innerHTML = `<span>Remove from library</span>`;
                        }
                    } catch (err) {
                        await presentMessage("Unable to remove", "Error: " + (err?.message ?? err));
                        removeBtn.disabled = false;
                        removeBtn.innerHTML = `<span>Remove from library</span>`;
                    }
                });

                const last = container.lastElementChild;
                if (last) {
                    container.insertBefore(removeBtn, last);
                } else {
                    container.appendChild(removeBtn);
                }
                addBtn.innerHTML = `<span>Edit DLC library</span>`;
            } else {
                addBtn.innerHTML = `<span>Add to library</span>`;
            }
            addBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                addBtn.disabled = true;
                if (isPirated) {
                    addBtn.innerHTML = `<span>Loading...</span>`;
                } else {
                    addBtn.innerHTML = `<span>Loading...</span>`;
                }
                try {
                    // Get DLC list without downloading
                    const rawResult = await getDlcListRpc({ appid: appId });
                    const dlcResult = normalizeInstallResult(rawResult);

                    if (dlcResult.success && dlcResult.dlc && dlcResult.dlc.length) {
                        // Show DLC selection dialog
                        const wasInstalled = await showDlcSelection(appId, dlcResult.dlc);
                        // Only ask to restart if something was installed
                        if (wasInstalled) {
                            const restart = confirm("Do you want to restart Steam now?");
                            if (restart) {
                                await restartt();
                            } else {
                                await insertButtons();
                            }
                        } else {
                            // Cancel was clicked, just refresh buttons
                            await insertButtons();
                        }
                    } else if (dlcResult.success) {
                        if (!isPirated) {
                            const shouldInstall = await confirmBaseGameInstall();
                            if (!shouldInstall) {
                                addBtn.disabled = false;
                                addBtn.innerHTML = `<span>Add to library</span>`;
                                return;
                            }
                            addBtn.innerHTML = `<span>Adding...</span>`;
                            try {
                                const installRaw = await installDlcsRpc({ appid: appId, dlcs: [] });
                                const installResult = normalizeInstallDlcsResult(installRaw);
                                if (installResult.success) {
                                    const restart = confirm("Game added successfully! Steam needs to restart. Restart now?");
                                    if (restart) {
                                        await restartt();
                                    } else {
                                        await insertButtons();
                                    }
                                    return;
                                } else {
                                    await presentMessage("Unable to add game", installResult.details || "Failed to install the base game.");
                                }
                            } catch (installErr) {
                                const errorMessage = installErr instanceof Error ? installErr.message : String(installErr);
                                await presentMessage("Unable to add game", "Error: " + errorMessage);
                            }
                        } else {
                            await presentMessage("No DLC available", "This game has no DLC to install.");
                        }
                        addBtn.disabled = false;
                        if (isPirated) {
                            addBtn.innerHTML = `<span>Edit DLC library</span>`;
                        } else {
                            addBtn.innerHTML = `<span>Add to library</span>`;
                        }
                    } else {
                        await presentMessage("Unable to get DLC list", dlcResult.details ?? "Failed to fetch game information.");
                        addBtn.disabled = false;
                        if (isPirated) {
                            addBtn.innerHTML = `<span>Edit DLC library</span>`;
                        } else {
                            addBtn.innerHTML = `<span>Add to library</span>`;
                        }
                    }
                } catch (err) {
                    await presentMessage("Unable to get DLC list", "Error: " + (err?.message ?? err));
                    addBtn.disabled = false;
                    if (isPirated) {
                        addBtn.innerHTML = `<span>Edit DLC library</span>`;
                    } else {
                        addBtn.innerHTML = `<span>Add to library</span>`;
                    }
                }
            });

            const last = container.lastElementChild;
            if (last) {
                container.insertBefore(addBtn, last);
            } else {
                container.appendChild(addBtn);
            }
        } catch {
            setTimeout(insertButtons, 1000);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", insertButtons, { once: true });
    } else {
        insertButtons();
    }

    const keepAlive = new MutationObserver(() => {
        const appId = getAppId();
        if (appId && !document.getElementById(ADD_BTN_ID) && !document.getElementById(REMOVE_BTN_ID)) {
            insertButtons();
        }
    });

    keepAlive.observe(document.body, { childList: true, subtree: true });
}
