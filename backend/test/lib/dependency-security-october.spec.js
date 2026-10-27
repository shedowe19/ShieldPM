import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromTest = createRequire(import.meta.url);
const uri = createRequire(requireFromTest.resolve("ajv"))("fast-uri");
const requireFromDuo = createRequire(requireFromTest.resolve("@duosecurity/duo_universal"));
const redirects = createRequire(requireFromDuo.resolve("axios"))("follow-redirects");

async function listen(server) {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return `http://127.0.0.1:${server.address().port}`;
}

function getHeaders(url, headers) {
	return new Promise((resolve, reject) => {
		const request = redirects.http.get(
			url,
			{ headers, sensitiveHeaders: ["X-Api^Key", "X-Token|Secret"], agent: false },
			async (response) => {
				try {
					let body = "";
					for await (const chunk of response) body += chunk;
					resolve(JSON.parse(body));
				} catch (error) {
					reject(error);
				}
			},
		);
		request.once("error", reject);
		request.setTimeout(2_000, () => request.destroy(new Error("Local redirect fixture timed out")));
	});
}

describe("October dependency security regressions", () => {
	// GHSA-w74x-v6f9-j3xg: normalization must not decode an inert scheme into an executable one.
	it.each(["%6Aavascript:alert(1)", "%u006Aavascript:alert(1)"])(
		"does not synthesize a scheme from %s in AJV's resolved URI parser",
		(input) => {
			expect(uri.parse(input).error).toBeTruthy();
			expect(uri.normalize(input)).toBe(input);
			expect(() => uri.resolve("https://trusted.example/app/", input)).toThrow(/scheme is malformed/);
			expect(uri.equal("%68ttps://trusted.example/", "https://trusted.example/")).toBe(false);
			expect(uri.normalize("HTTPS://Trusted.Example/app")).toBe("https://trusted.example/app");
		},
	);

	// GHSA-wjr9-j795-jxcr: ambiguous hosts cannot alias a clean authority.
	it.each(["http://a@b@evil.example/", "http://ev\til.example/"])(
		"rejects ambiguous authority %j without silently rewriting the host",
		(input) => {
			expect(uri.parse(input).error).toBeTruthy();
			expect(uri.normalize(input)).toBe(input);
			expect(uri.equal(input, "http://evil.example/")).toBe(false);
			expect(() => uri.resolve("http://trusted.example/", input)).toThrow(/host is malformed/);
			expect(uri.normalize("http://user:pass@Example.COM:8080/path")).toBe(
				"http://user:pass@example.com:8080/path",
			);
		},
	);

	// GHSA-xhq7-xmqj-769h: normalization must preserve the relative reference's target.
	it("preserves relative-reference resolution and distinguishes root-relative paths", () => {
		const base = "https://trusted.example/a/b/document";
		for (const reference of ["../x", "a/../b", "x/..", "../../x"]) {
			expect(uri.resolve(base, uri.normalize(reference))).toBe(uri.resolve(base, reference));
		}
		expect(uri.normalize("../x")).toBe("../x");
		expect(uri.normalize("a/../b")).toBe("b");
		expect(uri.equal("a/../b", "/b")).toBe(false);
	});

	// GHSA-333x-w4r6-6crp: suffix output must not expose a first-segment colon as a live scheme.
	it("keeps suffix references schemeless after normalization and reparsing", () => {
		const options = { reference: "suffix", scheme: "fixture" };
		const normalized = uri.normalize("javascript:alert(1)", options);
		expect(uri.parse(normalized).scheme).toBeUndefined();
		expect(uri.resolve("https://trusted.example/app/", normalized)).toMatch(/^https:\/\/trusted\.example\//);
		expect(uri.normalize("folder/file", options)).toBe("folder/file");
	});

	// GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c: exercise the actual Duo -> Axios dependency.
	it.each(["array", "object"])("strips credentials from %s headers only across origins", async (form) => {
		const firstRequests = [];
		const target = createServer((request, response) => response.end(JSON.stringify(request.headers)));
		let targetUrl;
		const source = createServer((request, response) => {
			if (request.url === "/echo") {
				response.end(JSON.stringify(request.headers));
				return;
			}
			firstRequests.push(request.headers);
			response.writeHead(302, { Location: request.url === "/cross" ? targetUrl : "/echo" });
			response.end();
		});
		try {
			targetUrl = await listen(target);
			const sourceUrl = await listen(source);
			const secretHeaders = {
				Authorization: "Bearer fixture-token",
				Cookie: "session=fixture",
				"Proxy-Authorization": "Basic fixture",
				"X-Api^Key": "fixture-caret",
				"X-Token|Secret": "fixture-pipe",
			};
			const makeHeaders = () => {
				const values = { Host: new URL(sourceUrl).host, ...secretHeaders, "X-Token": "public-fixture" };
				return form === "array" ? Object.entries(values).flat() : values;
			};
			const sameOrigin = await getHeaders(`${sourceUrl}/same`, makeHeaders());
			const crossOrigin = await getHeaders(`${sourceUrl}/cross`, makeHeaders());
			for (const [name, value] of Object.entries(secretHeaders)) {
				const key = name.toLowerCase();
				expect(firstRequests.map((headers) => headers[key])).toEqual([value, value]);
				expect(sameOrigin[key]).toBe(value);
				expect(crossOrigin).not.toHaveProperty(key);
			}
			expect(crossOrigin.host).toBe(new URL(targetUrl).host);
			expect(crossOrigin["x-token"]).toBe("public-fixture");
		} finally {
			for (const server of [source, target]) server.closeAllConnections();
			await Promise.all([source, target].map((server) => new Promise((resolve) => server.close(resolve))));
		}
	});

	// GHSA-rxp7-6hxx-x8q5: the old zone regex spends quadratic CPU before its length check.
	it("rejects oversized IPv6 zones within a bounded subprocess for both actual consumers", () => {
		const parserPaths = ["express-rate-limit", "socks-proxy-agent"].map((consumer) =>
			createRequire(requireFromTest.resolve(consumer)).resolve("ip-address"),
		);
		const probe = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				[
					'import assert from "node:assert/strict";',
					'import { createRequire } from "node:module";',
					"const load = createRequire(import.meta.url);",
					"for (const path of process.argv.slice(1)) {",
					"const { Address4, Address6 } = load(path);",
					'assert.equal(Address6.isValid("%".repeat(1024 * 1024) + "\\n"), false);',
					'assert.equal(Address6.isValid("fe80::1%eth0"), true);',
					'assert.equal(new Address6("fe80::1%eth0").zone, "%eth0");',
					'assert.equal(Address4.isValid("192.0.2.1"), true);',
					"}",
					'process.stdout.write("IP consumers checked");',
				].join("\n"),
				...parserPaths,
			],
			{ encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 },
		);
		expect(probe.error, probe.stderr).toBeUndefined();
		expect(probe.status, probe.stderr).toBe(0);
		expect(probe.stdout).toBe("IP consumers checked");
	});
});
