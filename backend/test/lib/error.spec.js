import { describe, expect, it } from "vitest";
import errs from "../../lib/error.js";

describe("error classes", () => {
	describe("PermissionError", () => {
		it("has correct defaults", () => {
			const e = new errs.PermissionError();
			expect(e.message).toBe("Permission Denied");
			expect(e.name).toBe("PermissionError");
			expect(e.status).toBe(403);
			expect(e.public).toBe(true);
			expect(e).toBeInstanceOf(Error);
		});

		it("accepts custom message and previous", () => {
			const prev = new Error("prev");
			const e = new errs.PermissionError("custom", prev);
			expect(e.message).toBe("custom");
			expect(e.previous).toBe(prev);
		});
	});

	describe("ItemNotFoundError", () => {
		it("includes id in message", () => {
			const e = new errs.ItemNotFoundError(42);
			expect(e.message).toBe("Not Found - 42");
			expect(e.status).toBe(404);
		});

		it("has default message when no id", () => {
			const e = new errs.ItemNotFoundError();
			expect(e.message).toBe("Not Found");
		});
	});

	describe("AuthError", () => {
		it("stores message_i18n", () => {
			const e = new errs.AuthError("bad", "auth.bad");
			expect(e.message).toBe("bad");
			expect(e.message_i18n).toBe("auth.bad");
			expect(e.status).toBe(400);
			expect(e.public).toBe(true);
		});
	});

	describe("InternalError", () => {
		it("is not public", () => {
			const e = new errs.InternalError("boom");
			expect(e.public).toBe(false);
			expect(e.status).toBe(500);
		});
	});

	describe("InternalValidationError", () => {
		it("has status 400 and not public", () => {
			const e = new errs.InternalValidationError("bad");
			expect(e.status).toBe(400);
			expect(e.public).toBe(false);
		});
	});

	describe("ConfigurationError", () => {
		it("is public with status 400", () => {
			const e = new errs.ConfigurationError("cfg");
			expect(e.status).toBe(400);
			expect(e.public).toBe(true);
		});
	});

	describe("CacheError", () => {
		it("has status 500 and not public", () => {
			const e = new errs.CacheError("cache");
			expect(e.status).toBe(500);
			expect(e.public).toBe(false);
		});
	});

	describe("ValidationError", () => {
		it("is public with status 400", () => {
			const e = new errs.ValidationError("val");
			expect(e.status).toBe(400);
			expect(e.public).toBe(true);
		});
	});

	describe("UnauthorizedError", () => {
		it("has default message and status 401", () => {
			const e = new errs.UnauthorizedError();
			expect(e.message).toBe("Unauthorized");
			expect(e.status).toBe(401);
			expect(e.public).toBe(true);
		});
	});

	describe("CommandError", () => {
		it("stores code and is not public", () => {
			const e = new errs.CommandError("stderr output", 127);
			expect(e.message).toBe("stderr output");
			expect(e.code).toBe(127);
			expect(e.public).toBe(false);
		});
	});

	describe("AssertionFailedError", () => {
		it("has status 400 and not public", () => {
			const e = new errs.AssertionFailedError("assert");
			expect(e.status).toBe(400);
			expect(e.public).toBe(false);
		});
	});
});
