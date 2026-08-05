import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

export type ProxyHostPayload = Omit<ProxyHostFormValues, "crowdsecEnabled"> & { id?: number };

type CreateProxyHostPayloadParams = {
	canManageFirewallPolicies: boolean;
	id: number | "new";
	values: ProxyHostFormValues;
};

export const createProxyHostPayload = ({
	canManageFirewallPolicies,
	id,
	values,
}: CreateProxyHostPayloadParams): ProxyHostPayload => {
	const { crowdsecEnabled, ...payload } = { ...values };

	if (!canManageFirewallPolicies) {
		delete payload.firewallPolicyId;
	}

	if (payload.advLimitReqRate === "" || Number.isNaN(Number(payload.advLimitReqRate))) {
		payload.advLimitReqRate = undefined;
	}
	if (payload.advLimitReqBurst === "" || Number.isNaN(Number(payload.advLimitReqBurst))) {
		payload.advLimitReqBurst = undefined;
	}

	if (typeof crowdsecEnabled !== "undefined") {
		payload.securityCrowdsec = crowdsecEnabled;
	}

	if (payload.gitCredentials === "") {
		delete payload.gitCredentials;
	}

	return {
		id: id === "new" ? undefined : id,
		...payload,
	};
};
