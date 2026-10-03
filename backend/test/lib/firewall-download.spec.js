import { EventEmitter } from "node:events";
import tls from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: mocks.lookup } }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));

import { fetchIpList, isPublicAddress, validateSourceUrl } from "../../lib/firewall-download.js";

const PUBLIC_IP = { address: "1.1.1.1", family: 4 };
const MAX_BYTES = 8 * 1024 * 1024;

function mockResponse({ status = 200, headers = {}, chunks = [Buffer.from("1.2.3.4\n")], complete = true } = {}) {
	const responses = [];
	mocks.get.mockImplementation((options, onResponse) => {
		const request = new EventEmitter();
		request.destroy = vi.fn();
		const response = Object.assign(new EventEmitter(), { statusCode: status, headers, complete, destroy: vi.fn() });
		responses.push(response);
		queueMicrotask(() => {
			if (options.signal.aborted) {
				return;
			}
			onResponse(response);
			if (!response.destroy.mock.calls.length) {
				for (const chunk of chunks) {
					response.emit("data", chunk);
				}
				response.emit("end");
			}
		});
		return request;
	});
	return responses;
}

describe("firewall list HTTPS downloads", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.lookup.mockResolvedValue([PUBLIC_IP]);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it.each([
		"0.0.0.0",
		"10.2.3.4",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.0.1",
		"192.168.1.1",
		"100.100.100.200",
		"192.0.2.1",
		"198.18.0.1",
		"198.51.100.1",
		"203.0.113.1",
		"224.0.0.1",
		"240.0.0.1",
		"255.255.255.255",
		"168.63.129.16",
		"::",
		"::1",
		"fe80::1",
		"fd00:ec2::254",
		"ff02::1",
		"::ffff:127.0.0.1",
		"::ffff:10.0.0.1",
		"::ffff:a9fe:a9fe",
		"64:ff9b::a00:1",
		"2001:db8::1",
		"2001:2::1",
		"2002:7f00:1::1",
		"3fff::1",
		"2606:4700:4700::1111%eth0",
		"not-an-address",
	])("rejects nonpublic destination %s", (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});

	it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
		"accepts public destination %s",
		(address) => expect(isPublicAddress(address)).toBe(true),
	);

	it.each([
		"http://lists.example/list.txt",
		"file:///etc/passwd",
		"https://user:password@lists.example/list.txt",
		"https://@lists.example/list.txt",
		"https:/lists.example/list.txt",
		"https://lists.example\\list.txt",
		"https://lists.example/list.txt#fragment",
		"https://lists.example/list.txt#",
		"https://127.1/list.txt",
		"https://0x7f000001/list.txt",
		"https://[::ffff:127.0.0.1]/list.txt",
		"https://169.254.169.254/latest/meta-data",
		"https://168.63.129.16/list.txt",
		"https://lists.example/ list.txt",
		`https://lists.example/${"a".repeat(2048)}`,
	])("rejects unsafe source URL before DNS or network access: %s", async (sourceUrl) => {
		expect(() => validateSourceUrl(sourceUrl)).toThrow();
		await expect(fetchIpList(sourceUrl)).rejects.toMatchObject({ name: "ValidationError", status: 400 });
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.get).not.toHaveBeenCalled();
	});

	it("returns a complete UTF-8 text body and requests a direct verified TLS connection", async () => {
		const body = Buffer.from("# Sperrgründe\n1.2.3.4\n");
		mockResponse({ chunks: [body.subarray(0, 10), body.subarray(10)] });
		await expect(fetchIpList("https://lists.example/list.txt")).resolves.toBe("# Sperrgründe\n1.2.3.4\n");
		expect(mocks.lookup).toHaveBeenCalledWith("lists.example", { all: true, verbatim: true });
		expect(mocks.get.mock.calls[0][0]).toMatchObject({
			hostname: "shieldpm-firewall-download.invalid",
			port: 443,
			path: "/list.txt",
			agent: false,
			rejectUnauthorized: true,
			servername: "lists.example",
			headers: { Host: "lists.example", "Accept-Encoding": "identity" },
		});
	});

	it("keeps origin routing and TLS identity separate from the pinned transport lookup key", async () => {
		mockResponse();
		await fetchIpList("https://lists.example:8443/a%2Fb.txt?value=%2F");
		const options = mocks.get.mock.calls[0][0];
		expect(options).toMatchObject({
			hostname: "shieldpm-firewall-download.invalid",
			port: "8443",
			path: "/a%2Fb.txt?value=%2F",
			servername: "lists.example",
			headers: { Host: "lists.example:8443" },
		});
		expect(options.checkServerIdentity(options.hostname, { subjectaltname: "DNS:lists.example" })).toBeUndefined();
		expect(
			options.checkServerIdentity("lists.example", { subjectaltname: `DNS:${options.hostname}` }),
		).toMatchObject({
			code: "ERR_TLS_CERT_ALTNAME_INVALID",
		});
		expect(options.checkServerIdentity("lists.example", { subjectaltname: "DNS:wrong.example" })).toMatchObject({
			code: "ERR_TLS_CERT_ALTNAME_INVALID",
		});
	});

	it.each([
		[[]],
		[[{ address: "10.0.0.1", family: 4 }]],
		[[PUBLIC_IP, { address: "127.0.0.1", family: 4 }]],
		[[PUBLIC_IP, { address: "fd00::1", family: 6 }]],
		[[PUBLIC_IP, { address: "::ffff:127.0.0.1", family: 6 }]],
	])("rejects an empty or partly private DNS answer %j", async (addresses) => {
		mocks.lookup.mockResolvedValue(addresses);
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("only to public IP");
		expect(mocks.get).not.toHaveBeenCalled();
	});

	it("pins every connection lookup to validated addresses even if subsequent DNS would rebind", async () => {
		mocks.lookup.mockResolvedValueOnce([PUBLIC_IP, { address: "2606:4700:4700::1111", family: 6 }]);
		mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
		mockResponse();
		await fetchIpList("https://lists.example/list.txt");
		const options = mocks.get.mock.calls[0][0];
		const single = vi.fn();
		options.lookup(options.hostname, {}, single);
		expect(single).toHaveBeenCalledWith(null, "1.1.1.1", 4);
		const all = vi.fn();
		options.lookup(options.hostname, { all: true }, all);
		expect(all).toHaveBeenCalledWith(null, [PUBLIC_IP, { address: "2606:4700:4700::1111", family: 6 }]);
		const onlyIpv6 = vi.fn();
		options.lookup(options.hostname, { family: 6 }, onlyIpv6);
		expect(onlyIpv6).toHaveBeenCalledWith(null, "2606:4700:4700::1111", 6);
		expect(mocks.lookup).toHaveBeenCalledTimes(1);
	});

	it.each([
		["1.1.1.1", "1.1.1.1", 4],
		["[2606:4700:4700::1111]", "2606:4700:4700::1111", 6],
	])(
		"downloads public literal %s without DNS or SNI and verifies its IP certificate",
		async (authority, ip, family) => {
			mockResponse();
			await expect(fetchIpList(`https://${authority}:8443/list.txt`)).resolves.toBe("1.2.3.4\n");
			expect(mocks.lookup).not.toHaveBeenCalled();
			const options = mocks.get.mock.calls[0][0];
			expect(options).toMatchObject({ servername: "", port: "8443", headers: { Host: `${authority}:8443` } });
			const all = vi.fn();
			options.lookup(options.hostname, { all: true }, all);
			expect(all).toHaveBeenCalledWith(null, [{ address: ip, family }]);
			const certificate = { subjectaltname: `IP Address:${ip}` };
			const identityCheck = vi.spyOn(tls, "checkServerIdentity");
			const identityError = options.checkServerIdentity(options.hostname, certificate);
			expect(identityCheck).toHaveBeenCalledWith(ip, certificate);
			// IPv6 IP-SAN acceptance depends on the Node runtime's native TLS implementation.
			if (family === 4) {
				expect(identityError).toBeUndefined();
			}
			expect(options.checkServerIdentity(ip, { subjectaltname: `DNS:${ip}` })).toMatchObject({
				code: "ERR_TLS_CERT_ALTNAME_INVALID",
			});
		},
	);

	it("revalidates and resolves a relative redirect before its separate connection", async () => {
		const requests = [];
		mocks.get.mockImplementation((options, onResponse) => {
			const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
			requests.push(request);
			queueMicrotask(() => {
				const first = options.path === "/list.txt";
				const response = Object.assign(new EventEmitter(), {
					statusCode: first ? 302 : 200,
					headers: first ? { location: "/actual.txt" } : {},
					complete: true,
					destroy: vi.fn(),
				});
				onResponse(response);
				if (!first) {
					response.emit("data", Buffer.from("8.8.8.8\n"));
					response.emit("end");
				}
			});
			return request;
		});
		await expect(fetchIpList("https://lists.example/list.txt")).resolves.toBe("8.8.8.8\n");
		expect(mocks.lookup).toHaveBeenCalledTimes(2);
		expect(requests[0].destroy).toHaveBeenCalled();
	});

	it.each([
		"http://public.example/list.txt",
		"https://127.0.0.1/list.txt",
		"https://[::ffff:169.254.169.254]/list.txt",
		"https://user:secret@public.example/list.txt",
		"https://public.example/list.txt#fragment",
	])("rejects unsafe redirect %s without contacting its destination", async (location) => {
		mockResponse({ status: 302, headers: { location } });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("redirect destination");
		expect(mocks.get).toHaveBeenCalledTimes(1);
	});

	it("rejects a hostname redirect whose DNS includes a private address", async () => {
		mocks.lookup.mockResolvedValueOnce([PUBLIC_IP]).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
		mockResponse({ status: 302, headers: { location: "https://second.example/list.txt" } });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("only to public IP");
		expect(mocks.lookup).toHaveBeenCalledTimes(2);
		expect(mocks.get).toHaveBeenCalledTimes(1);
	});

	it("caps the entire chain at three redirects", async () => {
		mockResponse({ status: 302, headers: { location: "/again.txt" } });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("maximum of 3 redirects");
		expect(mocks.get).toHaveBeenCalledTimes(4);
	});

	it("rejects announced oversized bodies before reading any bytes", async () => {
		const responses = mockResponse({ headers: { "content-length": String(MAX_BYTES + 1) } });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("8 MiB");
		expect(responses[0].destroy).toHaveBeenCalled();
	});

	it("rejects a chunked body that exceeds the cap without trusting its headers", async () => {
		const responses = mockResponse({ chunks: [Buffer.alloc(MAX_BYTES), Buffer.from("x")] });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("8 MiB");
		expect(responses[0].destroy).toHaveBeenCalled();
	});

	it.each([{ complete: false }, { headers: { "content-length": "999" } }])(
		"rejects partial responses %j",
		async (options) => {
			mockResponse(options);
			await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("incomplete");
		},
	);

	it("rejects invalid UTF-8 rather than silently altering imported networks", async () => {
		mockResponse({ chunks: [Buffer.from([0xff, 0xfe])] });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("valid UTF-8");
	});

	it.each(["gzip", "br", "deflate"])(
		"rejects %s compression rather than allowing decompression expansion",
		async (encoding) => {
			mockResponse({ headers: { "content-encoding": encoding } });
			await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow("uncompressed");
		},
	);

	it.each([204, 206, 404, 500])("rejects non-success or partial HTTP status %i", async (status) => {
		mockResponse({ status });
		await expect(fetchIpList("https://lists.example/list.txt")).rejects.toThrow(`HTTP ${status}`);
	});

	it("includes stalled DNS resolution within the overall deadline and prevents a late connection", async () => {
		vi.useFakeTimers();
		let resolveDns;
		mocks.lookup.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveDns = resolve;
				}),
		);
		const pending = fetchIpList("https://lists.example/list.txt");
		const assertion = expect(pending).rejects.toThrow("15 second timeout");
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
		resolveDns([PUBLIC_IP]);
		await Promise.resolve();
		expect(mocks.get).not.toHaveBeenCalled();
	});

	it("aborts a stalled HTTPS body at the same overall deadline", async () => {
		vi.useFakeTimers();
		let signal;
		mocks.get.mockImplementation((options, onResponse) => {
			signal = options.signal;
			const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
			const response = Object.assign(new EventEmitter(), {
				statusCode: 200,
				headers: {},
				complete: false,
				destroy: vi.fn(),
			});
			queueMicrotask(() => {
				onResponse(response);
				response.emit("data", Buffer.from("1.2.3.4"));
			});
			options.signal.addEventListener("abort", () => request.emit("error", options.signal.reason));
			return request;
		});
		const pending = fetchIpList("https://lists.example/list.txt");
		const assertion = expect(pending).rejects.toThrow("15 second timeout");
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
		expect(signal.aborted).toBe(true);
	});

	it("keeps the same deadline across a slow redirect and its subsequent DNS lookup", async () => {
		vi.useFakeTimers();
		mocks.lookup.mockResolvedValueOnce([PUBLIC_IP]).mockImplementationOnce(() => new Promise(() => {}));
		mocks.get.mockImplementation((_options, onResponse) => {
			const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
			setTimeout(() => {
				onResponse(
					Object.assign(new EventEmitter(), {
						statusCode: 302,
						headers: { location: "https://second.example/list.txt" },
						complete: true,
						destroy: vi.fn(),
					}),
				);
			}, 10_000);
			return request;
		});
		const pending = fetchIpList("https://lists.example/list.txt");
		const assertion = expect(pending).rejects.toThrow("15 second timeout");
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
		expect(mocks.lookup).toHaveBeenCalledTimes(2);
		expect(mocks.get).toHaveBeenCalledTimes(1);
	});
});
