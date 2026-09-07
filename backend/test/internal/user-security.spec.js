import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), insert: vi.fn(), findById: vi.fn(), audit: vi.fn() }));
vi.mock("../../models/user.js", () => ({
	default: {
		transaction: async (callback) => callback({}),
		query: () => ({ patchAndFetchById: mocks.patch, findById: mocks.findById, insertAndFetch: mocks.insert }),
	},
}));
vi.mock("../../models/auth.js", () => ({ default: {} }));
vi.mock("../../models/user_permission.js", () => ({ default: { query: () => ({ insert: vi.fn() }) } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));

import service from "../../internal/user.js";
import errs from "../../lib/error.js";

const user = {
	id: 7,
	roles: [],
	is_disabled: false,
	email: "user@example.com",
	avatar_type: "gravatar",
	avatar_value: "",
};
const access = (admin = false) => ({
	token: { getUserId: () => 7 },
	can: vi.fn(async (permission) => {
		if (permission === "users:permissions" && !admin) throw new errs.PermissionError();
	}),
});

describe("user account privilege and avatar boundaries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(service, "get").mockResolvedValue({ ...user });
	});
	afterEach(() => vi.restoreAllMocks());

	it.each([{ roles: ["admin"] }, { is_disabled: true }])(
		"blocks a self-profile privilege change: %j",
		async (patch) => {
			await expect(service.update(access(), { id: 7, ...patch })).rejects.toMatchObject({ status: 403 });
			expect(mocks.patch).not.toHaveBeenCalled();
		},
	);

	it("allows unchanged account flags on an ordinary profile update", async () => {
		await service.update(access(), { id: 7, name: "Updated", roles: [], is_disabled: false });
		expect(mocks.patch).toHaveBeenCalledWith(7, expect.objectContaining({ name: "Updated" }));
	});

	it("allows an administrator to update roles", async () => {
		await service.update(access(true), { id: 7, roles: ["admin"] });
		expect(mocks.patch).toHaveBeenCalledWith(7, expect.objectContaining({ roles: ["admin"] }));
	});

	it.each(["../keys.json", "../avatars-private/secret.png", "8-123456.png"])(
		"rejects avatar path %s on profile updates and public reads",
		async (filename) => {
			await expect(
				service.update(access(), { id: 7, avatar_type: "upload", avatar_value: filename }),
			).rejects.toMatchObject({ status: 400 });
			mocks.findById.mockResolvedValue({ ...user, avatar_type: "upload", avatar_value: filename });
			await expect(service.getAvatarImage(null, { id: 7 })).rejects.toMatchObject({ status: 400 });
			expect(mocks.patch).not.toHaveBeenCalled();
		},
	);

	it("never deletes an arbitrary path left in an existing avatar record", async () => {
		service.get.mockResolvedValue({ ...user, avatar_type: "upload", avatar_value: "../keys.json" });
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		const unlink = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {});
		await expect(
			service.uploadAvatar(access(), {
				id: 7,
				file: { size: 8, data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(unlink).not.toHaveBeenCalled();
	});
	it("preserves a custom avatar URL when creating a user", async () => {
		vi.spyOn(service, "isEmailAvailable").mockResolvedValue(true);
		mocks.insert.mockResolvedValue({ id: 7 });
		await service.create(access(true), {
			name: "Test",
			nickname: "test",
			email: "test@example.com",
			avatar_type: "url",
			avatar_value: "https://example.com/avatar.png",
		});
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ avatar: "https://example.com/avatar.png", avatar_type: "url" }),
		);
	});
});
