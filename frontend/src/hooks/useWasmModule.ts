import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WasmModule } from "src/api/backend/models";
import api from "src/api/backend/api";

interface WasmModuleCreateValues {
	name: string;
	description?: string;
	wasmFile?: File;
}

interface WasmModuleUpdateValues extends Partial<WasmModule> {
	id: number;
}

type WasmModuleValues = WasmModuleCreateValues | WasmModuleUpdateValues;

const getWasmModule = async (id: number): Promise<WasmModule> => {
	const response = await api.get(`/nginx/wasm-modules/${id}`);
	return response.data;
};

const createWasmModule = async (values: WasmModuleCreateValues): Promise<WasmModule> => {
	const formData = new FormData();
	formData.append("name", values.name);
	formData.append("description", values.description || "");
	if (values.wasmFile) {
		formData.append("wasm_file", values.wasmFile);
	}
	const response = await api.post("/nginx/wasm-modules", formData);
	return response.data;
};

const updateWasmModule = async (values: WasmModuleUpdateValues): Promise<WasmModule> => {
	const response = await api.put(`/nginx/wasm-modules/${values.id}`, values);
	return response.data;
};

const deleteWasmModule = async (id: number): Promise<boolean> => {
	const response = await api.delete(`/nginx/wasm-modules/${id}`);
	return response.data;
};

const useWasmModule = (id: number, options = {}) => {
	return useQuery<WasmModule, Error>({
		queryKey: ["wasm-modules", id],
		queryFn: () => getWasmModule(id),
		enabled: !!id,
		...options,
	});
};

const useSetWasmModule = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: WasmModuleValues) => {
			if ("id" in values && values.id) {
				return updateWasmModule(values as WasmModuleUpdateValues);
			}
			return createWasmModule(values as WasmModuleCreateValues);
		},
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ["wasm-modules"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

const useDeleteWasmModule = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteWasmModule,
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ["wasm-modules"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useWasmModule, useSetWasmModule, useDeleteWasmModule };
