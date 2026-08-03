import { useQuery } from "@tanstack/react-query";
import { getFirewallPolicies, type FirewallPolicy } from "src/api/backend";

const fetchFirewallPolicies = () => getFirewallPolicies();

const useFirewallPolicies = (options = {}) =>
	useQuery<FirewallPolicy[], Error>({
		queryKey: ["firewall-policies"],
		queryFn: fetchFirewallPolicies,
		staleTime: 60 * 1000,
		...options,
	});

export { fetchFirewallPolicies, useFirewallPolicies };
