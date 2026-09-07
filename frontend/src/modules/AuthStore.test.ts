import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "./AuthStore";

describe("AuthStore expiration", () => {
	afterEach(() => vi.useRealTimers());

	it("accepts the ISO timestamp returned by login and refresh endpoints", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
		const store = new AuthStore();
		store.set({ expires: "2026-09-07T12:15:00Z", user: { id: 1 } });

		expect(store.hasActiveToken()).toBe(true);
		expect(store.expires).toBe(Date.parse("2026-09-07T12:15:00Z"));
		expect(store.userId).toBe(1);

		vi.setSystemTime(new Date("2026-09-07T12:14:30Z"));
		expect(store.hasActiveToken()).toBe(false);
		expect(store.active).toBe(false);
	});

	it("keeps supporting millisecond timestamps and preserves the user on a metadata-only refresh", () => {
		const store = new AuthStore();
		store.set({ expires: Date.now() + 900_000, user: { id: 7 } });
		store.add({ expires: Date.now() + 1_800_000 });
		expect(store.hasActiveToken()).toBe(true);
		expect(store.userId).toBe(7);
	});

	it.each([null, "invalid-date", Number.NaN, Number.POSITIVE_INFINITY])(
		"does not accept an invalid expiration: %s",
		(expires) => {
			const store = new AuthStore();
			store.set({ expires });
			expect(store.hasActiveToken()).toBe(false);
		},
	);
});
