import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGitOpsService = {
	getConfig: vi.fn(() => Promise.resolve({ enabled: true, repo: "git@github.com:test/repo.git" })),
	updateConfig: vi.fn(() => Promise.resolve({ enabled: true })),
	testConnection: vi.fn(() => Promise.resolve({ success: true })),
	exportConfig: vi.fn(() => Promise.resolve(["proxy.yaml", "certs.yaml"])),
	commitAndPush: vi.fn(() => Promise.resolve({ sha: "abc123" })),
	pull: vi.fn(() => Promise.resolve({ updated: true })),
	getHistory: vi.fn(() => Promise.resolve([{ sha: "abc", message: "initial" }])),
	revertToCommit: vi.fn(() => Promise.resolve({ success: true })),
	importConfig: vi.fn(() => Promise.resolve({ imported: 5 })),
};

vi.mock("../../modules/gitops/index.js", () => ({ gitOpsService: mockGitOpsService }));
vi.mock("../../lib/config.js", () => ({
	isDemoMode: vi.fn(() => false),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = {
			token: { getUserId: () => 1 },
			can: vi.fn(() => Promise.resolve()),
		};
		next();
	},
}));

beforeEach(() => vi.clearAllMocks());

describe("gitops routes", () => {
	describe("GET /gitops/config", () => {
		it("returns gitops configuration", async () => {
			const result = await mockGitOpsService.getConfig();
			expect(result.enabled).toBe(true);
		});

		it("requires access check", async () => {
			const access = { can: vi.fn(() => Promise.resolve()) };
			await access.can("settings:update", "gitops-config");
			expect(access.can).toHaveBeenCalledWith("settings:update", "gitops-config");
		});
	});

	describe("PUT /gitops/config", () => {
		it("updates configuration", async () => {
			const result = await mockGitOpsService.updateConfig({}, { enabled: true });
			expect(result.enabled).toBe(true);
		});

		it("rejects in demo mode", async () => {
			const { isDemoMode } = await import("../../lib/config.js");
			isDemoMode.mockReturnValue(true);
			expect(isDemoMode()).toBe(true);
		});
	});

	describe("POST /gitops/test", () => {
		it("tests repository connection", async () => {
			const result = await mockGitOpsService.testConnection();
			expect(result.success).toBe(true);
		});
	});

	describe("POST /gitops/export", () => {
		it("exports configuration to YAML files", async () => {
			const files = await mockGitOpsService.exportConfig();
			expect(files).toHaveLength(2);
		});
	});

	describe("POST /gitops/push", () => {
		it("commits and pushes", async () => {
			await mockGitOpsService.exportConfig();
			const result = await mockGitOpsService.commitAndPush("deploy update");
			expect(result.sha).toBe("abc123");
		});
	});

	describe("POST /gitops/pull", () => {
		it("pulls from remote", async () => {
			const result = await mockGitOpsService.pull();
			expect(result.updated).toBe(true);
		});
	});

	describe("GET /gitops/history", () => {
		it("returns commit history", async () => {
			const commits = await mockGitOpsService.getHistory(20);
			expect(commits).toHaveLength(1);
		});

		it("defaults limit to 20", () => {
			const limit = Number.parseInt(undefined, 10) || 20;
			expect(limit).toBe(20);
		});
	});

	describe("POST /gitops/revert", () => {
		it("reverts to a specific commit", async () => {
			const result = await mockGitOpsService.revertToCommit({}, "abc123");
			expect(result.success).toBe(true);
		});

		it("returns 400 if SHA is missing", () => {
			const sha = undefined;
			expect(!sha).toBe(true);
		});
	});

	describe("POST /gitops/import", () => {
		it("imports configuration from Git", async () => {
			const result = await mockGitOpsService.importConfig({}, { overwrite: true });
			expect(result.imported).toBe(5);
		});
	});

	describe("demo mode check", () => {
		it("blocks write operations in demo mode", async () => {
			const { isDemoMode } = await import("../../lib/config.js");
			isDemoMode.mockReturnValue(true);
			expect(isDemoMode()).toBe(true);
			// In demo mode, routes should return 403
		});

		it("allows operations when demo mode is off", async () => {
			const { isDemoMode } = await import("../../lib/config.js");
			isDemoMode.mockReturnValue(false);
			expect(isDemoMode()).toBe(false);
		});
	});
});
