import { getAvatarImage, uploadAvatar } from "./avatar.js";
import { DEFAULT_AVATAR, detectAvatarFileType, getGravatarUrl, omissions } from "./constants.js";
import { create, deleteAll, loginAs, remove, setPassword, setPermissions, update } from "./mutations.js";
import { get, getAll, getCount, getUserOmisionsByAccess, isEmailAvailable } from "./reads.js";

export default {
	create,
	update,
	get,
	isEmailAvailable,
	delete: remove,
	deleteAll,
	getCount,
	getAll,
	getUserOmisionsByAccess,
	setPassword,
	setPermissions,
	loginAs,
	uploadAvatar,
	getAvatarImage,
	omissions,
	getGravatarUrl,
	DEFAULT_AVATAR,
	detectAvatarFileType,
};
