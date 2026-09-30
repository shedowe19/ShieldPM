import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCertificateOptions, useIpRangesOptions } from "./useRuntimeOptions";

const api = vi.hoisted(() => ({
	getCertificateOptions: vi.fn(),
	updateCertificateOptions: vi.fn(),
	getIpRangesOptions: vi.fn(),
	updateIpRangesOptions: vi.fn(),
}));
vi.mock("src/api/backend/runtimeOptions", () => api);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("saved runtime options query cache", () => {
	it("cancels old certificate reads before publishing the independently saved options", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const initial = { keyType: "ecdsa", renewalIntervalHours: 12 };
		const saved = { keyType: "rsa" as const, renewalIntervalHours: 6 };
		client.setQueryData(["certificate-options"], initial);
		let resolveRead: (value: typeof initial) => void = () => undefined;
		api.getCertificateOptions.mockReturnValue(
			new Promise((resolve) => {
				resolveRead = resolve;
			}),
		);
		api.updateCertificateOptions.mockResolvedValue(saved);
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(useCertificateOptions, { wrapper });
		await waitFor(() => expect(api.getCertificateOptions).toHaveBeenCalledOnce());
		await act(async () => result.current.mutation.mutateAsync(saved));
		await act(async () => resolveRead(initial));
		expect(client.getQueryData(["certificate-options"])).toEqual(saved);
		await waitFor(() => expect(result.current.query.data).toEqual(saved));
		expect(api.updateIpRangesOptions).not.toHaveBeenCalled();
		client.clear();
	});

	it("cancels old network reads before publishing the independently saved options", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const initial = { enabled: true, refreshIntervalHours: 168 };
		const saved = { enabled: false, refreshIntervalHours: 24 };
		client.setQueryData(["ip-ranges-options"], initial);
		let resolveRead: (value: typeof initial) => void = () => undefined;
		api.getIpRangesOptions.mockReturnValue(
			new Promise((resolve) => {
				resolveRead = resolve;
			}),
		);
		api.updateIpRangesOptions.mockResolvedValue(saved);
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(useIpRangesOptions, { wrapper });
		await waitFor(() => expect(api.getIpRangesOptions).toHaveBeenCalledOnce());
		await act(async () => result.current.mutation.mutateAsync(saved));
		await act(async () => resolveRead(initial));
		expect(client.getQueryData(["ip-ranges-options"])).toEqual(saved);
		await waitFor(() => expect(result.current.query.data).toEqual(saved));
		expect(api.updateCertificateOptions).not.toHaveBeenCalled();
		client.clear();
	});
});
