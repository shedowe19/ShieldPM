import * as api from "./base";
import type { WasiApplication } from "./wasiApplications";

export type WasmFilterKind =
	| "api_key"
	| "request_header"
	| "response_header"
	| "local_response"
	| "module"
	| "application";
export interface WasmApplicationSettings {
	args?: string[];
	env?: { name: string; value: string }[];
	timeoutMs?: number;
}
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
		moduleId?: string;
		configuration?: Record<string, unknown>;
		hasConfiguration?: boolean;
		applicationId?: string;
		mode?: "filter" | "handler";
		protocol?: "stdio" | "http-json-v1";
		settings?: WasmApplicationSettings;
		hasSettings?: boolean;
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

export interface WasmModule {
	id: string;
	name: string;
	filename: string;
	sha256: string;
	size: number;
	abi: string;
	createdOn: string;
}
export const WASM_MODULE_MAX_BYTES = 16 * 1024 * 1024;
export type WasmArtifact =
	| { runtime: "proxy-wasm"; artifact: WasmModule }
	| { runtime: "wasi-preview1"; artifact: WasiApplication };
export const getWasmArtifacts = (signal?: AbortSignal): Promise<WasmArtifact[]> =>
	api.get({ url: "/nginx/wasm/artifacts" }, signal ? { signal } : undefined);
export const uploadWasmArtifact = ({ file, name }: { file: File; name: string }): Promise<WasmArtifact> =>
	api.post({
		url: "/nginx/wasm/artifacts",
		params: { name, filename: file.name },
		rawBody: file,
		contentType: "application/wasm",
	});
export const getWasmModules = (signal?: AbortSignal): Promise<WasmModule[]> =>
	api.get({ url: "/nginx/wasm/modules" }, signal ? { signal } : undefined);
export const uploadWasmModule = ({ file, name }: { file: File; name: string }): Promise<WasmModule> =>
	api.post({
		url: "/nginx/wasm/modules",
		params: { name, filename: file.name },
		rawBody: file,
		contentType: "application/wasm",
	});
