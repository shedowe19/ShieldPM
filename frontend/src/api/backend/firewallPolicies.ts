import * as api from "./base";
import type { FirewallPolicy } from "./models";

export async function getFirewallPolicies(): Promise<FirewallPolicy[]> {
	return await api.get({ url: "/nginx/firewall-policies" });
}

export async function createFirewallPolicy(payload: Partial<FirewallPolicy>): Promise<FirewallPolicy> {
	return await api.post({ url: "/nginx/firewall-policies", data: payload });
}

export async function updateFirewallPolicy(id: number, payload: Partial<FirewallPolicy>): Promise<FirewallPolicy> {
	return await api.put({ url: `/nginx/firewall-policies/${id}`, data: payload });
}

export async function deleteFirewallPolicy(id: number): Promise<boolean> {
	return await api.del({ url: `/nginx/firewall-policies/${id}` });
}

export async function refreshFirewallPolicy(id: number): Promise<FirewallPolicy> {
	return await api.post({ url: `/nginx/firewall-policies/${id}/refresh` });
}
