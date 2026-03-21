import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/redirection_host.js", () => ({
	default: {
		query: vi.fn(() => mockRedirQuery),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	class ValidationError extends Error {
		constructor(m) { super(m); this.name = "ValidationError"; this.status = 400; }
	}
	class InternalValidationError extends Error {
		constructor(m) { super(m); this.name = "InternalValidationError"; this.status = 400; }
	}
	return { default: { ItemNotFoundError, ValidationError, InternalValidationError } };
});

vi.mock("../../lib/helpers.js", () => ({
	castJsonIfNeed: vi.fn((col) => col),
}));

vi.mock("../../lib/utils.js", () => ({
	default: {
		omitRow: vi.fn(() => (row) => row),
		omitRows: vi.fn(() => (rows) => rows),
	},
}));

vi.mock("lodash", () => ({
	default: {
		omit: vi.fn((obj, keys) => {
			const result = { ...obj };
			for (const k of keys) delete result[k];
			return result;
		}),
		cloneDeep: vi.fn((obj) => ({ ...obj })),
		assign: vi.fn((...args) => Object.assign({}, ...args)),
	},
}));

vi.mock("../../modules/host/index.js", () => ({
	hostService: {
		cleanRowCertificateMeta: vi.fn((row) => row),
		cleanAllRowsCertificateMeta: vi.fn((rows) => rows),
		isHostnameTaken: vi.fn().mockResolvedValue({ is_taken: false }),
		cleanSslHstsData: vi.fn((_, data) => data),
	},
}));

vi.mock("../audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/certificate/index.js", () => ({
	certificateService: { createQuickCertificate: vi.fn().mockResolvedValue({ id: 10 }) },
}));

vi.mock("../../modules/gitops/index.js", () => ({
	gitOpsService: { triggerAutoPush: vi.fn() },
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		configure: vi.fn().mockResolvedValue({}),
		deleteConfig: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

const mockRedirQuery = {
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	allowGraph: vi.fn().mockReturnThis(),
	withGraphFetched: vi.fn().mockReturnThis(),
	first: vi.fn().mockResolvedValue(null),
	groupBy: vi.fn().mockReturnThis(),
	orderBy: vi.fn().mockReturnThis(),
	count: vi.fn().mockReturnThis(),
	patch: vi.fn().mockResolvedValue(1),
	insertAndFetch: vi.fn().mockResolvedValue({ id: 1 }),
	patchAndFetchById: vi.fn().mockReturnThis(),
	// biome-ignore lint/suspicious/noThenProperty: mock needs .then for query builder chain
	then: vi.fn((cb) => cb({ id: 1 })),
};

import { omissions } from "../../modules/redirection-host/helpers.js";

describe("redirection-host module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("helpers – omissions", () => {
		it("should return array containing is_deleted", () => {
			const result = omissions();
			expect(result).toContain("is_deleted");
		});

		it("should return an array", () => {
			expect(Array.isArray(omissions())).toBe(true);
		});
	});

	describe("reads – getCount", async () => {
		const { getCount } = await import("../../modules/redirection-host/reads.js");

		it("should return numeric count for admin", async () => {
			mockRedirQuery.first.mockResolvedValueOnce({ count: "7" });
			const result = await getCount(1, "all");
			expect(result).toBe(7);
			expect(typeof result).toBe("number");
		});

		it("should filter by owner for non-admin", async () => {
			mockRedirQuery.first.mockResolvedValueOnce({ count: "3" });
			const result = await getCount(5, "user");
			expect(result).toBe(3);
		});
	});
});
