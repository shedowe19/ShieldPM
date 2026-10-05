import { afterEach, expect, it, vi } from "vitest";
import {
	createFirewallList,
	deleteFirewallList,
	getFirewallLists,
	previewFirewallList,
	refreshFirewallList,
} from "./firewallLists";

afterEach(() => vi.unstubAllGlobals());

it("uses the shared authenticated client and maps list response keys", async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValue(
			new Response(
				JSON.stringify([
					{ id: 4, source_type: "url", entry_count: 20, last_updated_on: "2026-10-03 10:00:00" },
				]),
			),
		);
	vi.stubGlobal("fetch", fetchMock);
	await expect(getFirewallLists()).resolves.toEqual([
		{ id: 4, sourceType: "url", entryCount: 20, lastUpdatedOn: "2026-10-03 10:00:00" },
	]);
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/nginx/firewall-lists",
		expect.objectContaining({
			method: "GET",
			credentials: "include",
		}),
	);
});

it("serializes URL settings as API fields without altering the text", async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 4 })));
	vi.stubGlobal("fetch", fetchMock);
	await createFirewallList({
		name: "VPN",
		reason: "VPN connections are restricted.",
		description: "Internal note",
		sourceType: "url",
		sourceUrl: "https://example.test/ipv4.txt",
		updateIntervalHours: 24,
		enabled: true,
	});
	const options = fetchMock.mock.calls[0][1];
	expect(options).toMatchObject({ method: "POST", credentials: "include" });
	expect(JSON.parse(options.body)).toMatchObject({
		source_type: "url",
		source_url: "https://example.test/ipv4.txt",
		update_interval_hours: 24,
		reason: "VPN connections are restricted.",
	});
});

it("sends plain text for import preview and requests refresh without a body", async () => {
	const fetchMock = vi.fn().mockImplementation(() =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					entries: ["203.0.113.1"],
					duplicates: 0,
					invalid: [],
					total_lines: 1,
				}),
			),
		),
	);
	vi.stubGlobal("fetch", fetchMock);
	await expect(previewFirewallList("203.0.113.1\n# comment")).resolves.toMatchObject({ totalLines: 1 });
	await refreshFirewallList(4);
	expect(fetchMock.mock.calls[0][0]).toBe("/api/nginx/firewall-lists/preview");
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ entries: "203.0.113.1\n# comment" });
	expect(fetchMock.mock.calls[1][0]).toBe("/api/nginx/firewall-lists/4/refresh");
	expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
});

it("accepts an empty DELETE response and preserves API errors", async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 204 }))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: { message: "List is still assigned" } }), { status: 409 }),
		);
	vi.stubGlobal("fetch", fetchMock);
	await expect(deleteFirewallList(4)).resolves.toBeUndefined();
	await expect(deleteFirewallList(4)).rejects.toThrow("List is still assigned");
	expect(fetchMock.mock.calls[0][0]).toBe("/api/nginx/firewall-lists/4");
	expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
});
