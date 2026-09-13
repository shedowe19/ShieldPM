import { serializeMaintenanceDateTime } from "src/lib/maintenanceDateTime";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

export type ProxyHostPayload = Omit<ProxyHostFormValues, "crowdsecEnabled" | "advLimitReqRate" | "advLimitReqBurst"> & {
	id?: number;
	advLimitReqRate?: number | null;
	advLimitReqBurst?: number | null;
};

type CreateProxyHostPayloadParams = {
	id: number | "new";
	values: ProxyHostFormValues;
};

const normalizeRateLimit = (value: number | string | undefined): number | null | undefined => {
	// An explicit null clears a saved limit; undefined would disappear from the update request.
	if (typeof value === "string" && value.trim() === "") {
		return null;
	}
	if (value === undefined || !Number.isFinite(Number(value))) {
		return undefined;
	}
	return Number(value);
};

export const createProxyHostPayload = ({ id, values }: CreateProxyHostPayloadParams): ProxyHostPayload => {
	const { crowdsecEnabled, advLimitReqRate, advLimitReqBurst, ...rest } = values;
	const payload: ProxyHostPayload = {
		...rest,
		advLimitReqRate: normalizeRateLimit(advLimitReqRate),
		advLimitReqBurst: normalizeRateLimit(advLimitReqBurst),
		maintenanceStart: serializeMaintenanceDateTime(values.maintenanceStart),
		maintenanceEnd: serializeMaintenanceDateTime(values.maintenanceEnd),
	};

	if (typeof crowdsecEnabled !== "undefined") {
		payload.securityCrowdsec = crowdsecEnabled;
	}

	for (const field of ["gitCredentials", "terminalPassword", "terminalPrivateKey"] as const) {
		if (payload[field] === "") {
			delete payload[field];
		}
	}

	return {
		id: id === "new" ? undefined : id,
		...payload,
	};
};
