import * as api from "./base";

export interface FirewallGeoipStatus {
	available: boolean;
	moduleEnabled: boolean;
	databasePresent: boolean;
	reason: null | "module_disabled" | "database_missing" | "country_variable_missing" | "configuration_unavailable";
	asn: FirewallAsnStatus;
}

export interface FirewallAsnStatus {
	available: boolean;
	moduleEnabled: boolean;
	databasePresent: boolean;
	reason: null | "module_disabled" | "database_missing" | "asn_variable_missing" | "configuration_unavailable";
}

export function getFirewallGeoipStatus(): Promise<FirewallGeoipStatus> {
	return api.get({ url: "/nginx/firewall-lists/geoip" });
}
