import { useQuery } from "@tanstack/react-query";
import { getAddonStatus } from "src/api/backend/getAddonStatus";
import type { AddonStatus } from "src/api/backend/getAddonStatus";

export const ADDON_STATUS_QUERY_KEY = ["addon-status"] as const;

/**
 * Returns which optional features are available on this system.
 * Cached for 5 minutes — addon installs/uninstalls invalidate this query.
 */
export function useAddonStatus() {
	return useQuery<AddonStatus>({
		queryKey: ADDON_STATUS_QUERY_KEY,
		queryFn: getAddonStatus,
		staleTime: 5 * 60 * 1000,
		retry: false,
		// Return a safe "all disabled" default while loading so items don't flash visible
		placeholderData: {
			anubis: false,
			cloudflared: false,
			wireguard: false,
			tor: false,
			oauth2Proxy: false,
		},
	});
}
