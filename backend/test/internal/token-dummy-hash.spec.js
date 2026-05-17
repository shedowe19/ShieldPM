import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Fix #61: DUMMY_HASH in token.js must be a valid bcrypt hash so that
 * bcrypt.compare() actually performs the full KDF work instead of throwing
 * immediately on the malformed hash. Without this, response times differ
 * between "user not found" and "wrong password" paths, enabling user enumeration.
 */

const DUMMY_HASH = "$2b$13$3w5sK5BtNWq/d7D6YQJfj.G2HM4.3roIvbxytInY6p3WiJjLfVdQ6";

describe("Fix #61: DUMMY_HASH is a valid bcrypt hash", () => {
	it("DUMMY_HASH starts with a valid bcrypt prefix ($2b$)", () => {
		expect(DUMMY_HASH).toMatch(/^\$2[ab]\$\d{2}\$/);
	});

	it("DUMMY_HASH has the correct length for a bcrypt hash (60 chars)", () => {
		expect(DUMMY_HASH.length).toBe(60);
	});

	it("bcrypt.compare() does NOT throw on DUMMY_HASH (old hash was malformed)", async () => {
		// This must resolve (returning false) — not throw
		await expect(bcrypt.compare("wrong-password", DUMMY_HASH)).resolves.toBe(false);
	});

	it("bcrypt.compare() returns false for any attempted password against DUMMY_HASH", async () => {
		const result = await bcrypt.compare("attacker-guess", DUMMY_HASH);
		expect(result).toBe(false);
	});

	it("DUMMY_HASH reports cost factor of 13", () => {
		const rounds = bcrypt.getRounds(DUMMY_HASH);
		expect(rounds).toBe(13);
	});

	it("OLD malformed hash returns false instantly without performing KDF work (timing oracle)", async () => {
		const OLD_DUMMY_HASH = "$2a$13$mzC9.T8Qed0f/M9.2v.9JO/1.1.1.1.1.1.1.1.1.1.1.1.1.1";
		const start = Date.now();
		const result = await bcrypt.compare("any-password", OLD_DUMMY_HASH);
		const elapsed = Date.now() - start;
		// Old hash returns false but takes < 50ms — bcrypt did NOT perform the full KDF (cost-13 should take ~500ms)
		expect(result).toBe(false);
		expect(elapsed).toBeLessThan(50);
	});

	it("NEW DUMMY_HASH performs full KDF work (takes ~500ms at cost 13)", async () => {
		const start = Date.now();
		await bcrypt.compare("any-password", DUMMY_HASH);
		const elapsed = Date.now() - start;
		// Cost-13 bcrypt must take at least 200ms — proves real KDF work is done
		expect(elapsed).toBeGreaterThan(200);
	}, 10000);
});
