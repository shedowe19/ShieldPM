import { useQuery } from "@tanstack/react-query";
import { getFirewallGeoipStatus } from "src/api/backend/firewallGeoip";

export function useFirewallGeoip(options: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: ["firewall-geoip"],
		queryFn: getFirewallGeoipStatus,
		staleTime: 30 * 1000,
		retry: false,
		...options,
	});
}
