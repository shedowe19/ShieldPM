import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/backend";
import { useToast } from "./use-toast";

export const useWasmModules = () => {
	return useQuery({
		queryKey: ["wasm-modules"],
		queryFn: () => api.getWasmModules(),
		retry: false,
	});
};

export const useWasmModule = () => {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const create = useMutation({
		mutationFn: ({ data, file }: { data: api.CreateWasmModulePayload; file: File }) =>
			api.createWasmModule(data, file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wasm-modules"] });
			toast({
				title: "Module Created",
				description: "The WASM module has been uploaded and created.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to create WASM module.",
				variant: "destructive",
			});
		},
	});

	const update = useMutation({
		mutationFn: ({ id, data }: { id: number; data: api.UpdateWasmModulePayload }) =>
			api.updateWasmModule(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wasm-modules"] });
			toast({
				title: "Module Updated",
				description: "The WASM module has been updated.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update WASM module.",
				variant: "destructive",
			});
		},
	});

	const remove = useMutation({
		mutationFn: (id: number) => api.deleteWasmModule(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wasm-modules"] });
			toast({
				title: "Module Deleted",
				description: "The WASM module has been deleted.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to delete WASM module.",
				variant: "destructive",
			});
		},
	});

	return { create, update, remove };
};
