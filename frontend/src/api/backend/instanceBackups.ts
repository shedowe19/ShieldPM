import { del, download, get, post } from "./base";

export interface InstanceBackupRecord {
	id: string;
	name: string;
	createdOn: string;
	appVersion: string | null;
	database: string | null;
	size: number;
}
export interface InstanceBackupJob {
	id: string;
	kind: "create" | "preflight" | "restore";
	phase: string;
	status: "running" | "completed" | "failed";
	createdOn: string;
	error: string | null;
	result: { valid?: boolean; activation?: "next_restart" | null } | null;
}
export interface InstanceBackupState {
	backups: InstanceBackupRecord[];
	jobs: InstanceBackupJob[];
	pending: { id: string; phase: string; createdOn: string } | null;
	limits: { maxBytes: number };
	activation: "next_restart";
}
export const getInstanceBackups = (signal?: AbortSignal) =>
	get<InstanceBackupState>({ url: "/backups" }, signal ? { signal } : undefined);
export const createInstanceBackup = (data: { password: string; name: string }) =>
	post<InstanceBackupJob>({ url: "/backups", data });
export const preflightInstanceBackup = (data: { id: string; password: string }) =>
	post<InstanceBackupJob>({ url: `/backups/${data.id}/preflight`, data: { password: data.password } });
export const restoreInstanceBackup = (data: { id: string; password: string; confirmation: string }) =>
	post<InstanceBackupJob>({
		url: `/backups/${data.id}/restore`,
		data: { password: data.password, confirmation: data.confirmation },
	});
export const cancelInstanceRestore = () => del<{ canceled: boolean }>({ url: "/backups/pending" });
export const deleteInstanceBackup = (id: string) => del<{ deleted: boolean }>({ url: `/backups/${id}` });
export const downloadInstanceBackup = (id: string) =>
	download({ url: `/backups/${id}/download` }, `shieldpm-${id}.spmb`);
export const uploadInstanceBackup = (file: File) => {
	const data = new FormData();
	data.append("archive", file);
	return post<InstanceBackupRecord>({ url: "/backups/upload", data });
};
