import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWasmCapability, getWasmHostStatus, testWasmCapability } from "src/api/backend/wasm";

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
