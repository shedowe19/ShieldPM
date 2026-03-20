import crypto from "node:crypto";

const omissions = () => ["is_deleted", "permissions.id", "permissions.user_id", "permissions.created_on", "permissions.modified_on"];

const getGravatarUrl = (email) => {
	const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
	return `https://www.gravatar.com/avatar/${hash}?d=mm`;
};

const DEFAULT_AVATAR = getGravatarUrl("admin@example.com");

const AVATAR_SIGNATURES = [
	{
		mimeType: "image/png",
		extension: ".png",
		matches: (buffer) =>
			buffer.length >= 8 &&
			buffer[0] === 0x89 &&
			buffer[1] === 0x50 &&
			buffer[2] === 0x4e &&
			buffer[3] === 0x47 &&
			buffer[4] === 0x0d &&
			buffer[5] === 0x0a &&
			buffer[6] === 0x1a &&
			buffer[7] === 0x0a,
	},
	{
		mimeType: "image/jpeg",
		extension: ".jpg",
		matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
	},
	{
		mimeType: "image/gif",
		extension: ".gif",
		matches: (buffer) =>
			buffer.length >= 6 &&
			(buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a"),
	},
	{
		mimeType: "image/webp",
		extension: ".webp",
		matches: (buffer) =>
			buffer.length >= 12 &&
			buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
			buffer.subarray(8, 12).toString("ascii") === "WEBP",
	},
];

const detectAvatarFileType = (buffer) => {
	if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
	return AVATAR_SIGNATURES.find((signature) => signature.matches(buffer)) || null;
};

export { DEFAULT_AVATAR, detectAvatarFileType, getGravatarUrl, omissions };
