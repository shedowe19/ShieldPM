import * as api from "./base";

export interface BackupCodesCountResponse {
	remaining: number;
}

export interface BackupCodesRegenerateResponse {
	backupCodes: string[];
}

export async function get2faBackupCodeCount(userId: number | "me"): Promise<BackupCodesCountResponse> {
	return api.get({ url: `/users/${userId}/2fa/backup-codes/count` });
}

export async function regenerate2faBackupCodes(userId: number | "me"): Promise<BackupCodesRegenerateResponse> {
	return api.post({ url: `/users/${userId}/2fa/backup-codes/regenerate` });
}
