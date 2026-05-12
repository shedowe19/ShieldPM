import { useQuery } from "@tanstack/react-query";
import { type WasmModule } from "src/api/backend/models";
import api from "src/api/backend/api";

const getWasmModules = async (expand: string[] = ["owner"]) => {
	const params = expand.length ? `?expand=${expand.join(",")}` : "";
	const response = await api.get(`/nginx/wasm-modules${params}`);
	return response.data;
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
