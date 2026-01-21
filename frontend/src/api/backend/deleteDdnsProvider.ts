import * as api from "./base";

export async function deleteDdnsProvider(id: number): Promise<boolean> {
    return await api.del({
        url: `/nginx/ddns-providers/${id}`,
    });
}
