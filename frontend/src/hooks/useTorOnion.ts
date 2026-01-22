import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/backend";
import { useToast } from "./use-toast";

export const useTorOnions = () => {
	return useQuery({
		queryKey: ["tor-onions"],
		queryFn: () => api.getTorOnions(),
		retry: false,
	});
};

export const useTorOnion = () => {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const create = useMutation({
		mutationFn: (data: api.CreateTorOnionPayload) => api.createTorOnion(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tor-onions"] });
			toast({
				title: "Onion Service Created",
				description: "The Tor Onion Service has been created.",
			});
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.message || "Failed to create Onion Service.",
				variant: "destructive",
			});
		},
	});

	const update = useMutation({
		mutationFn: ({ id, data }: { id: number; data: api.UpdateTorOnionPayload }) => api.updateTorOnion(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tor-onions"] });
			toast({
				title: "Onion Service Updated",
				description: "The Tor Onion Service has been updated.",
			});
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update Onion Service.",
				variant: "destructive",
			});
		},
	});

	const remove = useMutation({
		mutationFn: (id: number) => api.deleteTorOnion(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tor-onions"] });
			toast({
				title: "Onion Service Deleted",
				description: "The Tor Onion Service has been stopped and deleted.",
			});
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.message || "Failed to delete Onion Service.",
				variant: "destructive",
			});
		},
	});

	const start = useMutation({
		mutationFn: (id: number) => api.startTorOnion(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tor-onions"] });
			toast({
				title: "Onion Service Started",
				description: "The Tor Onion Service is now running.",
			});
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.message || "Failed to start Onion Service.",
				variant: "destructive",
			});
		},
	});

	const stop = useMutation({
		mutationFn: (id: number) => api.stopTorOnion(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tor-onions"] });
			toast({
				title: "Onion Service Stopped",
				description: "The Tor Onion Service has been stopped.",
			});
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.message || "Failed to stop Onion Service.",
				variant: "destructive",
			});
		},
	});

	return { create, update, remove, start, stop };
};
