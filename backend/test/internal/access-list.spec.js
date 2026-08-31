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

	it("deletes old authentication rows before inserting replacements", () => {
		const updateStart = source.indexOf("update: async (access, data)");
		const getStart = source.indexOf("get: async (access, data", updateStart);
		const updateSection = source.slice(updateStart, getStart);
		const deleteIdx = updateSection.indexOf("await accessListAuthModel.query(trx).delete()");
		const insertIdx = updateSection.indexOf("await insertRows(", deleteIdx);

		expect(deleteIdx).toBeGreaterThan(-1);
		expect(insertIdx).toBeGreaterThan(-1);
		expect(deleteIdx).toBeLessThan(insertIdx);
	});

	it("documents that replacement occurs inside the row-locked transaction", () => {
		expect(source).toContain("Delete before insert, within the same row-locked transaction.");
	});

	it("takes the snapshot and performs replacement on the same transaction", () => {
		const updateStart = source.indexOf("update: async (access, data)");
		const getStart = source.indexOf("get: async (access, data", updateStart);
		const updateSection = source.slice(updateStart, getStart);

		expect(updateSection).toContain("transaction(accessListModel.knex(), async (trx)");
		expect(updateSection).toContain("snapshot = await snapshotAccessList(trx, data.id)");
		expect(updateSection).toContain("accessListAuthModel.query(trx)");
		expect(updateSection).toContain("accessListClientModel.query(trx)");
	});
});
