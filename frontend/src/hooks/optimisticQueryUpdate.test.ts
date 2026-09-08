import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { optimisticQueryUpdate } from "./optimisticQueryUpdate";

describe("optimistic detail updates", () => {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const key = ["proxy-host", 7];
	const previous = { id: 7, name: "Saved value", enabled: true };
	const update = (old: typeof previous) => ({ ...old, name: "Unsaved value" });

	afterEach(() => queryClient.clear());

	it("does not manufacture an incomplete detail entry when the cache is empty", async () => {
		const rollback = await optimisticQueryUpdate(queryClient, key, update);
		expect(queryClient.getQueryState(key)).toBeUndefined();
		rollback();
		expect(queryClient.getQueryState(key)).toBeUndefined();
	});

	it("updates and restores every cached expansion of an access list", async () => {
		const plainKey = ["access-list", 7, ["owner"]];
		const expandedKey = ["access-list", 7, ["owner", "items", "clients"]];
		queryClient.setQueryData(plainKey, previous);
		queryClient.setQueryData(expandedKey, { ...previous, items: [{ username: "saved" }] });
		const rollback = await optimisticQueryUpdate(queryClient, ["access-list", 7], update);
		expect(queryClient.getQueryData(plainKey)).toMatchObject({ name: "Unsaved value" });
		expect(queryClient.getQueryData(expandedKey)).toMatchObject({
			name: "Unsaved value",
			items: [{ username: "saved" }],
		});
		rollback();
		expect(queryClient.getQueryData(plainKey)).toEqual(previous);
		expect(queryClient.getQueryData(expandedKey)).toEqual({ ...previous, items: [{ username: "saved" }] });
	});

	it("cancels an older fetch before writing optimistic data", async () => {
		queryClient.setQueryData(key, previous);
		let finish: (value: typeof previous) => void = () => {};
		const pending = queryClient.fetchQuery({
			queryKey: key,
			queryFn: () =>
				new Promise<typeof previous>((resolve) => {
					finish = resolve;
				}),
		});
		const caught = pending.catch(() => undefined);
		const rollback = await optimisticQueryUpdate(queryClient, key, update);
		finish({ ...previous, name: "Stale fetch value" });
		await caught;
		expect(queryClient.getQueryData(key)).toEqual(update(previous));
		rollback();
		expect(queryClient.getQueryData(key)).toEqual(previous);
	});

	it("does not roll back a newer cache write, even if its data is structurally identical", async () => {
		queryClient.setQueryData(key, previous);
		const rollback = await optimisticQueryUpdate(queryClient, key, update);
		queryClient.setQueryData(key, update(previous));
		rollback();
		expect(queryClient.getQueryData(key)).toEqual(update(previous));
	});

	it("does not restore sensitive data after the session cache was cleared", async () => {
		queryClient.setQueryData(key, previous);
		const rollback = await optimisticQueryUpdate(queryClient, key, update);
		queryClient.clear();
		rollback();
		expect(queryClient.getQueryData(key)).toBeUndefined();
	});

	it("does not write old edits into a new session while query cancellation is settling", async () => {
		queryClient.setQueryData(key, previous);
		const pendingUpdate = optimisticQueryUpdate(queryClient, key, update);
		queryClient.clear();
		const newSessionData = { ...previous, name: "New session value" };
		queryClient.setQueryData(key, newSessionData);
		const rollback = await pendingUpdate;
		expect(queryClient.getQueryData(key)).toEqual(newSessionData);
		rollback();
		expect(queryClient.getQueryData(key)).toEqual(newSessionData);
	});
});
