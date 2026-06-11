import nodemailer from "nodemailer";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { monitoring as logger } from "../logger.js";
import Setting from "../models/setting.js";

const SMTP_CONFIG_ID = "smtp-notification-config";

const DEFAULT_SMTP_CONFIG = {
	enabled: false,
	host: "",
	port: 587,
	secure: false,
	username: "",
	password: "",
	from: "",
	to: [],
	subject_prefix: "[ShieldPM]",
};

const bool = (value) => value === true || value === 1 || value === "1" || value === "true";

const normalizeRecipients = (value) => {
	if (Array.isArray(value)) {
		return value.map((item) => String(item || "").trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(/[\n,;]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
};

const normalizeConfig = (data = {}, previousMeta = {}, options = {}) => {
	const encryptPassword = options.encryptPassword !== false;
	const next = {
		...DEFAULT_SMTP_CONFIG,
		...previousMeta,
		...data,
	};
	next.enabled = bool(next.enabled);
	next.host = String(next.host || "").trim();
	next.port = Math.max(1, Number(next.port || DEFAULT_SMTP_CONFIG.port));
	next.secure = bool(next.secure);
	next.username = String(next.username || "").trim();
	next.from = String(next.from || "").trim();
	next.to = normalizeRecipients(next.to);
	next.subject_prefix = String(next.subject_prefix || DEFAULT_SMTP_CONFIG.subject_prefix).trim();

	if (Object.hasOwn(data, "password") && encryptPassword) {
		next.password = data.password ? encrypt(String(data.password)) : "";
	} else if (Object.hasOwn(data, "password")) {
		next.password = data.password || "";
	} else {
		next.password = previousMeta.password || "";
	}

	return next;
};

const redactConfig = (config) => {
	const { password, ...publicConfig } = config;
	return {
		...publicConfig,
		password_set: Boolean(password),
	};
};

const getSettingRow = async () => Setting.query().where("id", SMTP_CONFIG_ID).first();

const getSmtpConfigInternal = async () => {
	const row = await getSettingRow();
	if (!row) return { ...DEFAULT_SMTP_CONFIG };
	const config = normalizeConfig(row.meta || {}, row.meta || {}, { encryptPassword: false });
	config.enabled = bool(row.value) && bool(config.enabled);
	if (config.password) {
		try {
			config.password = decrypt(config.password);
		} catch (err) {
			logger.warn(`Could not decrypt SMTP notification password: ${err.message}`);
			config.password = "";
		}
	}
	return config;
};

const assertSmtpReady = (config) => {
	if (!config.enabled) throw new errs.ValidationError("SMTP notifications are disabled");
	if (!config.host) throw new errs.ValidationError("SMTP host is required");
	if (!config.from) throw new errs.ValidationError("SMTP sender address is required");
	if (!config.to.length) throw new errs.ValidationError("At least one SMTP recipient is required");
};

const createTransport = (config) => {
	const transportConfig = {
		host: config.host,
		port: config.port,
		secure: config.secure,
	};
	if (config.username || config.password) {
		transportConfig.auth = {
			user: config.username,
			pass: config.password || "",
		};
	}
	return nodemailer.createTransport(transportConfig);
};

const statusLabel = (status) => {
	if (status === "up") return "RECOVERED";
	return String(status || "unknown").toUpperCase();
};

const buildMonitoringSubject = (config, monitor, currentStatus) => {
	const prefix = config.subject_prefix ? `${config.subject_prefix} ` : "";
	return `${prefix}Monitor ${statusLabel(currentStatus)}: ${monitor.name}`;
};

const buildMonitoringText = ({ monitor, check, previousStatus, currentStatus }) => {
	const lines = [
		`Monitor: ${monitor.name}`,
		`URL: ${monitor.url}`,
		`Status: ${statusLabel(currentStatus)}`,
		`Previous status: ${previousStatus || "unknown"}`,
	];
	if (typeof check.http_status !== "undefined" && check.http_status !== null) {
		lines.push(`HTTP status: ${check.http_status}`);
	}
	if (typeof check.latency_ms !== "undefined" && check.latency_ms !== null) {
		lines.push(`Latency: ${check.latency_ms} ms`);
	}
	if (check.error) {
		lines.push(`Error: ${check.error}`);
	}
	if (check.checked_on) {
		lines.push(`Checked on: ${check.checked_on}`);
	}
	lines.push("", "Open ShieldPM and check /monitoring for the full history.");
	return lines.join("\n");
};

const sendSmtpMail = async (config, message) => {
	assertSmtpReady(config);
	const transport = createTransport(config);
	const result = await transport.sendMail({
		from: config.from,
		to: config.to,
		subject: message.subject,
		text: message.text,
	});
	return {
		sent: true,
		message_id: result?.messageId || null,
	};
};

const notifications = {
	SMTP_CONFIG_ID,

	getSmtpConfig: async (access) => {
		await access.can("settings:get", SMTP_CONFIG_ID);
		const config = await getSmtpConfigInternal();
		return redactConfig(config);
	},

	setSmtpConfig: async (access, data) => {
		await access.can("settings:update", SMTP_CONFIG_ID);
		const row = await getSettingRow();
		const meta = normalizeConfig(data, row?.meta || {});
		const value = meta.enabled ? "true" : "false";
		const setting = {
			name: SMTP_CONFIG_ID,
			description: "SMTP Notification Configuration",
			value,
			meta,
		};

		if (row) {
			await Setting.query().where("id", SMTP_CONFIG_ID).patch(setting);
		} else {
			await Setting.query().insert({ id: SMTP_CONFIG_ID, ...setting });
		}

		return redactConfig(meta);
	},

	sendSmtpTest: async (access, data = {}) => {
		await access.can("settings:update", SMTP_CONFIG_ID);
		const config = await getSmtpConfigInternal();
		const recipients = normalizeRecipients(data.to || config.to);
		const effectiveConfig = { ...config, to: recipients.length ? recipients : config.to };
		const result = await sendSmtpMail(effectiveConfig, {
			subject: `${effectiveConfig.subject_prefix || "[ShieldPM]"} SMTP test`,
			text: "This is a ShieldPM SMTP notification test. If you received this email, SMTP alerts are configured correctly.",
		});
		return result;
	},

	sendMonitoringAlert: async ({ monitor, check, previousStatus, currentStatus }) => {
		const config = await getSmtpConfigInternal();
		if (!config.enabled) {
			return { sent: false, skipped: "disabled" };
		}
		return sendSmtpMail(config, {
			subject: buildMonitoringSubject(config, monitor, currentStatus),
			text: buildMonitoringText({ monitor, check, previousStatus, currentStatus }),
		});
	},
};

export default notifications;
