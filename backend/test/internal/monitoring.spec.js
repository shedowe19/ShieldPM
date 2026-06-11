import { beforeEach, describe, expect, it, vi } from "vitest";
import monitoring from "../../internal/monitoring.js";
import notifications from "../../internal/notifications.js";
import Monitor from "../../models/monitor.js";
import MonitorCheck from "../../models/monitor_check.js";

vi.mock("../../models/monitor.js", () => ({
	default: {
		query: vi.fn(),
	},
}));

vi.mock("../../models/monitor_check.js", () => ({
	default: {
		query: vi.fn(),
	},
}));

vi.mock("../../internal/notifications.js", () => ({
	default: {
		sendMonitoringAlert: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../logger.js", () => {
	const loggerMock = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	};
	return {
		global: loggerMock,
		monitoring: loggerMock,
	};
});

const fetchMock = vi.fn();
global.fetch = fetchMock;

const mockPersistence = () => {
	const insert = vi.fn().mockResolvedValue({ id: 10 });
	const patchAndFetchById = vi.fn().mockImplementation((_id, patch) => Promise.resolve({ id: _id, ...patch }));

	MonitorCheck.query.mockReturnValue({ insert });
	Monitor.query.mockReturnValue({ patchAndFetchById });

	return { insert, patchAndFetchById };
};

describe("Monitoring Service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
	});

	it("marks an HTTP monitor as up when status and body match", async () => {
		const { insert, patchAndFetchById } = mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 200,
			ok: true,
			text: async () => "ShieldPM is healthy",
		});

		const result = await monitoring.runCheck({
			id: 1,
			type: "http",
			url: "https://example.com/health",
			method: "GET",
			expected_status: 200,
			expected_body: "healthy",
			timeout_seconds: 5,
			failure_threshold: 2,
			consecutive_failures: 1,
		});

		expect(result.status).toBe("up");
		expect(result.http_status).toBe(200);
		expect(result.latency_ms).toBeGreaterThanOrEqual(0);
		expect(insert).toHaveBeenCalledWith(expect.objectContaining({ monitor_id: 1, status: "up", http_status: 200 }));
		expect(patchAndFetchById).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "up",
				last_error: null,
				last_http_status: 200,
				consecutive_failures: 0,
			}),
		);
	});

	it("marks a first HTTP failure as degraded until the failure threshold is reached", async () => {
		const { insert, patchAndFetchById } = mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 502,
			ok: false,
			text: async () => "Bad Gateway",
		});

		const result = await monitoring.runCheck({
			id: 2,
			type: "http",
			url: "https://example.com/",
			method: "GET",
			expected_status: 200,
			timeout_seconds: 5,
			failure_threshold: 3,
			consecutive_failures: 1,
		});

		expect(result.status).toBe("degraded");
		expect(result.error).toContain("Expected HTTP 200");
		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({ monitor_id: 2, status: "degraded", http_status: 502 }),
		);
		expect(patchAndFetchById).toHaveBeenCalledWith(
			2,
			expect.objectContaining({ status: "degraded", consecutive_failures: 2, last_http_status: 502 }),
		);
	});

	it("marks an HTTP monitor as down when the expected body text is missing", async () => {
		const { patchAndFetchById } = mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 200,
			ok: true,
			text: async () => "service booting",
		});

		const result = await monitoring.runCheck({
			id: 3,
			type: "http",
			url: "https://example.com/health",
			method: "GET",
			expected_status: 200,
			expected_body: "ready",
			timeout_seconds: 5,
			failure_threshold: 1,
			consecutive_failures: 0,
		});

		expect(result.status).toBe("down");
		expect(result.error).toContain("Expected body text not found");
		expect(patchAndFetchById).toHaveBeenCalledWith(
			3,
			expect.objectContaining({
				status: "down",
				consecutive_failures: 1,
				last_error: expect.stringContaining("Expected body text not found"),
			}),
		);
	});

	it("sends a notification when a monitor changes from degraded to down", async () => {
		mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 502,
			ok: false,
			text: async () => "Bad Gateway",
		});

		const result = await monitoring.runCheck({
			id: 4,
			name: "Internal Wiki",
			type: "http",
			url: "https://wiki.local",
			method: "GET",
			expected_status: 200,
			timeout_seconds: 5,
			failure_threshold: 3,
			consecutive_failures: 2,
			status: "degraded",
			notification_enabled: true,
		});

		expect(result.status).toBe("down");
		expect(notifications.sendMonitoringAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				monitor: expect.objectContaining({ id: 4, name: "Internal Wiki" }),
				previousStatus: "degraded",
				currentStatus: "down",
			}),
		);
	});

	it("does not send duplicate notifications while status remains down", async () => {
		mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 502,
			ok: false,
			text: async () => "Bad Gateway",
		});

		await monitoring.runCheck({
			id: 5,
			name: "Internal Wiki",
			type: "http",
			url: "https://wiki.local",
			method: "GET",
			expected_status: 200,
			timeout_seconds: 5,
			failure_threshold: 1,
			consecutive_failures: 1,
			status: "down",
			notification_enabled: true,
		});

		expect(notifications.sendMonitoringAlert).not.toHaveBeenCalled();
	});

	it("sends a recovery notification when a down monitor becomes up", async () => {
		mockPersistence();
		fetchMock.mockResolvedValueOnce({
			status: 200,
			ok: true,
			text: async () => "ready",
		});

		const result = await monitoring.runCheck({
			id: 6,
			name: "Internal Wiki",
			type: "http",
			url: "https://wiki.local",
			method: "GET",
			expected_status: 200,
			expected_body: "ready",
			timeout_seconds: 5,
			failure_threshold: 1,
			consecutive_failures: 4,
			status: "down",
			notification_enabled: true,
		});

		expect(result.status).toBe("up");
		expect(notifications.sendMonitoringAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				previousStatus: "down",
				currentStatus: "up",
			}),
		);
	});
});
