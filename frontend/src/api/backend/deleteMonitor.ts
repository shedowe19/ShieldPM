import * as api from "./base";

export async function deleteMonitor(id: number): Promise<boolean> {
	return await api.del({ url: `/monitoring/${id}` });
}
