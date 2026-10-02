import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getAnalyticsOptions,
	getCertificateOptions,
	getIpRangesOptions,
	getNginxOptions,
	updateAnalyticsOptions,
	updateCertificateOptions,
	updateIpRangesOptions,
	updateNginxOptions,
} from "src/api/backend/runtimeOptions";

function useOptions<T>(id: string, get: () => Promise<T>, update: (data: T) => Promise<T>) {
	const client = useQueryClient();
	const queryKey = [id];
	const query = useQuery({ queryKey, queryFn: get, retry: false });
	const mutation = useMutation({
		mutationFn: update,
		onMutate: () => client.cancelQueries({ queryKey }),
		onSuccess: (data) => {
			client.setQueryData(queryKey, data);
			client.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
	return { query, mutation };
}

export const useCertificateOptions = () =>
	useOptions("certificate-options", getCertificateOptions, updateCertificateOptions);
export const useIpRangesOptions = () => useOptions("ip-ranges-options", getIpRangesOptions, updateIpRangesOptions);
export const useAnalyticsOptions = () => useOptions("analytics-options", getAnalyticsOptions, updateAnalyticsOptions);
export const useNginxOptions = () => useOptions("nginx-options", getNginxOptions, updateNginxOptions);
