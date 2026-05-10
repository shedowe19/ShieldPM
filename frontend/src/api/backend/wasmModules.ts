import * as api from "./base";
import type { WasmModule } from "./models";

export interface CreateWasmModulePayload {
	name: string;
	description?: string;
}

export interface UpdateWasmModulePayload {
	name?: string;
	description?: string;
}

export async function getWasmModules(): Promise<WasmModule[]> {
	return await api.get({
		url: "/nginx/wasm-modules",
	});
}

export async function createWasmModule(data: CreateWasmModulePayload, file: File): Promise<WasmModule> {
	const formData = new FormData();
	formData.append("name", data.name);
	if (data.description) formData.append("description", data.description);
	formData.append("wasm_file", file);

	return await api.post({
		url: "/nginx/wasm-modules",
		data: formData,
	});
}

export async function updateWasmModule(id: number, data: UpdateWasmModulePayload): Promise<WasmModule> {
	return await api.put({
		url: `/nginx/wasm-modules/${id}`,
		data,
	});
}

export async function deleteWasmModule(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/wasm-modules/${id}`,
	});
}
