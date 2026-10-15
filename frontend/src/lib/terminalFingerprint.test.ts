import { expect, it } from "vitest";
import { terminalFingerprintError } from "./terminalFingerprint";

it.each([undefined, "", "SHA256:bad", `SHA256:${"A".repeat(43)}=`, `MD5:${"A".repeat(43)}`])(
	"rejects unconfirmed or invalid terminal fingerprint %s",
	(value) => {
		expect(terminalFingerprintError("terminal", value)).toBe("terminal.host-fingerprint.invalid");
	},
);
it("allows a trusted OpenSSH fingerprint and trims input whitespace", () => {
	expect(terminalFingerprintError("terminal", ` SHA256:${"A".repeat(43)} `)).toBeUndefined();
	expect(terminalFingerprintError("http", "")).toBeUndefined();
});
