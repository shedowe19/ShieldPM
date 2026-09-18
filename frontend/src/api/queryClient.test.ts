import { describe, expect, it } from "vitest";
import { queryClient } from "./queryClient";

describe("query client defaults", () => {
	it("keeps configuration queries fresh for one minute without refetching on window focus", () => {
		expect(queryClient.getDefaultOptions().queries).toMatchObject({
			refetchOnWindowFocus: false,
			staleTime: 60_000,
		});
	});
});
