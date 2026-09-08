import { camelize, decamelize } from "humps";
import queryString, { type StringifiableRecord } from "query-string";
import { queryClient } from "src/api/queryClient";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";

const contentTypeHeader = "Content-Type";

type DynamicResponse = unknown;

function convertKeys(value: unknown, convert: (key: string) => string): unknown {
	if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert));
	if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			convert(key),
			// Header names are data, not API field names. Renaming them changes Anubis rules.
			["headers", "headers_regex", "headersRegex"].includes(key) ? item : convertKeys(item, convert),
		]),
	);
}

interface BuildUrlArgs {
	url: string;
	params?: StringifiableRecord;
}

function decamelizeParams(params?: StringifiableRecord): StringifiableRecord | undefined {
	if (!params) {
		return undefined;
	}
	const result: StringifiableRecord = {};
	for (const [key, value] of Object.entries(params)) {
		result[decamelize(key)] = value;
	}

	return result;
}

function buildUrl({ url, params }: BuildUrlArgs) {
	const endpoint = url.replace(/^\/|\/$/g, "");
	const baseUrl = `/api/${endpoint}`;
	const apiUrl = queryString.stringifyUrl({
		url: baseUrl,
		query: decamelizeParams(params),
	});
	return apiUrl;
}

function buildAuthHeader(): Record<string, string> | undefined {
	const csrfToken = AuthStore.csrfToken;
	if (csrfToken) {
		return {
			"X-XSRF-TOKEN": csrfToken,
		};
	}
	return {};
}

function buildBody(data?: object): string | undefined {
	if (data) {
		return JSON.stringify(convertKeys(data, decamelize));
	}
}

async function processResponse<T = DynamicResponse>(
	response: Response,
	sessionRevision: number,
	silentAuth = false,
	rawResponse = false,
): Promise<T> {
	if (response.status === 401 && sessionRevision === AuthStore.sessionRevision) {
		// Authentication must expire even when a proxy returns HTML or an empty body.
		AuthStore.clear();
		queryClient.clear();
		if (!silentAuth) {
			window.dispatchEvent(new Event(AUTHENTICATION_EXPIRED_EVENT));
		}
	}

	// Logout and several DELETE endpoints intentionally return no response body.
	if (response.ok && (response.status === 204 || response.status === 205)) {
		return undefined as T;
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		if (response.ok) {
			throw error;
		}
	}
	const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
	// Capture CSRF Token if present in response
	if (sessionRevision === AuthStore.sessionRevision && typeof record?.csrfToken === "string" && record.csrfToken) {
		AuthStore.setCsrfToken(record.csrfToken);
	}

	if (!response.ok) {
		const details = record?.error;
		const error = details && typeof details === "object" ? (details as Record<string, unknown>) : undefined;
		const message = [error?.messageI18n, error?.message, record?.message].find(
			(value): value is string => typeof value === "string" && value.length > 0,
		);
		throw new Error(message || `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
	}
	return (rawResponse ? payload : convertKeys(payload, camelize)) as T;
}

interface GetArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	silentAuth?: boolean;
}

interface PostArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: object | FormData;
	noAuth?: boolean;
	silentAuth?: boolean;
	/** Skip key decamelization — required for WebAuthn payloads where key casing matters */
	rawKeys?: boolean;
	/** Preserve response keys that represent data, such as domain names. */
	rawResponse?: boolean;
}

interface PutArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: object;
	silentAuth?: boolean;
}

interface DeleteArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	silentAuth?: boolean;
}

async function baseGet({ url, params }: GetArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "GET";
	const headers = buildAuthHeader();
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal, credentials: "include" });
	return response;
}

export async function get<T = DynamicResponse>(args: GetArgs, abortController?: AbortController): Promise<T> {
	const sessionRevision = AuthStore.sessionRevision;
	return processResponse<T>(await baseGet(args, abortController), sessionRevision, args.silentAuth);
}

async function throwDownloadError(response: Response, sessionRevision: number, silentAuth = false): Promise<void> {
	if (!response.ok) {
		await processResponse(response, sessionRevision, silentAuth);
	}
}

export async function download({ url, params, silentAuth }: GetArgs, filename = "download.file") {
	const sessionRevision = AuthStore.sessionRevision;
	const headers = buildAuthHeader();
	const res = await fetch(buildUrl({ url, params }), { headers, credentials: "include" });
	await throwDownloadError(res, sessionRevision, silentAuth);
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(u);
}

export async function downloadPost({ url, params, data, noAuth, silentAuth }: PostArgs, filename = "download.file") {
	const sessionRevision = AuthStore.sessionRevision;
	const apiUrl = buildUrl({ url, params });
	const method = "POST";

	let headers: Record<string, string> = {};
	if (!noAuth) {
		headers = {
			...buildAuthHeader(),
		};
	}

	let body: string | FormData | undefined;
	// Check if the data is an instance of FormData
	// If data is FormData, let the browser set the Content-Type header
	if (data instanceof FormData) {
		body = data;
	} else {
		// If data is JSON, set the Content-Type header to 'application/json'
		headers = {
			...headers,
			[contentTypeHeader]: "application/json",
		};
		body = buildBody(data as Record<string, unknown>);
	}

	const res = await fetch(apiUrl, { method, headers, body, credentials: "include" });
	await throwDownloadError(res, sessionRevision, silentAuth);
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(u);
}

export async function post<T = DynamicResponse>(
	{ url, params, data, noAuth, silentAuth, rawKeys, rawResponse }: PostArgs,
	abortController?: AbortController,
): Promise<T> {
	const sessionRevision = AuthStore.sessionRevision;
	const apiUrl = buildUrl({ url, params });
	const method = "POST";

	let headers: Record<string, string> = {};
	if (!noAuth) {
		headers = {
			...buildAuthHeader(),
		};
	}

	let body: string | FormData | undefined;
	// Check if the data is an instance of FormData
	// If data is FormData, let the browser set the Content-Type header
	if (data instanceof FormData) {
		body = data;
	} else {
		// If data is JSON, set the Content-Type header to 'application/json'
		headers = {
			...headers,
			[contentTypeHeader]: "application/json",
		};
		body = rawKeys && data ? JSON.stringify(data) : buildBody(data as Record<string, unknown>);
	}

	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, body, signal, credentials: "include" });
	return processResponse(response, sessionRevision, silentAuth, rawResponse);
}

export async function put<T = DynamicResponse>(
	{ url, params, data, silentAuth }: PutArgs,
	abortController?: AbortController,
): Promise<T> {
	const sessionRevision = AuthStore.sessionRevision;
	const apiUrl = buildUrl({ url, params });
	const method = "PUT";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data);
	const response = await fetch(apiUrl, { method, headers, body, signal, credentials: "include" });
	return processResponse(response, sessionRevision, silentAuth);
}

export async function del<T = DynamicResponse>(
	{ url, params, silentAuth }: DeleteArgs,
	abortController?: AbortController,
): Promise<T> {
	const sessionRevision = AuthStore.sessionRevision;
	const apiUrl = buildUrl({ url, params });
	const method = "DELETE";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal, credentials: "include" });
	return processResponse<T>(response, sessionRevision, silentAuth);
}

export const apiClient = {
	get,
	post,
	put,
	delete: del,
	download,
	downloadPost,
};
