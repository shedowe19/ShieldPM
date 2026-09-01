import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	analyticsLogsQuery: vi.fn(),
	closeSync: vi.fn(),
	openSync: vi.fn(),
	proxyHostQuery: vi.fn(),
	tailConstructor: vi.fn(),
	tailOn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		default: {
			...actual.default,
			closeSync: mocks.closeSync,
			openSync: mocks.openSync,
		},
	};
});

vi.mock("tail", () => ({
	Tail: class {
		constructor(logFile) {
			mocks.tailConstructor(logFile);
		}

		on(event, handler) {
			mocks.tailOn(event, handler);
			return this;
		}
	},
}));

vi.mock("../../models/analytic_count.js", () => ({ default: {} }));

vi.mock("../../models/analytics_logs.js", () => ({
	default: {
		query: mocks.analyticsLogsQuery,
	},
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: mocks.proxyHostQuery,
	},
}));

import { AnalyticsService } from "../../internal/analytics.js";

const existingFileError = () => Object.assign(new Error("already exists"), { code: "EEXIST" });

const configureDatabaseMocks = () => {
	mocks.proxyHostQuery.mockReturnValue({
		where: () => ({ select: vi.fn().mockResolvedValue([]) }),
	});
	mocks.analyticsLogsQuery.mockReturnValue({
		where: () => ({ delete: vi.fn().mockResolvedValue(0) }),
	});
};

const createSpool = () => ({
	close: vi.fn(),
	compact: vi.fn().mockReturnValue(false),
	getReplayFloor: vi.fn().mockReturnValue(1),
	open: vi.fn(),
	peek: vi.fn().mockReturnValue([]),
	pendingCount: 0,
});

describe("AnalyticsService initialization", () => {
	let setIntervalSpy;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.openSync.mockImplementation(() => {
			throw existingFileError();
		});
		configureDatabaseMocks();
		setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue({});
	});

	afterEach(() => {
		setIntervalSpy.mockRestore();
	});

	it("allows a later retry when the log file cannot be initialized", async () => {
		const service = new AnalyticsService("/tmp/shieldpm-analytics-init.log", { spool: createSpool() });
		mocks.openSync.mockImplementationOnce(() => {
			throw Object.assign(new Error("permission denied"), { code: "EACCES" });
		});

		await service.init();
		expect(mocks.tailConstructor).not.toHaveBeenCalled();

		await service.init();
		expect(mocks.tailConstructor).toHaveBeenCalledTimes(1);
	});

	it("allows a later retry when tail construction fails without leaving timers behind", async () => {
		const service = new AnalyticsService("/tmp/shieldpm-analytics-init.log", { spool: createSpool() });
		mocks.tailConstructor.mockImplementationOnce(() => {
			throw new Error("tail initialization failed");
		});

		await service.init();
		expect(setIntervalSpy).not.toHaveBeenCalled();

		await service.init();
		expect(mocks.tailConstructor).toHaveBeenCalledTimes(2);
		expect(setIntervalSpy).toHaveBeenCalledTimes(3);
	});

	it("creates one tail and one timer set when startup retries initialization", async () => {
		const service = new AnalyticsService("/tmp/shieldpm-analytics-init.log", { spool: createSpool() });

		await service.init();
		await service.init();

		expect(mocks.tailConstructor).toHaveBeenCalledTimes(1);
		expect(mocks.tailOn).toHaveBeenCalledTimes(2);
		expect(mocks.proxyHostQuery).toHaveBeenCalledTimes(1);
		expect(setIntervalSpy).toHaveBeenCalledTimes(3);
	});
});
