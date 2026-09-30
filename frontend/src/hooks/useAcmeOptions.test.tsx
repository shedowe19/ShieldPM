import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { AcmeOptions } from "src/api/backend/acmeOptions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acmeOptionsQueryKey, useAcmeOptions, useSetAcmeOptions } from "./useAcmeOptions";

const api = vi.hoisted(() => ({ getAcmeOptions: vi.fn(), updateAcmeOptions: vi.fn() }));
vi.mock("src/api/backend/acmeOptions", () => api);
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const initial: AcmeOptions = {
	server: "https://ca.example.test/directory",
	email: "",
	accountId: "",
	eabKid: "kid-1",
	eabHmacKeySet: true,
	agreeTos: true,
	mustStaple: false,
	ocspStapling: false,
	serverTlsVerify: true,
	customOcspStapling: false,
	defaultCertificateId: 0,
};

describe("ACME options cache", () => {
	it("has no guessed account options while the initial lookup is pending", () => {
		api.getAcmeOptions.mockReturnValue(new Promise(() => undefined));
		const client = new QueryClient();
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(useAcmeOptions, { wrapper });
		expect(result.current.data).toBeUndefined();
		expect(result.current.isPending).toBe(true);
		client.clear();
	});
	it("cancels an outstanding GET and caches only the sanitized saved response", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(acmeOptionsQueryKey, initial);
		let resolveRead: (value: AcmeOptions) => void = () => undefined;
		api.getAcmeOptions.mockReturnValue(
			new Promise((resolve) => {
				resolveRead = resolve;
			}),
		);
		const saved = { ...initial, email: "admin@example.test" };
		api.updateAcmeOptions.mockResolvedValue(saved);
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => ({ read: useAcmeOptions(), save: useSetAcmeOptions() }), { wrapper });
		await waitFor(() => expect(api.getAcmeOptions).toHaveBeenCalledOnce());
		const { eabHmacKeySet: _marker, ...ordinary } = saved;
		await act(async () => result.current.save.mutateAsync({ ...ordinary, eabHmacKey: "synthetic-replacement" }));
		await act(async () => resolveRead(initial));
		expect(client.getQueryData(acmeOptionsQueryKey)).toEqual(saved);
		await waitFor(() => expect(result.current.read.data).toEqual(saved));
		expect(JSON.stringify(client.getQueryData(acmeOptionsQueryKey))).not.toContain("synthetic-replacement");
		client.clear();
	});
	it("cancels a refetch started during the PUT before publishing its saved response", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(acmeOptionsQueryKey, initial);
		api.getAcmeOptions.mockResolvedValue(initial);
		let resolveSave: (value: AcmeOptions) => void = () => undefined;
		api.updateAcmeOptions.mockReturnValue(
			new Promise((resolve) => {
				resolveSave = resolve;
			}),
		);
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => ({ read: useAcmeOptions(), save: useSetAcmeOptions() }), { wrapper });
		await waitFor(() => expect(result.current.read.isFetching).toBe(false));
		const saved = { ...initial, server: "https://new-ca.example.test/directory", eabHmacKeySet: false, eabKid: "" };
		const { eabHmacKeySet: _marker, ...ordinary } = saved;
		let saving: Promise<AcmeOptions> = Promise.resolve(initial);
		act(() => {
			saving = result.current.save.mutateAsync({ ...ordinary, eabHmacKey: null });
		});
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalledOnce());
		let resolveRead: (value: AcmeOptions) => void = () => undefined;
		api.getAcmeOptions.mockReturnValue(
			new Promise((resolve) => {
				resolveRead = resolve;
			}),
		);
		act(() => {
			void client.refetchQueries({ queryKey: acmeOptionsQueryKey });
		});
		await waitFor(() => expect(api.getAcmeOptions).toHaveBeenCalledTimes(2));
		await act(async () => {
			resolveSave(saved);
			await saving;
		});
		await act(async () => resolveRead(initial));
		expect(client.getQueryData(acmeOptionsQueryKey)).toEqual(saved);
		await waitFor(() => expect(result.current.read.data).toEqual(saved));
		client.clear();
	});
});
