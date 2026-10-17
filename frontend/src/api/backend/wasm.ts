import * as api from "./base";

export type WasmFilterKind = "api_key" | "request_header" | "response_header" | "local_response";
export interface WasmFilter {
	id: string;
	kind: WasmFilterKind;
	enabled: boolean;
	failureMode: "closed" | "open";
	config: {
		header?: string;
		value?: string;
		hasSecret?: boolean;
		operation?: "set" | "remove";
		status?: number;
		body?: string;
	};
}
export interface WasmCapability {
	available: boolean;
	built?: boolean;
	installed?: boolean;
	configured?: boolean;
	nginxVersion?: string | null;
	moduleVersion?: string | null;
	runtimeVersion?: string | null;
	state: "unverified" | "functional" | "error";
	checkedAt: string | null;
	version: string;
	sha256: string;
	module: string;
	abi: string;
	trustedOnly: boolean;
}
export interface WasmHostStatus {
	state: "inactive" | "validated" | "active" | "error";
	checkedAt: string | number | null;
	version?: string;
	sha256?: string;
	filterCount?: number;
	filterId?: string;
	phase?: string;
	message?: string;
}
export const getWasmCapability = (signal?: AbortSignal): Promise<WasmCapability> =>
	api.get({ url: "/nginx/wasm" }, signal ? { signal } : undefined);
export const testWasmCapability = (): Promise<WasmCapability> => api.post({ url: "/nginx/wasm/self-test", data: {} });
export const getWasmHostStatus = (id: number, signal?: AbortSignal): Promise<WasmHostStatus> =>
	api.get({ url: `/nginx/wasm/hosts/${id}` }, signal ? { signal } : undefined);
