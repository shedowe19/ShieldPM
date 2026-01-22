import { QueryClient } from "@tanstack/react-query";
import { camelizeKeys, decamelize, decamelizeKeys } from "humps";
import queryString, { type StringifiableRecord } from "query-string";
import AuthStore from "src/modules/AuthStore";

const queryClient = new QueryClient();
const contentTypeHeader = "Content-Type";

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

function buildBody(data?: Record<string, any>): string | undefined {
	if (data) {
		return JSON.stringify(decamelizeKeys(data));
	}
}

async function processResponse(response: Response, silentAuth = false) {
	const payload = await response.json();
	// Capture CSRF Token if present in response
	if (payload.csrfToken) {
		AuthStore.setCsrfToken(payload.csrfToken);
	}

	if (!response.ok) {
		if (response.status === 401) {
			// Force logout user and reload the page if Unauthorized
			AuthStore.clear();
			queryClient.clear();
			if (!silentAuth) {
				window.location.reload();
			}
		}
		throw new Error(
			typeof payload.error.messageI18n !== "undefined" ? payload.error.messageI18n : payload.error.message,
		);
	}
	return camelizeKeys(payload) as any;
}

interface GetArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	silentAuth?: boolean;
}

interface PostArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: any;
	noAuth?: boolean;
	silentAuth?: boolean;
}

interface PutArgs {
	url: string;
	params?: queryString.StringifiableRecord;
	data?: Record<string, any>;
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
	const response = await fetch(apiUrl, { method, headers, signal });
	return response;
}

export async function get(args: GetArgs, abortController?: AbortController) {
	return processResponse(await baseGet(args, abortController), args.silentAuth);
}

export async function download({ url, params }: GetArgs, filename = "download.file") {
	const headers = buildAuthHeader();
	const res = await fetch(buildUrl({ url, params }), { headers });
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(url);
}

export async function downloadPost({ url, params, data, noAuth }: PostArgs, filename = "download.file") {
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
		body = buildBody(data);
	}

	const res = await fetch(apiUrl, { method, headers, body });
	const bl = await res.blob();
	const u = window.URL.createObjectURL(bl);
	const a = document.createElement("a");
	a.href = u;
	a.download = filename;
	a.click();
	window.URL.revokeObjectURL(u);
}

export async function post({ url, params, data, noAuth, silentAuth }: PostArgs, abortController?: AbortController) {
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
		body = buildBody(data);
	}

	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response, silentAuth);
}

export async function put({ url, params, data, silentAuth }: PutArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "PUT";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const body = buildBody(data);
	const response = await fetch(apiUrl, { method, headers, body, signal });
	return processResponse(response, silentAuth);
}

export async function del({ url, params, silentAuth }: DeleteArgs, abortController?: AbortController) {
	const apiUrl = buildUrl({ url, params });
	const method = "DELETE";
	const headers = {
		...buildAuthHeader(),
		[contentTypeHeader]: "application/json",
	};
	const signal = abortController?.signal;
	const response = await fetch(apiUrl, { method, headers, signal });
	return processResponse(response, silentAuth);
}

export const apiClient = {
	get,
	post,
	put,
	delete: del,
	download,
	downloadPost,
};
