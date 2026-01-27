import * as api from "./base";

export interface UploadAvatarPayload {
	id: number | "me";
	file: File;
}

export const uploadUserAvatar = async ({ id, file }: UploadAvatarPayload) => {
	const formData = new FormData();
	formData.append("avatar", file);

	// api.post handles the response data extraction typically?
	// check uploadCertificate: return await api.post({...})
	// api.post signature?
	// I'll assume it returns the data.
	return await api.post<{ url: string }>({
		url: `/users/${id}/avatar`,
		data: formData,
	});
};
