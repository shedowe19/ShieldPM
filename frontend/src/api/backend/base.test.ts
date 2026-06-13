import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { download, get, setUnauthorizedHandler } from "./base";

vi.mock("src/modules/AuthStore", () => ({
	default: {
		clear: vi.fn(),
		csrfToken: "csrf-token",
		setCsrfToken: vi.fn(),
	},
}));

describe("backend API base client", () => {
	const originalFetch = globalThis.fetch;
	let originalCreateObjectURL: typeof window.URL.createObjectURL;
	let originalRevokeObjectURL: typeof window.URL.revokeObjectURL;

	beforeEach(() => {
		vi.clearAllMocks();
		originalCreateObjectURL = window.URL.createObjectURL;
		originalRevokeObjectURL = window.URL.revokeObjectURL;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		window.URL.createObjectURL = originalCreateObjectURL;
		window.URL.revokeObjectURL = originalRevokeObjectURL;
		setUnauthorizedHandler(null);
	});

	it("revokes the generated blob object URL after starting a download", async () => {
		const blob = new Blob(["export"]);
		globalThis.fetch = vi.fn().mockResolvedValue({
			blob: vi.fn().mockResolvedValue(blob),
		} as unknown as Response);
		window.URL.createObjectURL = vi.fn().mockReturnValue("blob:shieldpm-export");
		window.URL.revokeObjectURL = vi.fn();

		await download({ url: "/exports" }, "export.txt");

		expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
		expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:shieldpm-export");
	});

	it("notifies the registered unauthorized handler instead of reloading the page", async () => {
		const unauthorizedHandler = vi.fn();
		setUnauthorizedHandler(unauthorizedHandler);
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);

		await expect(get({ url: "/restricted" })).rejects.toThrow("Unauthorized");

		expect(AuthStore.clear).toHaveBeenCalled();
		expect(unauthorizedHandler).toHaveBeenCalledWith({ silentAuth: false });
		expect(reload).not.toHaveBeenCalled();
	});
});
