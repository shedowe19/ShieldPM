import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAddonRegistry } from "src/api/backend/getAddonRegistry";
import { getInstalledAddons } from "src/api/backend/getInstalledAddons";

export const ADDON_REGISTRY_KEY = ["addon-registry"] as const;
export const INSTALLED_ADDONS_KEY = ["installed-addons"] as const;

export function useAddonRegistry() {
	return useQuery({
		queryKey: ADDON_REGISTRY_KEY,
		queryFn: getAddonRegistry,
		staleTime: 5 * 60 * 1000,
		retry: 1,
	});
}

export function useInstalledAddons() {
	return useQuery({
		queryKey: INSTALLED_ADDONS_KEY,
		queryFn: getInstalledAddons,
		staleTime: 30 * 1000,
	});
}

export function useInvalidateAddons() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: INSTALLED_ADDONS_KEY });
		queryClient.invalidateQueries({ queryKey: ["addon-status"] });
	};
}
