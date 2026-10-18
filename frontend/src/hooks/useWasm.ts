import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getWasmArtifacts,
	getWasmCapability,
	getWasmHostStatus,
	getWasmModules,
	testWasmCapability,
	uploadWasmArtifact,
	uploadWasmModule,
	type WasmArtifact,
	type WasmModule,
} from "src/api/backend/wasm";

export function useWasmArtifacts() {
	return useQuery({
		queryKey: ["wasm", "artifacts"],
		queryFn: ({ signal }) => getWasmArtifacts(signal),
		staleTime: 30_000,
	});
}
export function useUploadWasmArtifact() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: uploadWasmArtifact,
		onSuccess: (entry) => {
			client.setQueryData<WasmArtifact[]>(["wasm", "artifacts"], (entries = []) => [
				...entries.filter(
					(existing) => existing.runtime !== entry.runtime || existing.artifact.id !== entry.artifact.id,
				),
				entry,
			]);
			void client.invalidateQueries({ queryKey: ["wasm", "artifacts"] });
			void client.invalidateQueries({
				queryKey: ["wasm", entry.runtime === "proxy-wasm" ? "modules" : "applications"],
			});
		},
	});
}

export function useWasmCapability() {
	return useQuery({
		queryKey: ["wasm", "capability"],
		queryFn: ({ signal }) => getWasmCapability(signal),
		staleTime: 60_000,
	});
}
export function useWasmSelfTest() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: testWasmCapability,
		onSuccess: (data) => client.setQueryData(["wasm", "capability"], data),
	});
}
export function useWasmHostStatus(id?: number) {
	return useQuery({
		queryKey: ["wasm", "host", id],
		queryFn: ({ signal }) => getWasmHostStatus(id as number, signal),
		enabled: Boolean(id),
		refetchInterval: 30_000,
	});
}

export function useWasmModules() {
	return useQuery({
		queryKey: ["wasm", "modules"],
		queryFn: ({ signal }) => getWasmModules(signal),
		staleTime: 60_000,
	});
}
export function useUploadWasmModule() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: uploadWasmModule,
		onSuccess: (module) => {
			client.setQueryData<WasmModule[]>(["wasm", "modules"], (modules = []) => [
				...modules.filter((existing) => existing.id !== module.id),
				module,
			]);
			void client.invalidateQueries({ queryKey: ["wasm", "modules"] });
			void client.invalidateQueries({ queryKey: ["wasm", "artifacts"] });
		},
	});
}
