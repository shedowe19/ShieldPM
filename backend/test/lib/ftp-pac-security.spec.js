import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer, get } from "node:http";
import { getUri } from "get-uri";
import { describe, expect, it } from "vitest";
import { getFtpUri } from "../../lib/ftp-uri.js";
import { ProxyAgent } from "../../lib/proxy-agent.js";
import { readText, startLocalFtp } from "../helpers/local-ftp.js";

async function localHttp(body = "local HTTP target") {
	const server = createServer((_request, response) => response.end(body));
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return {
		url: `http://127.0.0.1:${server.address().port}/target`,
		close: () =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(resolve);
			}),
	};
}

function requestText(url, agent) {
	return new Promise((resolve, reject) => {
		const request = get(url, { agent }, (response) => readText(response).then(resolve, reject));
		request.on("error", reject);
		request.setTimeout(3_000, () => request.destroy(new Error("Local PAC request timed out")));
	});
}

describe("secure FTP URI and PAC consumers", () => {
	it("loads an FTP PAC file through the actual ProxyAgent with decoded credentials and metadata fallback", async () => {
		const ftp = await startLocalFtp({ mdtmCode: 500 });
		const target = await localHttp();
		const agent = new ProxyAgent({ getProxyForUrl: () => `pac+${ftp.url}` });
		try {
			expect(await requestText(target.url, agent)).toBe("local HTTP target");
			expect(ftp.commands).toEqual(
				expect.arrayContaining([
					"USER fixture user",
					"PASS fixture password",
					"MDTM /folder/fixture file.pac",
					"EPSV",
					"PASV",
					"MLSD /folder",
					"RETR /folder/fixture file.pac",
				]),
			);
			await ftp.waitForClosed();
		} finally {
			agent.destroy();
			await target.close();
			await ftp.close();
		}
	});

	it("retains get-uri cache dates and avoids a second transfer for unchanged metadata", async () => {
		const ftp = await startLocalFtp();
		try {
			const cache = await getUri(ftp.url);
			expect(await readText(cache)).toBe(ftp.state.body);
			expect(cache.lastModified.toISOString()).toBe("2026-10-05T01:02:03.000Z");
			await expect(getUri(ftp.url, { cache })).rejects.toMatchObject({ code: "ENOTMODIFIED" });
			expect(ftp.commands.filter((line) => line.startsWith("RETR "))).toHaveLength(1);
			ftp.state.modified = "20261005020304";
			ftp.state.body = "changed FTP content";
			const changed = await getUri(ftp.url, { cache });
			expect(await readText(changed)).toBe(ftp.state.body);
			expect(changed.lastModified.toISOString()).toBe("2026-10-05T02:03:04.000Z");
			await ftp.waitForClosed();
		} finally {
			await ftp.close();
		}
	});

	it("closes missing-file metadata connections without attempting RETR", async () => {
		const ftp = await startLocalFtp({ mdtmCode: 550 });
		try {
			await expect(getFtpUri(new URL(ftp.url))).rejects.toMatchObject({ code: "ENOTFOUND" });
			expect(ftp.commands.some((line) => line.startsWith("RETR "))).toBe(false);
			expect(ftp.dataConnections).toBe(0);
			await ftp.waitForClosed();
		} finally {
			await ftp.close();
		}
	});

	it.each([{ transferCode: 450 }, { finalTransferCode: 450 }])(
		"propagates preliminary or final transfer rejection instead of treating data EOF as success (%j)",
		async (options) => {
			const ftp = await startLocalFtp(options);
			try {
				const stream = await getFtpUri(new URL(ftp.url));
				await expect(readText(stream)).rejects.toMatchObject({ code: 450 });
				await ftp.waitForClosed();
			} finally {
				await ftp.close();
			}
		},
	);

	it("closes control and data connections when the consumer destroys a stalled stream", async () => {
		const ftp = await startLocalFtp({ stallTransfer: true });
		try {
			const stream = await getFtpUri(new URL(ftp.url));
			await once(stream, "data");
			stream.destroy();
			await ftp.waitForClosed();
		} finally {
			await ftp.close();
		}
	});

	it("rejects a foreign PASV host even if caller options request weaker transfer trust", async () => {
		const ftp = await startLocalFtp({ pasvHost: "192.0.2.1" });
		try {
			const stream = await getFtpUri(new URL(ftp.url), { allowSeparateTransferHost: true });
			await expect(readText(stream)).rejects.toThrow(/PASV returned another host/);
			expect(ftp.dataConnections).toBe(0);
			await ftp.waitForClosed();
		} finally {
			await ftp.close();
		}
	});

	it("never follows a PASV loopback alias to its separate local listener", async () => {
		const ftp = await startLocalFtp({ dataHost: "127.0.0.2" });
		try {
			const stream = await getFtpUri(new URL(ftp.url));
			await expect(readText(stream)).rejects.toThrow(/Can't open data connection/);
			expect(ftp.dataConnections).toBe(0);
			await ftp.waitForClosed();
		} finally {
			await ftp.close();
		}
	});

	it.each(["data", "http"])("keeps %s PAC sources working", async (source) => {
		const body = 'function FindProxyForURL() { return "DIRECT"; }';
		const pac = source === "http" ? await localHttp(body) : null;
		const target = await localHttp();
		const uri = pac?.url || `data:application/x-ns-proxy-autoconfig,${encodeURIComponent(body)}`;
		const agent = new ProxyAgent({ getProxyForUrl: () => `pac+${uri}` });
		try {
			expect(await requestText(target.url, agent)).toBe("local HTTP target");
		} finally {
			agent.destroy();
			await target.close();
			await pac?.close();
		}
	});

	it("propagates final FTP failure through the actual ProxyAgent PAC loader without an unhandled rejection", () => {
		const helper = new URL("../helpers/local-ftp.js", import.meta.url).href;
		const facade = new URL("../../lib/proxy-agent.js", import.meta.url).href;
		const source = [
			'import assert from "node:assert/strict";',
			'import { createServer, get } from "node:http";',
			'import { once } from "node:events";',
			`import { startLocalFtp } from ${JSON.stringify(helper)};`,
			`import { ProxyAgent } from ${JSON.stringify(facade)};`,
			"const fixture = await startLocalFtp({ finalTransferCode: 450 });",
			"let targetHits = 0;",
			'const target = createServer((_request, response) => { targetHits++; response.end("unexpected success"); });',
			'target.listen(0, "127.0.0.1"); await once(target, "listening");',
			'const agent = new ProxyAgent({ getProxyForUrl: () => "pac+" + fixture.url });',
			"try {",
			"await assert.rejects(new Promise((resolve, reject) => {",
			'const request = get("http://127.0.0.1:" + target.address().port + "/target", { agent }, response => {',
			'response.resume(); reject(new Error("PAC load incorrectly accepted failed FTP transfer"));',
			"});",
			'request.on("error", reject);',
			"}), { code: 450 });",
			"assert.equal(targetHits, 0);",
			'assert.ok(fixture.commands.includes("RETR /folder/fixture file.pac"));',
			"await fixture.waitForClosed();",
			'process.stdout.write("controlled ProxyAgent FTP failure");',
			"} finally {",
			"agent.destroy(); target.closeAllConnections();",
			"await new Promise(resolve => target.close(resolve)); await fixture.close();",
			"}",
		].join("\n");
		const child = spawnSync(
			process.execPath,
			["--unhandled-rejections=strict", "--max-old-space-size=64", "--input-type=module", "-e", source],
			{ encoding: "utf8", timeout: 3_000, maxBuffer: 16_384 },
		);
		expect(child.error, child.stderr).toBeUndefined();
		expect(child.status, child.stderr).toBe(0);
		expect(child.stdout).toBe("controlled ProxyAgent FTP failure");
	});

	it.each([
		["transfer failure after data EOF", { finalTransferCode: 450 }, "stream"],
		["Unix listing amplification", { mdtmCode: 500, listing: "unix-malformed" }, "metadata"],
		["MLSD detection amplification", { mdtmCode: 500, listing: "mlsd-malformed" }, "metadata"],
		["PASV response amplification", { pasvMalformed: true }, "stream"],
	])("bounds %s through real FTP without unhandled rejections", (_name, options, phase) => {
		const helper = new URL("../helpers/local-ftp.js", import.meta.url).href;
		const handler = new URL("../../lib/ftp-uri.js", import.meta.url).href;
		const source = [
			'import assert from "node:assert/strict";',
			`import { startLocalFtp, readText } from ${JSON.stringify(helper)};`,
			`import { getFtpUri } from ${JSON.stringify(handler)};`,
			`const fixture = await startLocalFtp(${JSON.stringify(options)});`,
			"try {",
			phase === "metadata"
				? "await assert.rejects(() => getFtpUri(new URL(fixture.url)));"
				: "const stream = await getFtpUri(new URL(fixture.url)); await assert.rejects(() => readText(stream));",
			phase === "metadata"
				? 'assert.ok(fixture.commands.some(line => line.startsWith("MLSD ")));'
				: 'assert.ok(fixture.commands.includes("PASV"));',
			"await fixture.waitForClosed();",
			'process.stdout.write("controlled FTP failure");',
			"} finally { await fixture.close(); }",
		].join("\n");
		const child = spawnSync(
			process.execPath,
			["--unhandled-rejections=strict", "--max-old-space-size=64", "--input-type=module", "-e", source],
			{ encoding: "utf8", timeout: 3_000, maxBuffer: 16_384 },
		);
		expect(child.error, child.stderr).toBeUndefined();
		expect(child.status, child.stderr).toBe(0);
		expect(child.stdout).toBe("controlled FTP failure");
	});
});
