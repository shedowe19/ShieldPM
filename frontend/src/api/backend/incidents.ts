import * as api from "./base";

export interface IncidentHost {
	id: number;
	domainNames: string[];
	enabled: boolean;
	owned: boolean;
}
export interface Incident {
	id: number;
	hostId: number;
	openedAt: string;
	resolvedAt: string | null;
	lastSeenAt: string;
	resolution: string | null;
	failureCount: number;
	message: string;
}
export interface DailyAvailability {
	day: string;
	upMs: number;
	downMs: number;
	unknownMs: number;
	coveragePercent: number;
	uptimePercent: number | null;
	checks: number;
}
export interface LatencyBucket {
	bucket: string;
	samples: number;
	avgMs: number;
	minMs: number;
	maxMs: number;
}
export interface AlarmMute {
	startsAt: string;
	endsAt: string;
	reason: string;
}
export interface IncidentDetail {
	hostId: number;
	daily: DailyAvailability[];
	latency: LatencyBucket[];
	mute: AlarmMute | null;
	current: { state: string; checkedAt: string } | null;
}
export interface NotificationTarget {
	id: number;
	name: string;
	type: "webhook" | "ntfy" | "discord";
	enabled: boolean;
	hostIds: number[];
	hasCredentials: boolean;
	version: number;
}
export interface NotificationTargetInput {
	name: string;
	type: NotificationTarget["type"];
	enabled: boolean;
	hostIds: number[];
	url?: string;
	token?: string;
	version?: number;
}
export interface NotificationDelivery {
	id: number;
	targetId: number;
	targetName: string;
	incidentId: number;
	hostId: number;
	event: string;
	status: string;
	attempts: number;
	nextAttemptAt: string;
	lastError: string | null;
	createdOn: string;
	sentAt: string | null;
}
export const getIncidentHosts = (signal?: AbortSignal): Promise<IncidentHost[]> =>
	api.get({ url: "/incidents/hosts" }, signal ? { signal } : undefined);
export const getIncidents = (
	hostId?: number,
	status = "all",
	before?: number,
	signal?: AbortSignal,
): Promise<Incident[]> =>
	api.get({ url: "/incidents", params: { hostId, status, before } }, signal ? { signal } : undefined);
export const getIncidentDetail = (hostId: number, days: number, signal?: AbortSignal): Promise<IncidentDetail> =>
	api.get({ url: `/incidents/hosts/${hostId}`, params: { days } }, signal ? { signal } : undefined);
export const setAlarmMute = (hostId: number, mute: AlarmMute | null): Promise<AlarmMute | null> =>
	api.put({ url: `/incidents/hosts/${hostId}/mute`, data: mute || { clear: true } });
export const getNotificationTargets = (signal?: AbortSignal): Promise<NotificationTarget[]> =>
	api.get({ url: "/incidents/targets" }, signal ? { signal } : undefined);
export const saveNotificationTarget = (
	id: number | undefined,
	data: NotificationTargetInput,
): Promise<NotificationTarget> =>
	id ? api.put({ url: `/incidents/targets/${id}`, data }) : api.post({ url: "/incidents/targets", data });
export const deleteNotificationTarget = (id: number): Promise<{ success: boolean }> =>
	api.del({ url: `/incidents/targets/${id}` });
export const getNotificationDeliveries = (signal?: AbortSignal): Promise<NotificationDelivery[]> =>
	api.get({ url: "/incidents/deliveries" }, signal ? { signal } : undefined);
export const retryNotificationDelivery = (id: number): Promise<{ success: boolean }> =>
	api.post({ url: `/incidents/deliveries/${id}/retry`, data: {} });
