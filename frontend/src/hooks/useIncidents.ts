import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type AlarmMute,
	deleteNotificationTarget,
	getIncidentDetail,
	getIncidentHosts,
	getIncidents,
	getNotificationDeliveries,
	getNotificationTargets,
	type NotificationTargetInput,
	retryNotificationDelivery,
	saveNotificationTarget,
	setAlarmMute,
} from "src/api/backend/incidents";

export function useIncidentCenter(hostId?: number, status = "all", days = 30, before?: number) {
	return {
		hosts: useQuery({ queryKey: ["incident-center", "hosts"], queryFn: ({ signal }) => getIncidentHosts(signal) }),
		incidents: useQuery({
			queryKey: ["incident-center", "incidents", hostId, status, before],
			queryFn: ({ signal }) => getIncidents(hostId, status, before, signal),
			refetchInterval: 30_000,
		}),
		detail: useQuery({
			queryKey: ["incident-center", "detail", hostId, days],
			queryFn: ({ signal }) => getIncidentDetail(hostId as number, days, signal),
			enabled: Boolean(hostId),
			refetchInterval: 30_000,
		}),
		targets: useQuery({
			queryKey: ["incident-center", "targets"],
			queryFn: ({ signal }) => getNotificationTargets(signal),
		}),
		deliveries: useQuery({
			queryKey: ["incident-center", "deliveries"],
			queryFn: ({ signal }) => getNotificationDeliveries(signal),
			refetchInterval: 15_000,
		}),
	};
}
export function useIncidentActions() {
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: ["incident-center"] });
	return {
		mute: useMutation({
			mutationFn: ({ hostId, mute }: { hostId: number; mute: AlarmMute | null }) => setAlarmMute(hostId, mute),
			onSuccess: refresh,
		}),
		saveTarget: useMutation({
			mutationFn: ({ id, data }: { id?: number; data: NotificationTargetInput }) =>
				saveNotificationTarget(id, data),
			onSuccess: refresh,
		}),
		deleteTarget: useMutation({ mutationFn: deleteNotificationTarget, onSuccess: refresh }),
		retry: useMutation({ mutationFn: retryNotificationDelivery, onSuccess: refresh }),
	};
}
