import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/modules/AuthStore", () => ({
	default: {
		clear: vi.fn(),
		csrfToken: null,
		setCsrfToken: vi.fn(),
	},
}));

import { download } from "./base";

describe("download", () => {
	const objectUrl = "blob:shieldpm-export";
	const createObjectURL = vi.fn(() => objectUrl);
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
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
});
