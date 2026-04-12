import * as api from "./base";
import type { RegistryAddon } from "./getAddonRegistry";

export async function installAddon(id: string, manifest: RegistryAddon): Promise<{ installed: boolean; binaryPath: string | null }> {
	return await api.post({ url: `/addons/${id}/install`, data: manifest as unknown as object });
}

export async function uninstallAddon(id: string): Promise<{ uninstalled: boolean }> {
	return await api.del({ url: `/addons/${id}` });
}

export async function updateAddon(id: string): Promise<{ updated: boolean; from?: string; to: string; reason?: string }> {
	return await api.post({ url: `/addons/${id}/update` });
}

export async function updateAllAddons(): Promise<Array<{ id: string; updated: boolean; from?: string; to?: string; error?: string }>> {
	return await api.post({ url: "/addons/update-all" });
}
