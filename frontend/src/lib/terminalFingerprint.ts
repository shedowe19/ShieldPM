import { FORWARD_SCHEME } from "src/types/enums";

export function terminalFingerprintError(scheme: string | undefined, value: string | undefined): string | undefined {
	if (scheme !== FORWARD_SCHEME.TERMINAL) return;
	return /^SHA256:[A-Za-z0-9+/]{43}$/.test(value?.trim() ?? "") ? undefined : "terminal.host-fingerprint.invalid";
}
