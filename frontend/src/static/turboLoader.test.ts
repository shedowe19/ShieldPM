// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
// Parse static fixtures without loading their remote stylesheets or script files.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const html = readFileSync(resolve("../rootfs/html/turbo_loader.html"), "utf8");
const bytes = new TextEncoder().encode("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-");
const blobs: Blob[] = [];

afterEach(() => {
	document.body.innerHTML = "";
	blobs.length = 0;
});
async function setup(
	fetchChunk: (range: string) => Promise<any>,
	writable?: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> },
	pathname = "/archive.zip",
) {
	const page = new DOMParser().parseFromString(html, "text/html");
	const scripts = page.querySelectorAll("script:not([src])");
	expect(scripts).toHaveLength(1);
	const script = scripts[0].textContent;
	for (const scriptElement of page.querySelectorAll("script")) scriptElement.remove();
	document.body.replaceChildren(...page.body.childNodes);
	const fetchMock = vi.fn(async (_url: string, options: RequestInit = {}) =>
		options.method === "HEAD"
			? new Response(null, {
					headers: { "Content-Length": String(bytes.length), "Accept-Ranges": "bytes", ETag: '"file-v1"' },
				})
			: fetchChunk((options.headers as Record<string, string>).Range),
	);
	const windowMock: any = {
		location: { origin: "https://files.example.com", pathname, search: "?turbo=1", replace: vi.fn() },
		addEventListener: vi.fn(),
		confirm: () => true,
	};
	windowMock.top = windowMock;
	if (writable) windowMock.showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => writable }));
	const urlMock = {
		createObjectURL: (blob: Blob) => {
			blobs.push(blob);
			return "blob:download";
		},
		revokeObjectURL: vi.fn(),
	};
	const loader = new Function(
		"window",
		"document",
		"fetch",
		"URL",
		"Blob",
		"AbortController",
		"setTimeout",
		"clearTimeout",
		`${script}\nreturn { startDownload };`,
	)(
		windowMock,
		document,
		fetchMock,
		urlMock,
		Blob,
		AbortController,
		(callback: () => void, ms: number) => setTimeout(callback, ms === 60000 ? ms : 0),
		clearTimeout,
	);
	await waitFor(() => expect(document.getElementById("start-btn")).not.toBeDisabled());
	return { loader, fetchMock, windowMock };
}
function rangeResponse(range: string) {
	const [, start, end] = range.match(/bytes=(\d+)-(\d+)/) || [];
	return new Response(bytes.slice(Number(start), Number(end) + 1), {
		status: 206,
		headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
	});
}
it("keeps double-slash paths on the file server for probes, ranges and standard downloads", async () => {
	const { loader, fetchMock, windowMock } = await setup(
		async (range) => rangeResponse(range),
		undefined,
		"//other.example.com/archive.zip",
	);
	await loader.startDownload();
	const expected = "https://files.example.com//other.example.com/archive.zip?turbo=0";
	expect(fetchMock.mock.calls.every(([url]) => url === expected)).toBe(true);
	document.getElementById("standard-btn")?.click();
	expect(windowMock.location.href).toBe(expected);
});
it("assembles all validated ranges in byte order", async () => {
	const { loader, fetchMock } = await setup(async (range) => rangeResponse(range));
	await loader.startDownload();
	expect(blobs).toHaveLength(1);
	expect(await blobs[0].text()).toBe(new TextDecoder().decode(bytes));
	expect(
		fetchMock.mock.calls
			.slice(1)
			.every(
				([, options]) => (options?.headers as Record<string, string> | undefined)?.["If-Range"] === '"file-v1"',
			),
	).toBe(true);
});
it.each([200, 403])("stops HTTP%s responses and offers standard download without a corrupt file", async (status) => {
	const { loader, fetchMock } = await setup(async () => new Response(bytes, { status }));
	await loader.startDownload();
	expect(blobs).toHaveLength(0);
	expect(document.getElementById("error-msg")).toHaveTextContent("Download failed");
	expect(document.getElementById("standard-btn")).toHaveStyle({ display: "block" });
	expect(fetchMock).toHaveBeenCalledTimes(9);
});
it("rejects a response with the wrong Content-Range", async () => {
	const { loader } = await setup(
		async () => new Response(bytes, { status: 206, headers: { "Content-Range": "bytes 0-63/64" } }),
	);
	await loader.startDownload();
	expect(blobs).toHaveLength(0);
	expect(document.getElementById("error-msg")).toHaveTextContent("unexpected file range");
});
it("resumes an interrupted range at the next byte without duplication", async () => {
	let failed = false;
	const seen: string[] = [];
	const { loader } = await setup(async (range) => {
		seen.push(range);
		if (range === "bytes=0-7" && !failed) {
			failed = true;
			return {
				status: 206,
				headers: new Headers({ "Content-Range": "bytes 0-7/64" }),
				body: {
					getReader: () => ({
						read: vi
							.fn()
							.mockResolvedValueOnce({ done: false, value: bytes.slice(0, 3) })
							.mockRejectedValueOnce(new Error("Connection interrupted")),
						cancel: vi.fn(),
					}),
				},
			};
		}
		return rangeResponse(range);
	});
	await loader.startDownload();
	expect(seen).toContain("bytes=3-7");
	expect(await blobs[0].text()).toBe(new TextDecoder().decode(bytes));
});
it("limits retries when the connection keeps failing", async () => {
	const { loader, fetchMock } = await setup(async () => {
		throw new Error("offline");
	});
	await loader.startDownload();
	expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1 + 8 * 5);
	expect(document.getElementById("error-msg")).toHaveTextContent("offline");
	expect(document.getElementById("start-btn")).not.toBeDisabled();
});
it("writes each received piece before the whole range completes", async () => {
	let finish: (value: { done: boolean; value?: Uint8Array }) => void = () => undefined;
	const pending = new Promise((resolve) => {
		finish = resolve;
	});
	const writable = {
		write: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		abort: vi.fn().mockResolvedValue(undefined),
	};
	const { loader } = await setup(async (range) => {
		if (range === "bytes=0-7")
			return {
				status: 206,
				headers: new Headers({ "Content-Range": "bytes 0-7/64" }),
				body: {
					getReader: () => ({
						read: vi
							.fn()
							.mockResolvedValueOnce({ done: false, value: bytes.slice(0, 3) })
							.mockReturnValueOnce(pending)
							.mockResolvedValue({ done: true }),
						cancel: vi.fn(),
					}),
				},
			};
		return rangeResponse(range);
	}, writable);
	const download = loader.startDownload();
	await waitFor(() =>
		expect(writable.write).toHaveBeenCalledWith({ type: "write", position: 0, data: bytes.slice(0, 3) }),
	);
	expect(writable.close).not.toHaveBeenCalled();
	finish({ done: false, value: bytes.slice(3, 8) });
	await download;
	expect(writable.close).toHaveBeenCalledTimes(1);
	const result = new Uint8Array(bytes.length);
	for (const [command] of writable.write.mock.calls) result.set(command.data, command.position);
	expect(result).toEqual(bytes);
	expect(blobs).toHaveLength(0);
});
it("aborts disk failures without retrying the transfer indefinitely", async () => {
	const writable = {
		write: vi.fn().mockRejectedValue(new Error("Disk full")),
		close: vi.fn(),
		abort: vi.fn().mockResolvedValue(undefined),
	};
	const { loader } = await setup(async (range) => rangeResponse(range), writable);
	await loader.startDownload();
	expect(writable.abort).toHaveBeenCalledTimes(1);
	expect(writable.close).not.toHaveBeenCalled();
	expect(document.getElementById("error-msg")).toHaveTextContent("Disk full");
});
