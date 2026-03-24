import { describe, expect, it } from "vitest";
import { reducer } from "./use-toast";

describe("toast reducer", () => {
	const emptyState = { toasts: [] };

	it("ADD_TOAST adds a toast to the list", () => {
		const toast = { id: "1", title: "Hello", open: true };
		const result = reducer(emptyState, { type: "ADD_TOAST", toast });
		expect(result.toasts).toHaveLength(1);
		expect(result.toasts[0].title).toBe("Hello");
	});

	it("ADD_TOAST limits to TOAST_LIMIT (1)", () => {
		const state = {
			toasts: [{ id: "1", title: "First", open: true }],
		};
		const newToast = { id: "2", title: "Second", open: true };
		const result = reducer(state, { type: "ADD_TOAST", toast: newToast });
		// TOAST_LIMIT is 1, so only latest toast
		expect(result.toasts).toHaveLength(1);
		expect(result.toasts[0].title).toBe("Second");
	});

	it("UPDATE_TOAST updates an existing toast by id", () => {
		const state = {
			toasts: [{ id: "1", title: "Old", open: true }],
		};
		const result = reducer(state, {
			type: "UPDATE_TOAST",
			toast: { id: "1", title: "New" },
		});
		expect(result.toasts[0].title).toBe("New");
		expect(result.toasts[0].open).toBe(true); // preserved
	});

	it("UPDATE_TOAST does not affect other toasts", () => {
		// With TOAST_LIMIT=1, this is less relevant but still test logic
		const state = {
			toasts: [{ id: "1", title: "Keep", open: true }],
		};
		const result = reducer(state, {
			type: "UPDATE_TOAST",
			toast: { id: "999", title: "Ghost" },
		});
		expect(result.toasts[0].title).toBe("Keep");
	});

	it("DISMISS_TOAST sets open to false for matching toast", () => {
		const state = {
			toasts: [{ id: "1", title: "Test", open: true }],
		};
		const result = reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
		expect(result.toasts[0].open).toBe(false);
	});

	it("DISMISS_TOAST without id dismisses all toasts", () => {
		const state = {
			toasts: [{ id: "1", title: "Test", open: true }],
		};
		const result = reducer(state, { type: "DISMISS_TOAST" });
		expect(result.toasts.every((t) => t.open === false)).toBe(true);
	});

	it("REMOVE_TOAST removes matching toast", () => {
		const state = {
			toasts: [{ id: "1", title: "Test", open: true }],
		};
		const result = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
		expect(result.toasts).toHaveLength(0);
	});

	it("REMOVE_TOAST without id clears all toasts", () => {
		const state = {
			toasts: [{ id: "1", title: "Test", open: true }],
		};
		const result = reducer(state, { type: "REMOVE_TOAST" });
		expect(result.toasts).toHaveLength(0);
	});
});
