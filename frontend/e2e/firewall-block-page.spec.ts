import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import axe from "axe-core";

const template = await fs.readFile(new URL("../../backend/templates/ip-blocked.html", import.meta.url), "utf8");
const nginxTemplate = await fs.readFile(new URL("../../backend/templates/_ip_firewall.conf", import.meta.url), "utf8");
const csp = nginxTemplate.match(/ngx\.header\["Content-Security-Policy"\] = "([^"]+)"/)?.[1];
if (!csp) throw new Error("The public block-page CSP must be present in the Nginx template");

const labels: Record<string, string> = {
	lang: "de",
	title: "Zugriff eingeschränkt",
	subtitle: "Diese Verbindung wurde durch die IP-Firewall geschützt.",
	reason_label: "Begründung",
	reason: "Diese Website schränkt Zugriffe von IP-Adressen aus ihrer VPN- und Rechenzentrumssperrliste ein. Deine Adresse gehört zu einem aufgeführten Netz.",
	message:
		"Der Betreiber schränkt den Zugriff für dieses Netzwerk ein. Ein Listentreffer allein bedeutet nicht, dass ein Angriff stattgefunden hat.",
	source_label: "Regel / Liste",
	source: "X4BNet VPN + Datacenter",
	country_label: "Erkanntes Land (ISO)",
	country: "DE",
	asn_label: "Autonomes System (ASN)",
	asn: "AS16509",
	asn_organization_label: "Netzwerkbetreiber",
	asn_organization: "Netzwerkbetreiber (Beispiel)",
	ip_label: "Deine IP-Adresse",
	ip: "2001:db8:1234:5678:90ab:cdef:1234:5678",
	host_label: "Website",
	host: "cdn.example.com",
	request_label: "Vorgangsnummer",
	request: "26a7cbff6897e385104b9892eb8bba60",
	contact_label: "Betreiber kontaktieren",
	support: "https://example.com/support",
	footer: "Bei einer Rückfrage gib bitte die Vorgangsnummer an.",
};
const html = (overrides: Record<string, string> = {}) =>
	template.replace(/%\{([a-z_]+)\}/g, (_, key: string) => {
		const value = { ...labels, ...overrides }[key] || "";
		return value.replace(/[&<>"']/g, (character) => {
			const entities: Record<string, string> = {
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			};
			return entities[character];
		});
	});

for (const width of [320, 390, 768, 1440]) {
	test(`public 403 stays readable and self-contained at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
		const requests: string[] = [];
		await page.route("**", (route) => {
			requests.push(route.request().url());
			if (route.request().url() !== "http://127.0.0.1:4173/firewall-blocked-fixture") return route.abort();
			return route.fulfill({
				status: 403,
				contentType: "text/html; charset=utf-8",
				headers: { "Content-Security-Policy": csp, "Cache-Control": "no-store" },
				body: html(),
			});
		});
		const response = await page.goto("/firewall-blocked-fixture");
		expect(response?.status()).toBe(403);
		await expect(page.getByRole("heading", { name: labels.title })).toBeVisible();
		await expect(page.locator(".reason")).toContainText(labels.reason);
		await expect(page.locator("dd").filter({ hasText: labels.ip })).toBeVisible();
		await expect(page.locator("svg[viewBox='0 0 512 512']")).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		const latestEnd = await page.evaluate(() =>
			Math.max(
				0,
				...document.getAnimations().map((animation) => Number(animation.effect?.getComputedTiming().endTime)),
			),
		);
		expect(latestEnd).toBeLessThanOrEqual(5000);
		if (latestEnd > 0) await page.waitForTimeout(latestEnd + 50);
		expect(
			await page.evaluate(() =>
				document.getAnimations().filter((animation) => animation.playState === "running"),
			),
		).toEqual([]);
		await page.evaluate(axe.source);
		const violations = await page.evaluate(async () => {
			const result = await (globalThis as typeof globalThis & { axe: typeof axe }).axe.run();
			return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
		});
		expect(violations).toEqual([]);
		await page.keyboard.press("Tab");
		await expect(page.getByRole("link", { name: labels.contact_label })).toBeFocused();
		await page.screenshot({ path: testInfo.outputPath(`firewall-${width}.png`), fullPage: true });
		expect(requests).toEqual(["http://127.0.0.1:4173/firewall-blocked-fixture"]);
	});
}

test("reduced motion removes animation and long values wrap while optional details stay hidden", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/firewall-blocked-fixture", (route) =>
		route.fulfill({
			status: 403,
			contentType: "text/html",
			headers: { "Content-Security-Policy": csp },
			body: html({
				source: "A".repeat(255),
				reason: "A".repeat(2000),
				host: `${"host".repeat(60)}.example`,
				country_hidden: "hidden",
				asn_hidden: "hidden",
				asn_organization_hidden: "hidden",
				contact_hidden: "hidden",
				support: "",
			}),
		}),
	);
	await page.goto("/firewall-blocked-fixture");
	await expect(page.getByRole("heading", { name: labels.title })).toBeVisible();
	expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
	await expect(page.getByRole("link", { name: labels.contact_label })).toBeHidden();
	await expect(page.locator("dt").filter({ hasText: labels.asn_label })).toBeHidden();
	await expect(page.locator("dt").filter({ hasText: labels.country_label })).toBeHidden();
});
