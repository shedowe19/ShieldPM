import { expect, test } from "@playwright/test";

// Synthetic API fixtures validate browser behavior; these are not measurements.
test("traffic flow preserves honest semantics, expansion, pause, errors and narrow layouts", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	let polls = 0;
	let fail = false;
	let stale = false;
	let live = false;
	const rate = () => ({
		upload_semantics: ["quic_stream_consumed"],
		download_semantics: ["quic_stream_unique_acked"],
		upload_bytes_per_second: 16384,
		download_bytes_per_second: 49152,
		bytes_per_second: 65536,
		smoothed_bytes_per_second: 65536,
		window_start: new Date(Date.now() - 1000).toISOString(),
		window_end: new Date().toISOString(),
		samples: 1,
	});
	const responses = () => {
		const end = new Date(Date.now() - (stale ? 30_000 : 0)).toISOString();
		return {
			enabled: true,
			generated_at: end,
			window: { start: new Date(Date.now() - 60_000).toISOString(), end },
			capabilities: { current_rates: live, source: live ? "native_http_transport" : "completed_requests" },
			truncated: false,
			collector: { state: "receiving", last_observed_at: end },
			poll_interval_ms: live ? 1000 : 5000,
			hosts: [
				{
					id: 7,
					domains: ["flow.e2e.test"],
					enabled: true,
					truncated: false,
					client_rate: live ? rate() : null,
					clients: [
						{
							id: "prefix-1",
							label: "192.0.2.0/24",
							requests: 3,
							completed_bytes: 131072,
							last_seen: end,
							current_bytes_per_second: live ? 65536 : null,
							rate: live ? rate() : null,
						},
					],
					targets: [
						{
							id: "configured-1",
							label: "origin.e2e.test:8080",
							kind: "configured",
							requests: null,
							last_seen: null,
							current_bytes_per_second: null,
						},
						{
							id: "observed-1",
							label: "198.51.100.10:8080",
							kind: "observed",
							requests: 3,
							last_seen: end,
							current_bytes_per_second: null,
						},
					],
				},
			],
		};
	};
	await page.routeWebSocket("**", (socket) => socket.close());
	await page.route("**/api/**", async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		let body: unknown = {};
		let status = 200;
		if (pathname === "/api/") body = { setup: true, status: "OK", version: "4.4.1-e2e" };
		else if (pathname === "/api/tokens/refresh") body = { expires: Date.now() + 3600000, user: { id: 1 } };
		else if (pathname === "/api/users/me" || pathname === "/api/users/1")
			body = {
				id: 1,
				name: "Fixture administrator",
				nickname: "Fixture",
				email: "fixture@e2e.test",
				roles: ["admin"],
				permissions: {},
			};
		else if (pathname === "/api/nginx/proxy-hosts/options") body = [{ id: 7, domain_names: ["flow.e2e.test"] }];
		else if (pathname === "/api/nginx/analytics/flow") {
			polls++;
			status = fail ? 403 : 200;
			body = fail ? { error: { message: "Forbidden" } } : responses();
		} else if (pathname === "/api/nginx/analytics/7") body = [];
		else if (pathname === "/api/nginx/analytics/7/summary") body = { count: 0, recent_requests: [] };
		else if (pathname === "/api/analytics/status") body = { network: [] };
		else if (pathname.includes("notifications")) body = [];
		await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
	});
	await page.goto("/analytics?host=7&range=24h");
	await page.getByRole("button", { name: "Open traffic flow", exact: true }).click();
	const graph = page.getByRole("region", { name: "flow.e2e.test", exact: true });
	await expect(graph).toBeVisible();
	await page.getByText("How measurement works", { exact: true }).click();
	await expect(page.getByText("Current per-connection throughput is unavailable.", { exact: false })).toBeVisible();
	await expect(graph.locator("details").first()).toHaveAttribute("open", "");
	await expect(graph.getByText("192.0.2.*", { exact: true })).toBeVisible();
	await expect(graph.getByRole("button", { name: /Completed requests: 3/ })).toHaveAttribute("aria-label", /131072/);
	const widths = await graph
		.locator("svg line")
		.evaluateAll((lines) => lines.map((line) => line.getAttribute("stroke-width")));
	expect(new Set(widths)).toEqual(new Set(["2"]));
	live = true;
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await page.getByRole("button", { name: "Resume", exact: true }).click();
	await expect(page.getByText("Live measured HTTP/1, HTTP/2 stream", { exact: false })).toBeVisible();
	await expect(graph.getByRole("button", { name: /Upload: 16384/ })).toHaveAttribute("aria-label", /Download: 49152/);
	await expect(graph.getByRole("button", { name: /Upload: 16384/ })).toHaveAttribute(
		"aria-label",
		/acknowledged by the peer/,
	);
	await expect
		.poll(async () =>
			graph
				.locator("svg line")
				.evaluateAll((lines) => lines.filter((line) => Number(line.getAttribute("stroke-width")) > 2).length),
		)
		.toBe(3);
	const livePolls = polls;
	await expect.poll(() => polls, { timeout: 2500 }).toBeGreaterThan(livePolls);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	const pausedPolls = polls;
	await page.waitForTimeout(5500);
	expect(polls).toBe(pausedPolls);
	await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible();
	stale = true;
	await page.getByRole("button", { name: "Resume", exact: true }).click();
	await expect.poll(() => polls).toBeGreaterThan(pausedPolls);
	await expect(page.getByRole("status").filter({ hasText: "Stale snapshot" })).toBeVisible();
	await expect(graph.locator("details")).toHaveAttribute("open", "");
	await page.getByLabel("Filter proxy hosts").fill("does-not-exist");
	await expect(page.getByText("No authorized proxy hosts match this filter.")).toBeVisible();
	await page.getByLabel("Filter proxy hosts").fill("");
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "List view", exact: true }).click();
	await expect(page.getByText("192.0.2.* →", { exact: false })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
	fail = true;
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await page.getByRole("button", { name: "Resume", exact: true }).click();
	await expect(
		page.getByText("Traffic flow connection failed or access was denied.", { exact: false }),
	).toBeVisible();
	await expect(page.getByText("192.0.2.* →", { exact: false })).not.toBeVisible();
	expect(errors).toEqual([]);
});

// Real Chromium layout and motion validation with synthetic, explicitly labeled telemetry.
test("German flow explains private networks and missing rates with compact readable live paths", async ({ page }) => {
	await page.addInitScript(() => window.localStorage.setItem("locale", "de"));
	await page.setViewportSize({ width: 1440, height: 1000 });
	let live = false;
	let address = false;
	const domain = "jellyfin.with-a-very-long-subdomain.media.example.test";
	const response = () => {
		const end = new Date().toISOString();
		const rate = live
			? {
					upload_bytes_per_second: 1024,
					download_bytes_per_second: 65536,
					bytes_per_second: 66560,
					smoothed_bytes_per_second: 66560,
					window_start: new Date(Date.now() - 1000).toISOString(),
					window_end: end,
					samples: 1,
					upload_semantics: ["http_request_received"],
					download_semantics: ["http_transport_accepted"],
				}
			: null;
		return {
			enabled: true,
			generated_at: end,
			window: { start: new Date(Date.now() - 60000).toISOString(), end },
			configuration_revision: "screenshot",
			sample_complete: false,
			capabilities: { current_rates: live, source: live ? "native_http_transport" : "completed_requests" },
			client_mode: address ? "address" : "prefix",
			diagnostics: {
				live_enabled: live,
				receiver_state: "listening",
				native_last_observed_at: live ? end : null,
				reason: live ? null : "native_disabled",
			},
			collector: { state: "receiving", last_observed_at: end },
			poll_interval_ms: live ? 1000 : 5000,
			truncated: false,
			hosts: [
				{
					id: 7,
					domains: [domain, "jellyfin.example.test"],
					enabled: true,
					truncated: false,
					client_rate: rate,
					clients: [
						{
							id: "client-7",
							label: address ? "10.0.17.21" : "10.0.17.0/24",
							requests: 60,
							completed_bytes: 8388608,
							last_seen: end,
							current_bytes_per_second: rate?.bytes_per_second ?? null,
							active_requests: live ? 1 : 0,
							unknown_reason: live ? null : "native_disabled",
							rate,
						},
					],
					targets: [
						{
							id: "endpoint-7",
							label: "10.0.17.7:8096",
							kind: "observed",
							origins: ["configured", "observed"],
							requests: 60,
							last_seen: end,
							current_bytes_per_second: rate?.bytes_per_second ?? null,
							active_requests: live ? 1 : 0,
							unknown_reason: live ? null : "native_disabled",
							rate,
						},
					],
				},
			],
		};
	};
	await page.routeWebSocket("**", (socket) => socket.close());
	await page.route("**/api/**", async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		let body: unknown = {};
		if (pathname === "/api/") body = { setup: true, status: "OK", version: "4.4.1-e2e" };
		else if (pathname === "/api/tokens/refresh") body = { expires: Date.now() + 3600000, user: { id: 1 } };
		else if (pathname === "/api/users/me" || pathname === "/api/users/1")
			body = {
				id: 1,
				name: "Fixture administrator",
				nickname: "Fixture",
				email: "fixture@e2e.test",
				roles: ["admin"],
				permissions: {},
			};
		else if (pathname === "/api/nginx/proxy-hosts/options") body = [{ id: 7, domain_names: [domain] }];
		else if (pathname === "/api/nginx/analytics/flow") body = response();
		else if (pathname === "/api/nginx/analytics/7") body = [];
		else if (pathname === "/api/nginx/analytics/7/summary") body = { count: 0, recent_requests: [] };
		else if (pathname === "/api/analytics/status") body = { network: [] };
		else if (pathname.includes("notifications")) body = [];
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
	});
	await page.goto("/analytics?host=7&range=24h");
	await page.getByRole("button", { name: "Datenfluss öffnen", exact: true }).click();
	const graph = page.getByRole("region", { name: `${domain}, jellyfin.example.test`, exact: true });
	await expect(graph.getByText("10.0.17.*", { exact: true })).toBeVisible();
	await expect(graph.getByText("Anonymisiertes Netz · kann mehrere IPs enthalten")).toBeVisible();
	await expect(page.getByText("Warum Raten fehlen:")).toBeVisible();
	await expect(graph.getByText("10.0.17.7:8096", { exact: true })).toHaveCount(1);
	await expect(graph.getByText("Konfiguriert · beobachtet", { exact: false })).toBeVisible();
	const hostname = graph.getByText(domain, { exact: true });
	await expect(hostname).toHaveAttribute("title", `${domain}, jellyfin.example.test`);
	expect(await hostname.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
	const card = page.getByText("Live-Datenfluss", { exact: true }).locator("..").locator("..");
	await card.scrollIntoViewIfNeeded();
	await card.screenshot({ path: "/tmp/flow-ui-german-desktop-completed.png" });
	live = true;
	address = true;
	await page.getByRole("button", { name: "Pausieren", exact: true }).click();
	await page.getByRole("button", { name: "Fortsetzen", exact: true }).click();
	await expect(graph.getByText("10.0.17.21", { exact: true })).toBeVisible();
	await expect(page.getByText(/Eine IP-Adresse ist keine Person und kein eindeutiges Gerät/)).toBeVisible();
	await expect(graph.locator('[data-flow-motion="verified"]')).toHaveCount(4);
	await card.screenshot({ path: "/tmp/flow-ui-german-desktop-live.png" });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const animation = graph.locator('[data-flow-motion="verified"]').first();
	await expect(animation).toHaveCSS("display", "none");
	await page.getByRole("button", { name: "Pausieren", exact: true }).click();
	await expect(graph.locator("[data-flow-motion]")).toHaveCount(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Listenansicht", exact: true }).click();
	await expect(page.getByText("10.0.17.21 →", { exact: false })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await card.screenshot({ path: "/tmp/flow-ui-german-mobile.png" });
});
