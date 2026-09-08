import { afterEach, describe, expect, it, vi } from "vitest";

const dereference = vi.hoisted(() => vi.fn());
vi.mock("@apidevtools/json-schema-ref-parser", () => ({ default: { dereference } }));

describe("OpenAPI compilation lifecycle", () => {
	afterEach(() => {
		vi.resetModules();
		dereference.mockReset();
	});
	it("shares a pending compilation between concurrent consumers", async () => {
		let finish;
		dereference.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const { getCompiledSchema } = await import("../../schema/index.js");
		const first = getCompiledSchema();
		const second = getCompiledSchema();
		expect(dereference).toHaveBeenCalledTimes(1);
		finish({ info: {}, paths: {} });
		const results = await Promise.all([first, second]);
		expect(results[0]).toBe(results[1]);
		expect(await getCompiledSchema()).toBe(results[0]);
		expect(dereference).toHaveBeenCalledTimes(1);
	});
	it("retries compilation after a failed filesystem read", async () => {
		dereference.mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce({ info: {}, paths: {} });
		const { getCompiledSchema } = await import("../../schema/index.js");
		await expect(getCompiledSchema()).rejects.toThrow("read failed");
		await expect(getCompiledSchema()).resolves.toMatchObject({ paths: {} });
		expect(dereference).toHaveBeenCalledTimes(2);
	});
});
