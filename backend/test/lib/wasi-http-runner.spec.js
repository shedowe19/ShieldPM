import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ children: [] }));
vi.mock("node:child_process", async (original) => {
	const actual = await original();
	return {
		...actual,
		fork: (...args) => {
			const child = actual.fork(...args);
			state.children.push(child);
			return child;
		},
	};
});

import { runWasiApplication, runWasiHttpApplication } from "../../lib/wasi-runner.js";

const fixture = (name) => fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
const application = await fixture("standalone-wasi");
const infinite = await fixture("standalone-wasi-infinite");
const binaryInputVerifier = await fixture("standalone-wasi-http-binary");
const request = (overrides = {}) => ({
	method: "POST",
	uri: "/execute",
	query: "value=a%2Bb",
	host: "example.invalid",
	scheme: "https",
	remote_addr: "2001:db8::1",
	headers: [{ name: "Content-Type", value: "application/octet-stream" }],
	body_base64: "AP+AwoAK",
	...overrides,
});
const metadata = (input) =>
	[
		`SHIELDPM_HTTP_METHOD=${input.method}`,
		`SHIELDPM_HTTP_URI=${input.uri}`,
		`SHIELDPM_HTTP_QUERY=${input.query}`,
		`SHIELDPM_HTTP_HOST=${input.host}`,
		`SHIELDPM_HTTP_SCHEME=${input.scheme}`,
		`SHIELDPM_HTTP_REMOTE_ADDR=${input.remote_addr}`,
	]
		.map((entry) => `${entry}\n`)
		.join("");

afterEach(async () => {
	await Promise.all(
		state.children.splice(0).map(
			(child) =>
				new Promise((resolve) => {
					if (child.exitCode !== null || child.signalCode !== null) return resolve();
					child.once("close", resolve);
					child.kill("SIGKILL");
				}),
		),
	);
	vi.unstubAllEnvs();
});

describe("real host-bound WASI command execution", () => {
	it("independently checks every raw byte inside the guest, including NUL and invalid UTF-8", async () => {
		const body = Buffer.alloc(65536);
		for (let index = 0; index < body.length; index++) body[index] = index & 255;
		expect(
			await runWasiHttpApplication(binaryInputVerifier, {}, request({ body_base64: body.toString("base64") }), {
				protocol: "stdio",
			}),
		).toMatchObject({
			status: "completed",
			exit_code: 0,
			stdout: "raw bytes preserved\n",
			stderr: "",
			truncated: false,
		});
		// A text conversion changes the raw bytes. The independent guest must detect this corruption.
		const corrupted = body.toString("utf8");
		expect(
			await runWasiHttpApplication(
				binaryInputVerifier,
				{},
				request({ body_base64: Buffer.from(corrupted).subarray(0, 65536).toString("base64") }),
				{ protocol: "stdio" },
			),
		).toMatchObject({
			status: "failed",
			exit_code: null,
			stdout: "",
		});
	});
	it("delivers raw binary request bytes to stdio independently of text output decoding", async () => {
		vi.stubEnv("SHIELDPM_PRIVATE_HTTP_VALUE", "must-not-inherit");
		const input = request();
		const result = await runWasiHttpApplication(
			application,
			{ args: ["administrator argument"], env: [{ name: "CaseSensitive", value: "explicit value" }] },
			input,
			{ protocol: "stdio" },
		);
		expect(result).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: `application.wasm\nadministrator argument\nCaseSensitive=explicit value\n${metadata(input)}${Buffer.from(input.body_base64, "base64").toString("utf8")}`,
			stderr: "diagnostic\n",
			truncated: false,
			signal: null,
		});
	});
	it("passes an exact versioned JSON request to the guest rather than guessing its input protocol", async () => {
		const input = request({
			headers: [
				{ name: "X-Duplicate", value: "first" },
				{ name: "X-Duplicate", value: "second" },
			],
		});
		const before = structuredClone(input);
		const result = await runWasiHttpApplication(application, {}, input, { protocol: "http-json-v1" });
		expect(result).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: `application.wasm\n${metadata(input)}${JSON.stringify({ version: 1, request: input })}`,
			stderr: "diagnostic\n",
			truncated: false,
		});
		expect(input).toEqual(before);
	});
	it.each(["stdio", "http-json-v1"])(
		"completes a full 64 KiB binary request through the actual child pipe with %s",
		async (protocol) => {
			const body = Buffer.alloc(65536);
			for (let index = 0; index < body.length; index++) body[index] = index & 255;
			const input = request({ body_base64: body.toString("base64") });
			const result = await runWasiHttpApplication(application, {}, input, { protocol });
			const expectedInput =
				protocol === "stdio" ? body.toString("utf8") : JSON.stringify({ version: 1, request: input });
			expect(result).toMatchObject({
				status: "failed",
				exit_code: 7,
				stdout: `application.wasm\n${metadata(input)}${expectedInput}`,
				truncated: false,
				signal: null,
			});
		},
	);
	it("preserves all 32 administrator environment entries alongside the reserved metadata", async () => {
		const env = Array.from({ length: 32 }, (_, index) => ({ name: `KEY_${index}`, value: `value ${index}` }));
		const input = request({ body_base64: "" });
		const result = await runWasiHttpApplication(application, { env }, input, { protocol: "stdio" });
		expect(result.stdout).toBe(
			`application.wasm\n${env.map(({ name, value }) => `${name}=${value}\n`).join("")}${metadata(input)}`,
		);
		expect(result.exit_code).toBe(7);
	});
	it("kills an actual infinite guest on request cancellation and permits subsequent work only after close", async () => {
		const controller = new AbortController();
		const running = runWasiHttpApplication(infinite, {}, request(), {
			protocol: "stdio",
			signal: controller.signal,
		});
		expect(state.children).toHaveLength(1);
		controller.abort();
		expect(await running).toMatchObject({ status: "cancelled", exit_code: null, signal: "SIGKILL" });
		expect(state.children[0].signalCode).toBe("SIGKILL");
		expect(await runWasiHttpApplication(application, {}, request(), { protocol: "stdio" })).toMatchObject({
			status: "failed",
			exit_code: 7,
		});
	});
	it("keeps the public standalone execution input limit and string-only contract unchanged", async () => {
		await expect(runWasiApplication(application, { stdin: Buffer.from("binary") })).rejects.toThrow(
			"standard input",
		);
		await expect(runWasiApplication(application, { stdin: "x".repeat(65537) })).rejects.toThrow("standard input");
		expect(state.children).toHaveLength(0);
	});
	it.each([
		{ settings: { env: [{ name: "SHIELDPM_HTTP_METHOD", value: "GET" }] } },
		{ settings: { env: Array.from({ length: 33 }, (_, index) => ({ name: `KEY_${index}`, value: "value" })) } },
		{ settings: { args: Array(16).fill("x".repeat(4096)) } },
		{ settings: { timeout_ms: 99 } },
		{ input: { body_base64: Buffer.alloc(65537).toString("base64") } },
		{ input: { headers: [{ name: "X-Test", value: "one\r\nInjected: two" }] } },
		{ protocol: "automatic" },
	])(
		"rejects invalid HTTP input before creating a child: %#",
		async ({ settings = {}, input = {}, protocol = "stdio" }) => {
			await expect(runWasiHttpApplication(application, settings, request(input), { protocol })).rejects.toThrow();
			expect(state.children).toHaveLength(0);
		},
	);
	it("returns an already-cancelled host request without starting a process", async () => {
		const controller = new AbortController();
		controller.abort();
		expect(
			await runWasiHttpApplication(application, {}, request(), {
				protocol: "http-json-v1",
				signal: controller.signal,
			}),
		).toMatchObject({
			status: "cancelled",
			exit_code: null,
			signal: null,
		});
		expect(state.children).toHaveLength(0);
	});
});
