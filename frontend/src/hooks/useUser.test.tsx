import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	createUser: vi.fn(),
	getUser: vi.fn(),
	updateUser: vi.fn(),
}));

import { type User, updateUser } from "src/api/backend";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { useSetUser } from "./useUser";

describe("useSetUser", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("invalidates the current-user alias after saving through a numeric user route", async () => {
		const queryClient = new QueryClient();
		const currentUser = { id: 7, name: "Before" } as User;
		queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.USER, "me"], currentUser);
		queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.USER, 7], currentUser);
		vi.mocked(updateUser).mockResolvedValue({ ...currentUser, name: "After" });
		const { result } = renderHook(() => useSetUser(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		});

		await act(() => result.current.mutateAsync({ ...currentUser, name: "After" }));

		expect(queryClient.getQueryState([AUDIT_LOG_OBJECT_TYPE.USER, "me"])?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState([AUDIT_LOG_OBJECT_TYPE.USER, 7])?.isInvalidated).toBe(true);
		queryClient.clear();
	});

	it("keeps the numeric user identity while optimistically updating the me alias", async () => {
		const queryClient = new QueryClient();
		const currentUser = { id: 7, name: "Before" } as User;
		queryClient.setQueryData([AUDIT_LOG_OBJECT_TYPE.USER, "me"], currentUser);
		vi.mocked(updateUser).mockImplementation(async () => {
			expect(queryClient.getQueryData([AUDIT_LOG_OBJECT_TYPE.USER, "me"])).toEqual({
				id: 7,
				name: "After",
			});
			return { ...currentUser, name: "After" };
		});
		const { result } = renderHook(() => useSetUser(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		});

		await act(() => result.current.mutateAsync({ id: "me", name: "After" } as unknown as User));
		queryClient.clear();
	});
});
