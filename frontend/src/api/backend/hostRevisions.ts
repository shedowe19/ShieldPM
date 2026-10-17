import { get, post } from "./base";

export interface HostRevision {
	id: number;
	hostId: number;
	actorUserId: number | null;
	action: string;
	createdOn: string;
	fingerprint: string;
}
export interface HostRevisionPlan {
	revision: HostRevision;
	expectedFingerprint: string;
	changes: { field: string; before: unknown; after: unknown }[];
	configuration: { currentSha256: string; targetSha256: string };
	target: Record<string, unknown>;
}
export const getHostRevisions = (hostId: number, signal?: AbortSignal) =>
	get<HostRevision[]>({ url: `/nginx/proxy-hosts/${hostId}/revisions` }, signal ? { signal } : undefined);
export const getHostRevisionPlan = (hostId: number, revisionId: number, signal?: AbortSignal) =>
	get<HostRevisionPlan>(
		{ url: `/nginx/proxy-hosts/${hostId}/revisions/${revisionId}/plan` },
		signal ? { signal } : undefined,
	);
export const restoreHostRevision = (hostId: number, revisionId: number, expectedFingerprint: string) =>
	post<HostRevision>({
		url: `/nginx/proxy-hosts/${hostId}/revisions/${revisionId}/restore`,
		data: { expectedFingerprint },
	});
