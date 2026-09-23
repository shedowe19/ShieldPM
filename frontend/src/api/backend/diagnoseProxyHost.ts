import * as api from "./base";

export interface ProxyHostDiagnosticCheck {
	key: string;
	status: "pass" | "warn" | "fail" | "skip";
	message: string;
	detail?: string;
}

export interface ProxyHostDiagnostics {
	hostId: number;
	domain: string | null;
	checks: ProxyHostDiagnosticCheck[];
	checkedAt: string;
}

export interface DiagnoseProxyHostInput {
	id: number;
	websocketPath: string;
}

export async function diagnoseProxyHost({ id, websocketPath }: DiagnoseProxyHostInput): Promise<ProxyHostDiagnostics> {
	return await api.post<ProxyHostDiagnostics>({
		url: `/nginx/proxy-hosts/${id}/diagnostics`,
		data: { websocketPath },
	});
}
