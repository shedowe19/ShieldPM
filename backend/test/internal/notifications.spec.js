import { beforeEach, describe, expect, it, vi } from "vitest";
import notifications from "../../internal/notifications.js";
import Setting from "../../models/setting.js";

vi.mock("nodemailer", () => ({
	default: {
		createTransport: vi.fn(),
	},
}));

vi.mock("../../models/setting.js", () => ({
	default: {
		query: vi.fn(),
	},
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((value) => `encrypted:${value}`),
	decrypt: vi.fn((value) => value.replace(/^encrypted:/, "")),
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

const access = {
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: {
		getUserId: vi.fn(() => 1),
	},
};

const queryReturning = (row) => {
	const first = vi.fn().mockResolvedValue(row);
	const where = vi.fn(() => ({ first }));
	Setting.query.mockReturnValue({ where });
	return { where, first };
};

describe("Notification service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns SMTP settings without exposing the encrypted password", async () => {
		queryReturning({
			id: "smtp-notification-config",
			value: "true",
			meta: {
				enabled: true,
				host: "smtp.example.com",
				port: 587,
				secure: false,
				username: "alerts@example.com",
				password: "encrypted:secret-password",
				from: "alerts@example.com",
				to: ["ops@example.com"],
				subject_prefix: "[ShieldPM]",
			},
		});

		const config = await notifications.getSmtpConfig(access);

		expect(access.can).toHaveBeenCalledWith("settings:get", "smtp-notification-config");
		expect(config.password).toBeUndefined();
		expect(config.password_set).toBe(true);
		expect(config.host).toBe("smtp.example.com");
		expect(config.to).toEqual(["ops@example.com"]);
	});

	it("encrypts a new SMTP password when saving settings", async () => {
		const existing = {
			id: "smtp-notification-config",
			value: "false",
			meta: { password: "encrypted:old-secret" },
		};
		const first = vi.fn().mockResolvedValue(existing);
		const patch = vi.fn().mockResolvedValue(1);
		const where = vi.fn(() => ({ first, patch }));
		const insert = vi.fn().mockResolvedValue({});
		Setting.query.mockReturnValue({ where, insert });

		const saved = await notifications.setSmtpConfig(access, {
			enabled: true,
			host: "smtp.example.com",
			port: 465,
			secure: true,
			username: "alerts@example.com",
			password: "new-secret",
			from: "ShieldPM <alerts@example.com>",
			to: ["ops@example.com"],
			subject_prefix: "[ShieldPM]",
		});

		expect(access.can).toHaveBeenCalledWith("settings:update", "smtp-notification-config");
		expect(saved.password).toBeUndefined();
		expect(saved.password_set).toBe(true);
		expect(patch).toHaveBeenCalledWith(
			expect.objectContaining({
				value: "true",
				meta: expect.objectContaining({ password: "encrypted:new-secret" }),
			}),
		);
	});

	it("sends a monitoring alert with decrypted SMTP credentials", async () => {
		const nodemailer = (await import("nodemailer")).default;
		const sendMail = vi.fn().mockResolvedValue({ messageId: "abc" });
		nodemailer.createTransport.mockReturnValue({ sendMail });
		queryReturning({
			id: "smtp-notification-config",
			value: "true",
			meta: {
				enabled: true,
				host: "smtp.example.com",
				port: 587,
				secure: false,
				username: "alerts@example.com",
				password: "encrypted:secret-password",
				from: "ShieldPM <alerts@example.com>",
				to: ["ops@example.com"],
				subject_prefix: "[ShieldPM]",
			},
		});

		await notifications.sendMonitoringAlert({
			monitor: { id: 7, name: "Internal Wiki", url: "https://wiki.local" },
			check: { status: "down", http_status: 502, latency_ms: 1234, error: "Expected HTTP 200, got 502" },
			previousStatus: "degraded",
			currentStatus: "down",
		});

		expect(nodemailer.createTransport).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "smtp.example.com",
				port: 587,
				secure: false,
				auth: { user: "alerts@example.com", pass: "secret-password" },
			}),
		);
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: ["ops@example.com"],
				subject: expect.stringContaining("DOWN"),
				text: expect.stringContaining("Internal Wiki"),
			}),
		);
	});
});
