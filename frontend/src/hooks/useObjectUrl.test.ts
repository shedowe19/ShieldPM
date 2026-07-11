import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "./useObjectUrl";

describe("useObjectUrl", () => {
	const firstUrl = "blob:shieldpm-avatar-first";
	const secondUrl = "blob:shieldpm-avatar-second";
	const createObjectURL = vi.fn();
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		createObjectURL.mockReturnValueOnce(firstUrl).mockReturnValueOnce(secondUrl);
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		createObjectURL.mockReset();
		revokeObjectURL.mockReset();
	});

	it("releases the previous Blob URL when the preview file changes and on unmount", () => {
		const firstFile = new File(["first avatar"], "first.png", { type: "image/png" });
		const secondFile = new File(["second avatar"], "second.png", { type: "image/png" });
		const { result, rerender, unmount } = renderHook(({ file }) => useObjectUrl(file), {
			initialProps: { file: firstFile },
		});

		expect(result.current).toBe(firstUrl);
		rerender({ file: secondFile });

		expect(result.current).toBe(secondUrl);
		expect(revokeObjectURL).toHaveBeenCalledWith(firstUrl);

		unmount();

		expect(revokeObjectURL).toHaveBeenCalledWith(secondUrl);
	});
});
