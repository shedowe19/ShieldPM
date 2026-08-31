import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

describe("ChatOps integration-bound principal", () => {
	let chatSource;
	let accessSource;
	let routeSource;

	beforeEach(() => {
		chatSource = fs.readFileSync(backendSourcePath("internal", "chat.js"), "utf8");
		accessSource = fs.readFileSync(backendSourcePath("lib", "integration-access.js"), "utf8");
		routeSource = fs.readFileSync(backendSourcePath("routes", "chat.js"), "utf8");
	});

	it("does not synthesize a JWT or session for Telegram", () => {
		expect(chatSource).not.toContain("jwt.sign");
		expect(chatSource).not.toContain("generatedToken");
		expect(chatSource).toContain("createIntegrationAccess(integration.id, userId)");
	});

	it("accepts private chats only and verifies the bound principal before dispatch", () => {
		expect(chatSource).toContain('ctx.chat?.type !== "private"');
		expect(chatSource).toContain("await integrationAccess.load()");
		expect(chatSource.indexOf("await integrationAccess.load()")).toBeLessThan(chatSource.indexOf("return next()"));
	});

	it("rechecks enabled integration, allow-list, owner state and permissions from the database", () => {
		expect(accessSource).toContain('.where("enabled", 1)');
		expect(accessSource).toContain("allowed_ids");
		expect(accessSource).toContain("integration.user.is_disabled");
		expect(accessSource).toContain("integration.user.permissions");
		expect(accessSource).toContain("const can = async (permission, data)");
	});

	it("prevents users from updating or deleting another owner's integration", () => {
		const updateRoute = routeSource.slice(
			routeSource.indexOf('router.put("/:id"'),
			routeSource.indexOf("/**\n * DELETE"),
		);
		const deleteRoute = routeSource.slice(routeSource.indexOf('router.delete("/:id"'));
		expect(updateRoute.match(/\.where\("user_id", actorId\)/g) || []).toHaveLength(2);
		expect(
			updateRoute.indexOf('.where("user_id", actorId)', updateRoute.indexOf("patchAndFetchById") - 80),
		).toBeLessThan(updateRoute.indexOf("patchAndFetchById"));
		expect(deleteRoute.match(/\.where\("user_id", actorId\)/g) || []).toHaveLength(2);
		expect(deleteRoute.indexOf('.where("user_id", actorId)', deleteRoute.indexOf("deleteById") - 80)).toBeLessThan(
			deleteRoute.indexOf("deleteById"),
		);
		expect(routeSource).toContain("if (deleted !== 1) throw new errs.ItemNotFoundError()");
	});

	it("never returns the stored encrypted bot token", () => {
		expect(routeSource).toContain("delete output.token");
		expect(routeSource).toContain("integrations.map(publicIntegration)");
		expect(routeSource.match(/res\.json\(publicIntegration\(/g) || []).toHaveLength(2);
	});
});
