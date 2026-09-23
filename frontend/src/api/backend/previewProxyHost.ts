import * as api from "./base";

export interface ProxyHostConfigPreview {
	config: string;
	diff: string;
	hasCurrent: boolean;
	nginxValidated: false;
	limitations: Array<"render-only" | "id-pending" | "certificate-pending">;
}

/** Preview uses the same payload as a create/update, but never persists it. */
export async function previewProxyHost<T extends object & { id?: number }>(item: T): Promise<ProxyHostConfigPreview> {
	const { id, ...data } = item;
	return api.post<ProxyHostConfigPreview>({
		url: id ? `/nginx/proxy-hosts/${id}/preview` : "/nginx/proxy-hosts/preview",
		data,
	});
}
