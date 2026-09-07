import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execFile: vi.fn(), requests: [] }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: mocks.execFile } }));
vi.mock("../../lib/certbot.js", () => ({ installPlugin: vi.fn() }));
vi.mock("proxy-agent", () => ({ ProxyAgent: class {} }));
vi.mock("node:https", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		default: {
			request: vi.fn((_url, _options, callback) => {
				const request = new EventEmitter();
				request.write = vi.fn();
				request.setTimeout = vi.fn();
				request.destroy = vi.fn();
				request.end = () =>
					queueMicrotask(() => {
						const response = new EventEmitter();
						response.statusCode = 200;
						callback(response);
						response.emit("data", JSON.stringify({ responsecode: "200", htmlresponse: "Success" }));
						response.emit("end");
					});
				mocks.requests.push(request);
				return request;
			}),
		},
	};
});

import { isProcessing, renewCertbot, requestCertbot, runCertbot, testHttpsChallenge } from "../../internal/certbot.js";

const certificate = { id: 1, domain_names: ["example.test"], meta: {} };

describe("Certbot process coordination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requests.length = 0;
	});
	afterEach(() => vi.restoreAllMocks());

	it("serializes requests and manual or scheduled renewal through one lock", async () => {
		let release;
		mocks.execFile.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const request = requestCertbot(certificate);
		expect(isProcessing()).toBe(true);
		await expect(renewCertbot(certificate)).rejects.toThrow("Another Certbot process");
		await expect(runCertbot(["renew"])).rejects.toThrow("Another Certbot process");
		release("created");
		await request;
		expect(isProcessing()).toBe(false);
		expect(mocks.execFile).toHaveBeenCalledOnce();
	});

	it("releases the process lock on command failure", async () => {
		mocks.execFile.mockRejectedValueOnce(new Error("ACME failed"));
		await expect(runCertbot(["renew"])).rejects.toThrow("ACME failed");
		expect(isProcessing()).toBe(false);
		mocks.execFile.mockResolvedValueOnce("renewed");
		await expect(runCertbot(["renew"])).resolves.toBe("renewed");
	});

	it("uses separate files for concurrent challenge tests and cleans both up", async () => {
		vi.spyOn(fs.promises, "mkdir").mockResolvedValue();
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		vi.spyOn(fs.promises, "rm").mockResolvedValue();
		const access = { can: vi.fn().mockResolvedValue() };
		const results = await Promise.all([
			testHttpsChallenge(access, { domains: ["one.test"] }),
			testHttpsChallenge(access, { domains: ["two.test"] }),
		]);
		const paths = fs.promises.writeFile.mock.calls.map(([path]) => path);
		expect(new Set(paths).size).toBe(2);
		expect(results[0]["one.test"]).toBe("ok");
		expect(Object.getPrototypeOf(results[0])).toBeNull();
		for (const path of paths) expect(fs.promises.rm).toHaveBeenCalledWith(path, { force: true });
		for (const request of mocks.requests)
			expect(request.setTimeout).toHaveBeenCalledWith(15000, expect.any(Function));
	});
});
