import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { ipKeyGenerator } from "express-rate-limit";
import { getUri } from "get-uri";
import { describe, expect, it } from "vitest";

const requireFromTest = createRequire(import.meta.url);
const uri = createRequire(requireFromTest.resolve("ajv"))("fast-uri");
const proxyAddresses = createRequire(requireFromTest.resolve("express"))("proxy-addr");
const requireFromVite = createRequire(requireFromTest.resolve("vite"));
const requireFromPostcss = createRequire(requireFromVite.resolve("postcss"));
const sourceMapPath = requireFromPostcss.resolve("source-map-js");
const { SourceMapConsumer, SourceMapGenerator } = requireFromPostcss("source-map-js");
const addressConsumers = ["express-rate-limit", "socks-proxy-agent"].map((consumer) => ({
	consumer,
	addresses: createRequire(requireFromTest.resolve(consumer))("ip-address"),
}));

async function listen(server) {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return server.address().port;
}

async function localFtp() {
	const sockets = new Set();
	const commands = [];
	let dataSocket;
	const fixture = { body: "local FTP fixture\n", modified: "20261005010203", missing: false };
	const track = (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => {});
	};
	const dataServer = createServer((socket) => {
		track(socket);
		dataSocket = socket;
	});
	const dataPort = await listen(dataServer);
	const controlServer = createServer((socket) => {
		track(socket);
		socket.setEncoding("utf8");
		socket.write("220 Local FTP fixture\r\n");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			let boundary = buffer.indexOf("\r\n");
			while (boundary !== -1) {
				const line = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				commands.push(line);
				const command = line.split(" ", 1)[0];
				switch (command) {
					case "USER":
						socket.write("331 Password required\r\n");
						break;
					case "PASS":
						socket.write("230 Login successful\r\n");
						break;
					case "FEAT":
						socket.write("211-Features\r\n MDTM\r\n211 End\r\n");
						break;
					case "MDTM":
						socket.write(fixture.missing ? "550 File unavailable\r\n" : `213 ${fixture.modified}\r\n`);
						break;
					case "EPSV":
						socket.write("500 EPSV unavailable\r\n");
						break;
					case "PASV":
						socket.write(`227 Entering Passive Mode (127,0,0,1,${dataPort >> 8},${dataPort & 255})\r\n`);
						break;
					case "RETR":
						socket.write("150 Starting transfer\r\n");
						dataSocket.end(fixture.body, () => socket.write("226 Transfer complete\r\n"));
						break;
					case "QUIT":
						socket.end("221 Bye\r\n");
						break;
					default:
						socket.write("200 OK\r\n");
				}
				boundary = buffer.indexOf("\r\n");
			}
		});
	});
	const controlPort = await listen(controlServer);
	return {
		fixture,
		commands,
		url: `ftp://fixture%20user:fixture%20password@127.0.0.1:${controlPort}/folder/fixture%20file.txt`,
		async close() {
			for (const socket of sockets) socket.destroy();
			await Promise.all([
				new Promise((resolve) => controlServer.close(resolve)),
				new Promise((resolve) => dataServer.close(resolve)),
			]);
		},
	};
}

async function readText(stream) {
	let result = "";
	for await (const chunk of stream) result += chunk.toString();
	return result;
}

describe("resolved dependency runtime contracts", () => {
	describe("Express's resolved proxy trust", () => {
		// GHSA-jqcg-44mw-7w3h: IPv4 peers must not inherit trust from native IPv6 ranges.
		it.each([["::/1"], ["2001:db8::/32", "::/1"]])(
			"rejects IPv4 peers for native IPv6 trust policies %j",
			(...subnets) => {
				const trust = proxyAddresses.compile(subnets);
				expect(trust("10.0.0.1")).toBe(false);
				expect(trust("::ffff:10.0.0.1")).toBe(false);
				expect(trust("::1")).toBe(true);
			},
		);

		it("retains IPv4, native IPv6, and explicit IPv4-mapped subnet trust", () => {
			for (const subnets of [["10.0.0.0/8"], ["::ffff:10.0.0.0/104"], ["2001:db8::/32", "10.0.0.0/8"]]) {
				const trust = proxyAddresses.compile(subnets);
				expect(trust("10.2.3.4")).toBe(true);
				expect(trust("::ffff:10.2.3.4")).toBe(true);
				expect(trust("192.0.2.9")).toBe(false);
				expect(trust("::ffff:192.0.2.9")).toBe(false);
				expect(trust("::1")).toBe(false);
			}
			const trustIpv6 = proxyAddresses.compile(["2001:db8::/32"]);
			expect(trustIpv6("2001:db8::1234")).toBe(true);
			expect(trustIpv6("2001:db9::1234")).toBe(false);
			const shortMappedRange = proxyAddresses.compile(["::ffff:10.0.0.0/8"]);
			expect(shortMappedRange("::1")).toBe(false);
			expect(shortMappedRange("10.2.3.4")).toBe(false);
			expect(shortMappedRange("::ffff:10.2.3.4")).toBe(false);
		});

		it("ignores forwarded headers from cross-family peers and stops at the first untrusted hop", () => {
			const untrusted = {
				socket: { remoteAddress: "::ffff:192.0.2.9" },
				headers: { "x-forwarded-for": "203.0.113.6" },
			};
			const trustIpv6 = proxyAddresses.compile(["::/1"]);
			expect(proxyAddresses(untrusted, trustIpv6)).toBe("::ffff:192.0.2.9");
			expect(proxyAddresses.all(untrusted, trustIpv6)).toEqual(["::ffff:192.0.2.9"]);

			const trusted = {
				socket: { remoteAddress: "::ffff:10.1.1.1" },
				headers: { "x-forwarded-for": "203.0.113.6, 198.51.100.7, 10.2.3.4" },
			};
			const trustIpv4 = proxyAddresses.compile(["10.0.0.0/8"]);
			expect(proxyAddresses(trusted, trustIpv4)).toBe("198.51.100.7");
			expect(proxyAddresses.all(trusted, trustIpv4)).toEqual(["::ffff:10.1.1.1", "10.2.3.4", "198.51.100.7"]);
		});
	});

	describe("Vite/PostCSS's resolved source maps", () => {
		const flatMap = () => ({
			version: 3,
			sources: ["fixture.css"],
			sourcesContent: [".card { color: blue; }"],
			names: [],
			mappings: "AAAA",
		});
		const indexedMap = (map, line, column = 0) => ({
			version: 3,
			sections: [{ offset: { line, column }, map }],
		});

		it("round-trips ordinary generated mappings and preserves indexed offsets and source content", () => {
			const generator = new SourceMapGenerator({ file: "compiled.css" });
			generator.addMapping({
				generated: { line: 2, column: 4 },
				original: { line: 5, column: 2 },
				source: "fixture.css",
				name: "color",
			});
			generator.setSourceContent("fixture.css", ".card { color: blue; }");
			const consumer = new SourceMapConsumer(generator.toString());
			expect(consumer.originalPositionFor({ line: 2, column: 4 })).toEqual({
				source: "fixture.css",
				line: 5,
				column: 2,
				name: "color",
			});
			expect(SourceMapGenerator.fromSourceMap(consumer).toJSON().mappings).toBe(generator.toJSON().mappings);
			expect(consumer.sourceContentFor("fixture.css")).toBe(".card { color: blue; }");

			const indexed = new SourceMapConsumer(indexedMap(flatMap(), 12));
			expect(indexed.originalPositionFor({ line: 13, column: 1 })).toEqual({
				source: "fixture.css",
				line: 1,
				column: 0,
				name: null,
			});
			expect(indexed.sourceContentFor("fixture.css")).toBe(".card { color: blue; }");
		});

		// GHSA-68fv-2mgg-jv7q: reject amplification before flattening can allocate huge output.
		it("rejects excessive direct/nested offsets and non-integer section coordinates", () => {
			expect(() => new SourceMapConsumer(indexedMap(flatMap(), 2 ** 31))).toThrow(/must not exceed/);
			const nested = indexedMap(indexedMap(indexedMap(flatMap(), 4_000_000), 4_000_000), 4_000_000);
			expect(() => new SourceMapConsumer(nested)).toThrow(/including offsets of nested sections/);
			for (const invalid of [Number.POSITIVE_INFINITY, -1, 0.5, "2"]) {
				expect(() => new SourceMapConsumer(indexedMap(flatMap(), invalid))).toThrow();
				expect(() => new SourceMapConsumer(indexedMap(flatMap(), 0, invalid))).toThrow();
			}
		});

		it("reads deeply nested source lists within a bounded subprocess", () => {
			const probe = spawnSync(
				process.execPath,
				[
					"--max-old-space-size=64",
					"--input-type=commonjs",
					"-e",
					[
						'const assert = require("node:assert/strict");',
						"const { SourceMapConsumer } = require(process.argv[1]);",
						`let map = ${JSON.stringify(flatMap())};`,
						"for (let depth = 0; depth < 40; depth++) {",
						"map = { version: 3, sections: [{ offset: { line: 1, column: 0 }, map }] };",
						"}",
						"const consumer = new SourceMapConsumer(map);",
						'assert.deepEqual(consumer.sources, ["fixture.css"]);',
						'assert.equal(consumer.sourceContentFor("fixture.css"), ".card { color: blue; }");',
						'process.stdout.write("nested map resolved");',
					].join("\n"),
					sourceMapPath,
				],
				{ encoding: "utf8", timeout: 3_000, maxBuffer: 64 * 1024 },
			);
			expect(probe.error, probe.stderr).toBeUndefined();
			expect(probe.status, probe.stderr).toBe(0);
			expect(probe.stdout).toBe("nested map resolved");
		});
	});

	it("downloads FTP data with decoded credentials/path, MDTM, and EPSV-to-PASV fallback", async () => {
		const ftp = await localFtp();
		try {
			const stream = await getUri(ftp.url);
			expect(await readText(stream)).toBe(ftp.fixture.body);
			expect(stream.lastModified.toISOString()).toBe("2026-10-05T01:02:03.000Z");
			expect(ftp.commands).toEqual(
				expect.arrayContaining([
					"USER fixture user",
					"PASS fixture password",
					"MDTM /folder/fixture file.txt",
					"EPSV",
					"PASV",
					"RETR /folder/fixture file.txt",
				]),
			);
		} finally {
			await ftp.close();
		}
	});

	it("reuses unchanged FTP cache without data transfer, then downloads a changed MDTM", async () => {
		const ftp = await localFtp();
		try {
			const cache = await getUri(ftp.url);
			expect(await readText(cache)).toBe(ftp.fixture.body);
			await expect(getUri(ftp.url, { cache })).rejects.toMatchObject({ code: "ENOTMODIFIED" });
			expect(ftp.commands.filter((command) => command.startsWith("RETR "))).toHaveLength(1);
			ftp.fixture.modified = "20261005020304";
			ftp.fixture.body = "updated local FTP fixture\n";
			const updated = await getUri(ftp.url, { cache });
			expect(await readText(updated)).toBe(ftp.fixture.body);
			expect(updated.lastModified.toISOString()).toBe("2026-10-05T02:03:04.000Z");
			expect(ftp.commands.filter((command) => command.startsWith("RETR "))).toHaveLength(2);
		} finally {
			await ftp.close();
		}
	});

	it("rejects FTP missing-file responses before opening a data transfer", async () => {
		const ftp = await localFtp();
		try {
			ftp.fixture.missing = true;
			await expect(getUri(ftp.url)).rejects.toMatchObject({ code: "ENOTFOUND" });
			expect(ftp.commands).not.toContain("PASV");
			expect(ftp.commands.some((command) => command.startsWith("RETR "))).toBe(false);
		} finally {
			await ftp.close();
		}
	});

	// GHSA-hrr3-gc8f-f4qj: exercise AJV's actual resolved parser, including scheme-relative references.
	it("canonicalizes percent-encoded host case consistently in parse, normalize, and equality", () => {
		expect(uri.parse("//%41.com").host).toBe("a.com");
		expect(uri.normalize("//%41.com")).toBe("//a.com");
		expect(uri.equal("//%41.com", "//a.com")).toBe(true);
		expect(uri.equal("//%41.com", "//b.com")).toBe(false);
	});

	// GHSA-qw65-cvwx-89v3: an untrusted port must not replace the intended authority.
	it("rejects authority delimiters in URI port components and preserves numeric ports", () => {
		const parts = { scheme: "http", host: "trusted.example", path: "/app" };
		expect(() => uri.serialize({ ...parts, port: "@127.0.0.1:8124" })).toThrow();
		expect(() => uri.normalize({ ...parts, port: "@127.0.0.1:8124" })).toThrow();
		expect(uri.serialize({ ...parts, port: "8124" })).toBe("http://trusted.example:8124/app");
	});

	describe.each(addressConsumers)("$consumer's resolved IP parser", ({ addresses }) => {
		const { Address4, Address6 } = addresses;
		// GHSA-j6r3-76f7-8jcv: equal binary prefixes never imply containment across address families.
		it("rejects cross-family subnet matches and keeps explicit mapped conversions working", () => {
			const ipv4 = new Address4("32.1.13.184");
			const ipv6Range = new Address6("2001:db8::/32");
			expect(ipv4.isInSubnet(ipv6Range)).toBe(false);
			expect(ipv4.isHostInSubnet(ipv6Range)).toBe(false);
			expect(new Address6("a00::1").isInSubnet(new Address4("10.0.0.0/8"))).toBe(false);
			expect(new Address6("a00::1").isHostInSubnet(new Address4("10.0.0.0/8"))).toBe(false);
			expect(new Address6("2001:db8::1").isInSubnet(ipv6Range)).toBe(true);
			expect(new Address6("::ffff:10.0.0.1").to4().isInSubnet(new Address4("10.0.0.0/8"))).toBe(true);
		});

		it("classifies the complete IPv6 link-local /10, independently of the supplied CIDR", () => {
			for (const host of ["fe80::1", "fe80:1234::1", "febf:ffff::1"]) {
				expect(new Address6(host).isLinkLocal()).toBe(true);
				expect(new Address6(`${host}/0`).isLinkLocal()).toBe(true);
			}
			for (const host of ["fe7f:ffff::1", "fec0::1", "2001:db8::1"]) {
				expect(new Address6(host).isLinkLocal()).toBe(false);
			}
			expect(new Address6("::ffff:169.254.169.254").isLinkLocal()).toBe(true);
		});
	});

	it("preserves rate-limit IPv6 subnet grouping and canonical IPv4-mapped addresses", () => {
		expect(ipKeyGenerator("2001:db8:1234:5601::1", 56)).toBe("2001:db8:1234:5600::/56");
		expect(ipKeyGenerator("2001:db8:1234:56ff::abcd", 56)).toBe("2001:db8:1234:5600::/56");
		expect(ipKeyGenerator("::ffff:192.0.2.9")).toBe("192.0.2.9");
		expect(ipKeyGenerator("192.0.2.9")).toBe("192.0.2.9");
	});
});
