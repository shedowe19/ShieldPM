import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/modules/AuthStore", () => ({
	default: {
		clear: vi.fn(),
		csrfToken: null,
		setCsrfToken: vi.fn(),
	},
}));

import { queryClient } from "src/api/queryClient";
import AuthStore from "src/modules/AuthStore";
import { download, downloadPost } from "./base";

describe("download", () => {
	const objectUrl = "blob:shieldpm-export";
	const createObjectURL = vi.fn(() => objectUrl);
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(new Blob(["certificate export"])),
			}),
		);
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
	});

	it("releases the generated Blob URL after starting a download", async () => {
		await download({ url: "nginx/certificates/1/download" }, "certificate.zip");

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
	});

	it("rejects unauthorized downloads before creating a Blob URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(download({ url: "nginx/certificates/1/download", silentAuth: true })).rejects.toThrow(
			"Unauthorized",
		);

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("clears cached application data after an unauthorized download response", async () => {
		queryClient.setQueryData(["profile"], { email: "admin@example.test" });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(download({ url: "nginx/certificates/1/download", silentAuth: true })).rejects.toThrow(
			"Unauthorized",
		);

		expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	});

	it("rejects unauthorized POST downloads before creating a Blob URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(
			downloadPost({ url: "nginx/certificates/1/download", data: {}, silentAuth: true }),
		).rejects.toThrow("Unauthorized");

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(createObjectURL).not.toHaveBeenCalled();
	});
});
