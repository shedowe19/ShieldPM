import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type AccessList,
	type AccessListExpansion,
	createAccessList,
	getAccessList,
	updateAccessList,
} from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const fetchAccessList = (id: number | "new", expand: AccessListExpansion[] = ["owner"]) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			name: "",
			satisfyAny: false,
			passAuth: false,
			meta: {},
		} as AccessList);
	}
	return getAccessList(id, expand);
};

const useAccessList = (id: number | "new", expand?: AccessListExpansion[], options = {}) => {
	return useQuery<AccessList, Error>({
		queryKey: [AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, id, expand],
		queryFn: () => fetchAccessList(id, expand),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetAccessList = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: AccessList) => (values.id ? updateAccessList(values) : createAccessList(values)),
		onMutate: (values: AccessList) => {
			if (!values.id) {
				return () => {};
			}
			const previousObject = queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, values.id]);
			queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, values.id], (old: AccessList) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, values.id], previousObject);
		},
		onError: (_, __, rollback: (() => void) | undefined) => rollback?.(),
		onSuccess: async ({ id }: AccessList) => {
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, id] });
			queryClient.invalidateQueries({ queryKey: ["access-lists"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
};

export { useAccessList, useSetAccessList };
