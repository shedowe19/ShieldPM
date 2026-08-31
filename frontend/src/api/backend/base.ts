import { camelizeKeys, decamelize, decamelizeKeys } from "humps";
import queryString, { type StringifiableRecord } from "query-string";
import { queryClient } from "src/api/queryClient";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";

const contentTypeHeader = "Content-Type";

type DynamicResponse = unknown;

export class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
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
		return JSON.stringify(decamelizeKeys(data));
	}
}

async function processResponse<T = DynamicResponse>(response: Response, silentAuth = false): Promise<T> {
	let body = "";
	let payload: Record<string, any> = {};
	if (typeof response.text === "function") {
		body = await response.text();
	} else if (typeof response.json === "function") {
		payload = await response.json();
	}
	if (body) {
		try {
			payload = JSON.parse(body);
		} catch {
			// Reverse proxies may return HTML or text. Preserve the HTTP status and
			// avoid leaking an arbitrary upstream response into the application UI.
			payload = {};
		}
	}
	// Capture CSRF Token if present in response
	if (payload.csrfToken) {
		AuthStore.setCsrfToken(payload.csrfToken);
	}

	if (!response.ok) {
		if (response.status === 401) {
			// Clear stale client state and let AuthProvider render the login screen.
			AuthStore.clear();
			queryClient.clear();
			if (!silentAuth) {
				window.dispatchEvent(new Event(AUTHENTICATION_EXPIRED_EVENT));
			}
		}
		throw new ApiError(
			typeof payload.error?.messageI18n !== "undefined"
				? payload.error.messageI18n
				: payload.error?.message || response.statusText || `Request failed (${response.status})`,
			response.status,
		);
	}
	return camelizeKeys(payload) as unknown as T;
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
	headers?: Record<string, string>;
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
	return processResponse<T>(await baseGet(args, abortController), args.silentAuth);
}

async function throwDownloadError(response: Response, silentAuth = false): Promise<void> {
	if (!response.ok) {
		await processResponse(response, silentAuth);
	}
}

export async function download({ url, params, silentAuth }: GetArgs, filename = "download.file") {
	const headers = buildAuthHeader();
	const res = await fetch(buildUrl({ url, params }), { headers, credentials: "include" });
	await throwDownloadError(res, silentAuth);
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(u);
}

export async function downloadPost({ url, params, data, noAuth, silentAuth }: PostArgs, filename = "download.file") {
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
	await throwDownloadError(res, silentAuth);
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(u);
}

export async function post<T = DynamicResponse>(
	{ url, params, data, noAuth, silentAuth, rawKeys, headers: extraHeaders }: PostArgs,
	abortController?: AbortController,
): Promise<T> {
	const apiUrl = buildUrl({ url, params });
	const method = "POST";

	let headers: Record<string, string> = { ...extraHeaders };
	if (!noAuth) {
		headers = {
			...headers,
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
	return processResponse(response, silentAuth);
}

export async function put<T = DynamicResponse>(
	{ url, params, data, silentAuth }: PutArgs,
	abortController?: AbortController,
): Promise<T> {
	const apiUrl = buildUrl({ url, params });
	const method = "PUT";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data);
	const response = await fetch(apiUrl, { method, headers, body, signal, credentials: "include" });
	return processResponse(response, silentAuth);
}

export async function del<T = DynamicResponse>(
	{ url, params, silentAuth }: DeleteArgs,
	abortController?: AbortController,
): Promise<T> {
	const apiUrl = buildUrl({ url, params });
	const method = "DELETE";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal, credentials: "include" });
	return processResponse<T>(response, silentAuth);
}

export const apiClient = {
	get,
	post,
	put,
	delete: del,
	download,
	downloadPost,
};
