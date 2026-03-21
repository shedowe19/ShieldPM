import fs from "node:fs";
import path from "node:path";
import errs from "../../lib/error.js";
import userModel from "../../models/user.js";
import { detectAvatarFileType } from "./constants.js";
import { get } from "./reads.js";

const uploadAvatar = async (access, data) => {
	await access.can("users:update", data.id);
	const user = await get(access, { id: data.id });
	if (!data.file) throw new errs.ValidationError("No file uploaded");
	const file = data.file;
	if (file.size > 2 * 1024 * 1024) throw new errs.ValidationError("File too large. Maximum size is 2MB.");
	if (!file.data || !Buffer.isBuffer(file.data)) throw new errs.ValidationError("Uploaded avatar data is invalid.");
	const detectedType = detectAvatarFileType(file.data);
	if (!detectedType) throw new errs.ValidationError("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.");
	const dataPath = process.env.DATA_PATH || "/data";
	const avatarDir = path.join(dataPath, "avatars");
	if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
	if (user.avatar_type === "upload" && user.avatar_value) {
		const oldPath = path.join(avatarDir, user.avatar_value);
		if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
	}
	const filename = `${user.id}-${Date.now()}${detectedType.extension}`;
	const filePath = path.join(avatarDir, filename);
	await fs.promises.writeFile(filePath, file.data);
	await userModel.query().patchAndFetchById(user.id, {
		avatar_type: "upload",
		avatar_value: filename,
		avatar: `/api/users/${user.id}/avatar/image`,
	});
	return { url: `/api/users/${user.id}/avatar/image`, mime_type: detectedType.mimeType };
};

const getAvatarImage = async (_access, data) => {
	const user = await userModel.query().findById(data.id);
	if (!user || user.avatar_type !== "upload" || !user.avatar_value)
		throw new errs.ItemNotFoundError("Avatar not found");
	const dataPath = process.env.DATA_PATH || "/data";
	const filePath = path.join(dataPath, "avatars", user.avatar_value);
	if (!fs.existsSync(filePath)) throw new errs.ItemNotFoundError("Avatar file missing");
	const fileBuffer = await fs.promises.readFile(filePath);
	const detectedType = detectAvatarFileType(fileBuffer);
	if (!detectedType) throw new errs.ValidationError("Avatar file has an invalid image signature.");
	return { filePath, mimeType: detectedType.mimeType };
};

export { getAvatarImage, uploadAvatar };
