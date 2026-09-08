import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import * as api from "src/api/backend/gitops";
import { afterEach, expect, it, vi } from "vitest";
import { useGitOps } from "./useGitOps";

vi.mock("src/api/backend/gitops", () => ({ importGitOpsConfig: vi.fn() }));
vi.mock("./use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);
it("invalidates settings, integrations and object details after importing cross-cutting configuration", async () => {
	vi.mocked(api.importGitOpsConfig).mockResolvedValue({ success: true, imported: 5, skipped: 0, errors: [] });
	const client = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
	});
	const keys = [
		["users"],
		["setting", "default-site"],
		["certificates"],
		["ddns-providers"],
		["cloudflared-tunnels"],
		["proxy-host", 7],
	];
	for (const key of keys) client.setQueryData(key, { beforeImport: true });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const { result } = renderHook(() => useGitOps(), { wrapper });
	await act(async () => {
		await result.current.importConfig.mutateAsync(true);
	});
	for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
	client.clear();
});
