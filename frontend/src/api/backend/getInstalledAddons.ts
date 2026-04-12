import * as api from "./base";
import type { RegistryAddon } from "./getAddonRegistry";

export interface InstalledAddon extends RegistryAddon {
	installedAt: string;
	installedArch: string | null;
	binaryPath: string | null;
}

export async function getInstalledAddons(): Promise<InstalledAddon[]> {
	return await api.get<InstalledAddon[]>({ url: "/addons" });
}
