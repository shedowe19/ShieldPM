import { expect, test } from "@playwright/test";

test("Traffic Flow settings default on and apply explicit privacy choices with truthful failures", async ({ page }) => {
	let meta = { enabled: true, live_enabled: true, client_mode: "prefix" };
	let nativeAvailable = false;
	let settingsReads = 0;
	let rejectSave = false;
	const writes: (typeof meta)[] = [];
	const setting = () => ({
		id: "traffic-flow",
		value: "configured",
		meta,
		runtime: {
			native_available: nativeAvailable,
			live_effective: meta.enabled && meta.live_enabled && nativeAvailable,
			reason: !meta.enabled
				? "disabled"
				: !meta.live_enabled
					? "native_disabled"
					: !nativeAvailable
						? "native_module_unavailable"
						: null,
		},
	});
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
		else if (pathname === "/api/settings/traffic-flow") {
			if (route.request().method() === "PUT") {
				if (rejectSave) {
					status = 422;
					body = { error: { message: "Nginx validation failed; previous settings restored" } };
				} else {
					meta = route.request().postDataJSON().meta;
					writes.push({ ...meta });
					body = setting();
				}
			} else {
				settingsReads++;
				body = setting();
			}
		} else if (pathname === "/api/nginx/proxy-hosts/options")
			body = [{ id: 7, domain_names: ["settings-flow.test"] }];
		else if (pathname === "/api/nginx/analytics/flow") {
			const end = new Date().toISOString();
			body = {
				enabled: meta.enabled,
				generated_at: end,
				window: { start: end, end },
				capabilities: { current_rates: false, source: "completed_requests" },
				client_mode: meta.client_mode,
				diagnostics: {
					reason: "completed",
					live_enabled: meta.live_enabled,
					receiver_state: "listening",
					native_last_observed_at: end,
				},
				collector: { state: "receiving", last_observed_at: end },
				poll_interval_ms: 1000,
				truncated: false,
				hosts: meta.enabled
					? [
							{
								id: 7,
								domains: ["settings-flow.test"],
								enabled: true,
								truncated: false,
								clients: [
									{
										id: "private-group",
										label:
											meta.client_mode === "hidden"
												? "hidden"
												: meta.client_mode === "address"
													? "10.0.17.21"
													: "10.0.17.0/24",
										requests: 1,
										completed_bytes: 64,
										last_seen: end,
										current_bytes_per_second: null,
									},
								],
								targets: [],
							},
						]
					: [],
			};
		} else if (pathname === "/api/nginx/analytics/7") body = [];
		else if (pathname === "/api/nginx/analytics/7/summary") body = { count: 0, recent_requests: [] };
		else if (pathname === "/api/analytics/status") body = { network: [] };
		else if (pathname.includes("notifications")) body = [];
		await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
	});
	await page.goto("/settings?tab=traffic-flow");
	const enabled = page.getByRole("switch", { name: "Enable traffic observations" });
	const live = page.getByRole("switch", { name: "Enable live data rates" });
	await expect(enabled).toBeChecked();
	await expect(live).toBeChecked();
	await expect(page.getByRole("combobox", { name: "Client display in Traffic Flow" })).toHaveText(
		"Anonymized networks (default)",
	);
	await expect(page.getByText(/enabled in Settings but currently inactive/)).toBeVisible();
	const card = page.getByText("Control traffic observations", { exact: false }).locator("..").locator("..");
	await card.screenshot({ path: "/tmp/flow-settings-desktop.png" });
	await page.getByRole("combobox").click();
	await page.getByRole("option", { name: "Individual IP addresses", exact: true }).click();
	await expect(page.getByText(/You are explicitly choosing to display individual client IP/)).toBeVisible();
	await page.getByRole("button", { name: "Save and apply" }).click();
	await expect(page.getByText("Settings saved and applied.")).toBeVisible();
	expect(writes.at(-1)).toEqual({ enabled: true, live_enabled: true, client_mode: "address" });
	expect(settingsReads).toBeGreaterThan(1);
	nativeAvailable = true;
	await page.getByRole("combobox").click();
	await page.getByRole("option", { name: "Do not display", exact: true }).click();
	await page.getByRole("button", { name: "Save and apply" }).click();
	await expect(page.getByText("Settings saved and applied.")).toBeVisible();
	await expect(page.getByText(/enabled in Settings but currently inactive/)).not.toBeVisible();
	expect(writes.at(-1)?.client_mode).toBe("hidden");
	await page.goto("/analytics?host=7&range=24h");
	await page.getByRole("button", { name: "Open traffic flow", exact: true }).click();
	await expect(page.getByText(/retains one group per host without client IP/)).toBeVisible();
	await expect(page.getByText("No client addresses retained", { exact: true })).toBeVisible();
	await expect(page.getByText("10.0.17.21", { exact: true })).toHaveCount(0);
	await page.getByRole("link", { name: "Traffic Flow settings" }).click();
	await expect(page.getByRole("combobox")).toHaveText("Do not display");
	await enabled.click();
	await page.getByRole("button", { name: "Save and apply" }).click();
	await expect(page.getByText("Settings saved and applied.")).toBeVisible();
	await expect(enabled).not.toBeChecked();
	await expect(live).toBeDisabled();
	expect(writes.at(-1)).toEqual({ enabled: false, live_enabled: true, client_mode: "hidden" });
	rejectSave = true;
	await enabled.click();
	await page.getByRole("button", { name: "Save and apply" }).click();
	await expect(page.getByText("Nginx validation failed; previous settings restored")).toBeVisible();
	await expect(page.getByText("Settings saved and applied.")).not.toBeVisible();
	await expect(enabled).toBeChecked();
	expect(meta.enabled).toBe(false);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await card.screenshot({ path: "/tmp/flow-settings-mobile.png", style: "header { visibility: hidden; }" });
	await page.evaluate(() => window.localStorage.setItem("locale", "de"));
	await page.reload();
	await expect(page.getByRole("switch", { name: "Traffic-Beobachtungen aktivieren" })).not.toBeChecked();
	await expect(page.getByRole("combobox", { name: "Client-Anzeige im Datenfluss" })).toHaveText("Nicht anzeigen");
	const germanCard = page
		.getByText("Traffic-Beobachtungen, Live-Raten und Client-Anzeige", { exact: false })
		.locator("..")
		.locator("..");
	await germanCard.screenshot({
		path: "/tmp/flow-settings-german-mobile.png",
		style: "header { visibility: hidden; }",
	});
	await page.setViewportSize({ width: 1440, height: 1000 });
	await germanCard.screenshot({ path: "/tmp/flow-settings-german-desktop.png" });
});
