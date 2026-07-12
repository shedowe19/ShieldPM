import type { AuditLog } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { createAuditLogCsv } from "./audit-log-csv";

const headers = {
	action: "Action",
	createdOn: "Created at",
	metadata: "Metadata",
	objectId: "Object ID",
	objectType: "Object type",
	user: "User",
};

const auditLog: AuditLog = {
	action: "updated",
	createdOn: "2026-07-12T08:00:00.000Z",
	id: 73,
	meta: { domainNames: ["app.example.test"], enabled: true },
	modifiedOn: "2026-07-12T08:00:00.000Z",
	objectId: 42,
	objectType: "proxy_host",
	userId: 5,
};

describe("audit log CSV export", () => {
	it("writes audit rows with localized headers and metadata", () => {
		expect(createAuditLogCsv([auditLog], headers)).toBe(
			`"Created at","User","Action","Object type","Object ID","Metadata"\r\n"2026-07-12T08:00:00.000Z","5","updated","proxy_host","42","{""domainNames"":[""app.example.test""],""enabled"":true}"`,
		);
	});

	it("neutralizes formula-like audit values before writing CSV cells", () => {
		const formulaAuditLog = {
			...auditLog,
			action: "+SUM(1,1)",
			user: { name: '=HYPERLINK("https://attacker.invalid")' },
		} as AuditLog;

		expect(createAuditLogCsv([formulaAuditLog], headers)).toContain(
			`"'=HYPERLINK(""https://attacker.invalid"")","'+SUM(1,1)"`,
		);
	});
});
