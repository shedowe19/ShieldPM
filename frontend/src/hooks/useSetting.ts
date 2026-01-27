import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSetting, type Setting, updateSetting } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const fetchSetting = (id: string) => {
	return getSetting(id);
};

export const useSetting = (id: string, options = {}) => {
	// const queryClient = useQueryClient(); // Unused here, removed
	return useQuery<Setting, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.SETTING, id],
		queryFn: () => fetchSetting(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

export const useSetSetting = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Setting) => updateSetting(values),
		onMutate: (values: Setting) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.SETTING, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.SETTING, values.id], (old: Setting) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.SETTING, values.id], previousObject);
		},
		onError: (_err, _values, context) => {
			if (context) {
				context();
			}
		},
		onSettled: (_data, _error, values) => {
			if (values?.id) {
				queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.SETTING, values.id] });
			}
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};
