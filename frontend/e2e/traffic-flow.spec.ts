import { expect, test } from "@playwright/test";

// Synthetic API fixtures validate browser behavior; these are not measurements.
test("traffic flow preserves honest semantics, expansion, pause, errors and narrow layouts", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	let polls = 0;
	let fail = false;
	let stale = false;
	const responses = () => {
		const end = new Date(Date.now() - (stale ? 30_000 : 0)).toISOString();
		return {
			enabled: true,
			generated_at: end,
			window: { start: new Date(Date.now() - 60_000).toISOString(), end },
			capabilities: { current_rates: false, source: "completed_requests" },
			truncated: false,
			collector: { state: "receiving", last_observed_at: end },
			poll_interval_ms: 5000,
			hosts: [
				{
					id: 7,
					domains: ["flow.e2e.test"],
					enabled: true,
					truncated: false,
					clients: [
						{
							id: "prefix-1",
							label: "192.0.2.0/24",
							requests: 3,
							completed_bytes: 131072,
							last_seen: end,
							current_bytes_per_second: null,
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
	await expect(page.getByText("Current per-connection throughput is unavailable.", { exact: false })).toBeVisible();
	await graph.locator("summary").click();
	await expect(graph.getByText("192.0.2.0/24", { exact: true })).toBeVisible();
	await expect(graph.getByRole("button", { name: /Completed requests: 3/ })).toHaveAttribute(
		"aria-label",
		/131072.*Current bytes\/s: unknown/,
	);
	const widths = await graph
		.locator("svg line")
		.evaluateAll((lines) => lines.map((line) => line.getAttribute("stroke-width")));
	expect(new Set(widths)).toEqual(new Set(["2"]));
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
	await expect(page.getByText("192.0.2.0/24 →", { exact: false })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	expect(overflow).toBe(false);
	fail = true;
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await page.getByRole("button", { name: "Resume", exact: true }).click();
	await expect(
		page.getByText("Traffic flow connection failed or access was denied.", { exact: false }),
	).toBeVisible();
	await expect(page.getByText("192.0.2.0/24 →", { exact: false })).not.toBeVisible();
	expect(errors).toEqual([]);
});
