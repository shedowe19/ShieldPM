import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/backend";
import { useToast } from "./use-toast";

export const useCloudflaredTunnels = () => {
	return useQuery({
		queryKey: ["cloudflared-tunnels"],
		queryFn: () => api.getCloudflaredTunnels(),
		retry: false,
	});
};

export const useCloudflaredTunnel = () => {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const create = useMutation({
		mutationFn: (data: api.CreateCloudflaredTunnelPayload) => api.createCloudflaredTunnel(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["cloudflared-tunnels"] });
			toast({
				title: "Tunnel Created",
				description: "The Cloudflared tunnel has been created and started.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to create tunnel.",
				variant: "destructive",
			});
		},
	});

	const update = useMutation({
		mutationFn: ({ id, data }: { id: number; data: api.UpdateCloudflaredTunnelPayload }) =>
			api.updateCloudflaredTunnel(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["cloudflared-tunnels"] });
			toast({
				title: "Tunnel Updated",
				description: "The Cloudflared tunnel has been updated and restarted.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update tunnel.",
				variant: "destructive",
			});
		},
	});

	const remove = useMutation({
		mutationFn: (id: number) => api.deleteCloudflaredTunnel(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["cloudflared-tunnels"] });
			toast({
				title: "Tunnel Deleted",
				description: "The Cloudflared tunnel has been stopped and deleted.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to delete tunnel.",
				variant: "destructive",
			});
		},
	});

	return { create, update, remove };
};
