import { useMutation } from "@tanstack/react-query";
import { diagnoseProxyHost } from "src/api/backend/diagnoseProxyHost";

export function useProxyHostDiagnostics() {
	return useMutation({ mutationFn: diagnoseProxyHost });
}
