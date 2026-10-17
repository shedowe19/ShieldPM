import * as api from "./base";

export const getHostOptions = (signal?: AbortSignal): Promise<{ id: number; domainNames: string[] }[]> =>
	api.get({ url: "/nginx/proxy-hosts/options" }, signal ? { signal } : undefined);
