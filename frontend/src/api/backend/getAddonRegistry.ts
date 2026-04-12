import * as api from "./base";

export interface RegistryAddon {
	id: string;
	name: string;
	version: string;
	type: "binary" | "apt";
	category: string;
	description: string;
	author: string;
	url: string;
	requiresRestart: boolean;
	requiresCapabilities: string[];
	requiresDevices?: string[];
	requiresSysctls?: Record<string, string>;
	installNote?: string;
	// binary-type fields
	binaryName?: string;
	archiveType?: string;
	binaries?: Record<string, string>;
	binaryExtractPath?: string;
	// apt-type fields
	aptPackages?: string[];
	changelog?: Record<string, string>;
}

export interface AddonRegistry {
	version: string;
	updatedAt: string;
	addons: RegistryAddon[];
}

export async function getAddonRegistry(): Promise<AddonRegistry> {
	return await api.get<AddonRegistry>({ url: "/addons/registry" });
}
