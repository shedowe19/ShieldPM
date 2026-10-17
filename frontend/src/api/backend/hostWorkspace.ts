import * as api from "./base";
export type HostView = {
	query?: string;
	tags?: string[];
	enabled?: boolean;
	monitor?: string;
	certificateDays?: number;
};
export type WorkspaceHost = { id: number; enabled: boolean; domainNames: string[]; tags: string[] };
export type WorkspaceItem = {
	id: number;
	kind: "view" | "profile";
	name: string;
	definition: HostView & { settings?: Record<string, unknown> };
};
export type BulkPreview = {
	plan: string | null;
	results: {
		id: number;
		ready: boolean;
		error?: string;
		before?: Record<string, unknown>;
		after?: Record<string, unknown>;
	}[];
};
export type BulkResult = { activated: boolean; results: { id: number; success: boolean; error?: string }[] };
const url = "/nginx/host-workspace";
export const getWorkspaceHosts = (
	filters: HostView,
	page = 1,
	signal?: AbortSignal,
): Promise<{ items: WorkspaceHost[]; pagination: { totalPages: number; totalItems: number } }> =>
	api.get(
		{ url: `${url}/hosts`, params: { ...filters, tags: filters.tags?.join(","), page, limit: 100 } },
		signal ? { signal } : undefined,
	);
export const getWorkspaceItems = (signal?: AbortSignal): Promise<WorkspaceItem[]> =>
	api.get({ url: `${url}/items` }, signal ? { signal } : undefined);
export const saveWorkspaceItem = (data: Omit<WorkspaceItem, "id">, id?: number): Promise<WorkspaceItem> =>
	id ? api.put({ url: `${url}/items/${id}`, data }) : api.post({ url: `${url}/items`, data });
export const removeWorkspaceItem = (item: WorkspaceItem) =>
	api.del({ url: `${url}/items/${item.id}`, params: { kind: item.kind } });
export const setWorkspaceTags = (id: number, tags: string[]) =>
	api.put({ url: `${url}/hosts/${id}/tags`, data: { tags } });
export const previewHostProfile = (profileId: number, hostIds: number[]): Promise<BulkPreview> =>
	api.post({ url: `${url}/bulk/preview`, data: { profileId, hostIds } });
export const applyHostProfile = (plan: string): Promise<BulkResult> =>
	api.post({ url: `${url}/bulk/apply`, data: { plan } });
export const getHostOptions = (signal?: AbortSignal): Promise<{ id: number; domainNames: string[] }[]> =>
	api.get({ url: `${url}/options` }, signal ? { signal } : undefined);
