import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/backend";
import { getPollingInterval } from "./pollingPolicy";
import { useToast } from "./use-toast";
import { usePollingEnvironment } from "./usePollingEnvironment";

export const useWireguardPeers = () => {
	const pollingEnvironment = usePollingEnvironment();

	return useQuery({
		queryKey: ["wireguard-peers"],
		queryFn: () => api.getWireguardPeers(),
		retry: false,
		refetchInterval: (query) =>
			getPollingInterval({
				baseIntervalMs: 30_000,
				failureCount: query.state.fetchFailureCount,
				...pollingEnvironment,
			}),
	});
};

export const useWireguardPeer = () => {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const create = useMutation({
		mutationFn: (data: api.CreateWireguardPeerPayload) => api.createWireguardPeer(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			toast({
				title: "Peer Created",
				description: "The WireGuard peer has been created successfully.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to create peer.",
				variant: "destructive",
			});
		},
	});

	const update = useMutation({
		mutationFn: ({ id, data }: { id: number; data: api.UpdateWireguardPeerPayload }) =>
			api.updateWireguardPeer(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			toast({
				title: "Peer Updated",
				description: "The WireGuard peer has been updated.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update peer.",
				variant: "destructive",
			});
		},
	});

	const remove = useMutation({
		mutationFn: (id: number) => api.deleteWireguardPeer(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			toast({
				title: "Peer Deleted",
				description: "The WireGuard peer has been removed.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to delete peer.",
				variant: "destructive",
			});
		},
	});

	const enable = useMutation({
		mutationFn: (id: number) => api.enableWireguardPeer(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			toast({ title: "Peer Enabled", description: "The WireGuard peer is now active." });
		},
		onError: (error: Error) => {
			toast({ title: "Error", description: error.message || "Failed to enable peer.", variant: "destructive" });
		},
	});

	const disable = useMutation({
		mutationFn: (id: number) => api.disableWireguardPeer(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			toast({ title: "Peer Disabled", description: "The WireGuard peer is now inactive." });
		},
		onError: (error: Error) => {
			toast({ title: "Error", description: error.message || "Failed to disable peer.", variant: "destructive" });
		},
	});

	return { create, update, remove, enable, disable };
};
