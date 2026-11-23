import { expect, test } from "@playwright/test";

const setupToken = process.env.E2E_SETUP_TOKEN || "e2e-token";
const password = "E2e-Password-123!";

test("sets up the instance, signs in, and creates a proxy host against the real backend", async ({ page }) => {
	await page.goto("/setup");
	await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
	await page.getByLabel("Full Name").fill("E2E Administrator");
	await page.getByLabel("Email address").fill("admin@e2e.test");
	await page.getByLabel("Setup token").fill(setupToken);
	await page.getByLabel("New Password").fill(password);
	await page.getByRole("button", { name: "Save" }).click();

	await expect(page.getByRole("heading", { name: "Top Proxy Hosts" })).toBeVisible({ timeout: 60_000 });

	const cookies = await page.context().cookies();
	const csrf = decodeURIComponent(cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value || "");
	const create = await page.request.post("/api/nginx/proxy-hosts", {
		headers: { "x-xsrf-token": csrf },
		data: {
			domain_names: ["e2e.local"],
			forward_scheme: "http",
			forward_host: "backend.test",
			forward_port: 8080,
		},
	});
	expect(create.status(), await create.text()).toBe(201);

	await page.goto("/nginx/proxy");
	await expect(page.getByRole("row").filter({ hasText: "e2e.local" })).toBeVisible();
});
