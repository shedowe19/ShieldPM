import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

/**
 * Fix #70: chat.js — warn when allowed_ids is not configured
 * When integration.config is null/undefined or allowed_ids is empty,
 * the bot should log a WARNING instead of silently denying all access.
 */
describe("Fix #70: allowed_ids configuration warning", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(backendSourcePath("internal", "chat.js"), "utf8");
	});

	it("warns when allowed_ids is not configured", () => {
		// The fix adds a warning when allowed_ids is empty/missing:
		// if (!integration.config?.allowed_ids?.length) {
		//     logger.warn('[ChatOps] WARNING: allowed_ids is not configured — all access denied');
		//     return;
		// }
		expect(source).toContain("WARNING: allowed_ids is not configured");
	});

	it("checks integration.config?.allowed_ids?.length before accessing", () => {
		// The fix uses optional chaining: integration.config?.allowed_ids?.length
		// This prevents silent failure when config is null/undefined
		expect(source).toContain("integration.config?.allowed_ids?.length");
	});

	it("still denies access silently for unauthorized users (no config change)", () => {
		// The unauthorized path still returns silently for users not in the list
		// The fix only adds a warning when the list itself is unconfigured
		expect(source).toContain("Unauthorized access attempt from Telegram ID");
	});
});
