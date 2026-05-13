import { useQuery } from "@tanstack/react-query";
import type { WasmModule } from "src/api/backend/models";
import { apiClient } from "src/api/backend/base";

const getWasmModules = async (expand: string[] = ["owner"]) => {
	const params = expand.length ? { expand: expand.join(",") } : {};
	return await apiClient.get<WasmModule[]>({ url: "/nginx/wasm-modules", params });
};

const useWasmModules = (options = {}) => {
	return useQuery<WasmModule[], Error>({
		queryKey: ["wasm-modules"],
		queryFn: () => getWasmModules(),
		staleTime: 60 * 1000,
		...options,
	});
};

export { useWasmModules };
