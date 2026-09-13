import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	createAccessList: vi.fn(),
	getAccessList: vi.fn(),
	updateAccessList: vi.fn(),
	createDeadHost: vi.fn(),
	getDeadHost: vi.fn(),
	updateDeadHost: vi.fn(),
	createProxyHost: vi.fn(),
	getProxyHost: vi.fn(),
	updateProxyHost: vi.fn(),
	createRedirectionHost: vi.fn(),
	getRedirectionHost: vi.fn(),
	updateRedirectionHost: vi.fn(),
	getSetting: vi.fn(),
	updateSetting: vi.fn(),
	createStream: vi.fn(),
	getStream: vi.fn(),
	updateStream: vi.fn(),
	createUser: vi.fn(),
	getUser: vi.fn(),
	updateUser: vi.fn(),
}));

import {
	updateAccessList,
	updateDeadHost,
	updateProxyHost,
	updateRedirectionHost,
	updateSetting,
	updateStream,
	updateUser,
} from "src/api/backend";
import { useSetAccessList } from "./useAccessList";
import { useSetDeadHost } from "./useDeadHost";
import { useSetProxyHost } from "./useProxyHost";
import { useSetRedirectionHost } from "./useRedirectionHost";
import { useSetSetting } from "./useSetting";
import { useSetStream } from "./useStream";
import { useSetUser } from "./useUser";

const cases = [
	["access-list", useSetAccessList, updateAccessList],
	["dead-host", useSetDeadHost, updateDeadHost],
	["proxy-host", useSetProxyHost, updateProxyHost],
	["redirection-host", useSetRedirectionHost, updateRedirectionHost],
	["setting", useSetSetting, updateSetting],
	["stream", useSetStream, updateStream],
	["user", useSetUser, updateUser],
] as const;

describe("failed optimistic CRUD mutations", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it.each(cases)(
		"restores existing %s details and never caches failed edits without prior data",
		async (entity, useMutation, update) => {
			const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
			vi.mocked(update).mockRejectedValue(new Error("Save rejected"));
			const { result } = renderHook(() => useMutation(), {
				wrapper: ({ children }: { children: ReactNode }) => (
					<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
				),
			});
			const key = entity === "access-list" ? [entity, 7, ["owner", "items"]] : [entity, 7];
			const saved = { id: 7, name: "Saved", value: "Saved", items: [] };
			queryClient.setQueryData(key, saved);
			await act(async () => {
				await expect(
					result.current.mutateAsync({ id: 7, name: "Unsaved", value: "Unsaved" } as never),
				).rejects.toThrow("Save rejected");
			});
			expect(queryClient.getQueryData(key)).toEqual(saved);
			expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
			queryClient.clear();
			await act(async () => {
				await expect(
					result.current.mutateAsync({ id: 7, name: "Unsaved", value: "Unsaved" } as never),
				).rejects.toThrow("Save rejected");
			});
			expect(queryClient.getQueryCache().findAll({ queryKey: [entity, 7] })).toEqual([]);
			queryClient.clear();
		},
	);
});
