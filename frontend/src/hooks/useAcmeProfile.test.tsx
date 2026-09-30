import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { AcmeProfileSettings } from "src/api/backend/acmeProfile";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acmeProfileQueryKey, useAcmeProfile, useSetAcmeProfile } from "./useAcmeProfile";

const api = vi.hoisted(() => ({ getAcmeProfile: vi.fn(), updateAcmeProfile: vi.fn() }));
vi.mock("src/api/backend/acmeProfile", () => api);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const createWrapper = () => {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return { queryClient, wrapper };
};

describe("global ACME profile queries", () => {
	it("loads the server default without returning guessed profile data before the response", async () => {
		let resolve: (value: AcmeProfileSettings) => void = () => undefined;
		api.getAcmeProfile.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useAcmeProfile(), { wrapper });
		expect(result.current.data).toBeUndefined();
		expect(result.current.isPending).toBe(true);
		await act(async () => resolve({ profile: "shortlived", source: "settings" }));
		await waitFor(() => expect(result.current.data?.profile).toBe("shortlived"));
	});

	it("publishes a saved profile immediately and prevents an older outstanding GET from replacing it", async () => {
		const { queryClient, wrapper } = createWrapper();
		queryClient.setQueryData(acmeProfileQueryKey, { profile: "standard", source: "environment" });
		let resolveRead: (value: AcmeProfileSettings) => void = () => undefined;
		api.getAcmeProfile.mockReturnValue(
			new Promise((done) => {
				resolveRead = done;
			}),
		);
		api.updateAcmeProfile.mockResolvedValue({ profile: "shortlived", source: "settings" });
		const { result } = renderHook(() => ({ read: useAcmeProfile(), save: useSetAcmeProfile() }), { wrapper });
		await waitFor(() => expect(api.getAcmeProfile).toHaveBeenCalledOnce());
		await act(async () => result.current.save.mutateAsync({ profile: "shortlived" }));
		expect(queryClient.getQueryData(acmeProfileQueryKey)).toEqual({ profile: "shortlived", source: "settings" });
		await act(async () => resolveRead({ profile: "standard", source: "environment" }));
		expect(queryClient.getQueryData(acmeProfileQueryKey)).toEqual({ profile: "shortlived", source: "settings" });
		expect(result.current.read.data?.profile).toBe("shortlived");
	});
});
