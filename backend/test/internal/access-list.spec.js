import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

/**
 * Fix #68: Race condition in access-list.js — insert was happening BEFORE delete.
 * Correct order is: 1) delete old items, 2) insert new items.
 * Previously Promise.all(inserts) ran before delete query, so newly inserted
 * items could be immediately deleted by the subsequent delete query.
 */

describe("Fix #68: Delete before insert prevents race condition", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(backendSourcePath("internal", "access-list.js"), "utf8");
	});

	it("delete query appears before insert in the items section", () => {
		// Extract the items section specifically (between the items comment and clients comment)
		const itemsStart = source.indexOf("// Check for items and add/update/remove them");
		const clientsStart = source.indexOf("// Check for clients and add/update/remove them");
		const itemsSection = source.slice(itemsStart, clientsStart);

		const deleteIdx = itemsSection.indexOf("accessListAuthModel.query().delete()");
		const insertIdx = itemsSection.indexOf("await Promise.all(promises)");

		expect(deleteIdx).toBeGreaterThan(-1);
		expect(insertIdx).toBeGreaterThan(-1);
		// Delete must come BEFORE insert in the items section
		expect(deleteIdx).toBeLessThan(insertIdx);
	});

	it("comment documents the delete-before-insert order", () => {
		expect(source).toContain("1. First delete");
		expect(source).toContain("2. Then insert");
	});

	it("items section: await query before Promise.all(promises)", () => {
		const itemsStart = source.indexOf("// Check for items and add/update/remove them");
		const clientsStart = source.indexOf("// Check for clients and add/update/remove them");
		const itemsSection = source.slice(itemsStart, clientsStart);

		const awaitQueryIdx = itemsSection.indexOf("await query");
		const awaitPromiseIdx = itemsSection.indexOf("await Promise.all(promises)");

		expect(awaitQueryIdx).toBeGreaterThan(-1);
		expect(awaitPromiseIdx).toBeGreaterThan(-1);
		expect(awaitQueryIdx).toBeLessThan(awaitPromiseIdx);
	});
});
