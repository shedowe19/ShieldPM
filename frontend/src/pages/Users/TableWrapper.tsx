import { IconPlus, IconSearch, IconUsers } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteUser, toggleUser } from "src/api/backend";
import { LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useAuthState } from "src/context";
import { useHealth, useUser, useUsers } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showPermissionsModal, showSetPasswordModal, showUserModal } from "src/modals";
import { showError, showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const { loginAs } = useAuthState();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useUsers(["permissions"]);
	const { data: currentUser } = useUser("me");
	const health = useHealth();

	const handleLoginAs = useCallback(
		async (id: number) => {
			try {
				await loginAs(id);
			} catch (err) {
				if (err instanceof Error) {
					showError(err.message);
				}
			}
		},
		[loginAs],
	);

	const handleDelete = useCallback(async (id: number) => {
		await deleteUser(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.USER, "deleted");
	}, []);

	const handleDisableToggle = useCallback(
		async (id: number, enabled: boolean) => {
			await toggleUser(id, enabled);
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.USER, id] });
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.USER, enabled ? "enabled" : "disabled");
		},
		[queryClient],
	);

	const filtered = useMemo(() => {
		if (search && data) {
			return data.filter((item) => {
				return (
					item.name.toLowerCase().includes(search) ||
					item.nickname.toLowerCase().includes(search) ||
					item.email.toLowerCase().includes(search)
				);
			});
		}
		return null;
	}, [search, data]);

	useEffect(() => {
		if (search !== "" && (!data || data.length === 0)) {
			setSearch("");
		}
	}, [search, data]);

	const handleEditUser = useCallback((id: number) => showUserModal(id), []);
	const handleEditPermissions = useCallback((id: number) => showPermissionsModal(id), []);
	const handleSetPassword = useCallback((id: number) => showSetPasswordModal(id), []);
	const handleNewUser = useCallback(() => showUserModal("new"), []);
	const handleDeleteConfirm = useCallback(
		(id: number) => {
			showDeleteConfirmModal({
				title: <T id="object.delete" tData={{ object: AUDIT_LOG_OBJECT_TYPE.USER }} />,
				onConfirm: () => handleDelete(id),
				invalidations: [["users"], [AUDIT_LOG_OBJECT_TYPE.USER, id]],
				children: <T id="object.delete.content" tData={{ object: AUDIT_LOG_OBJECT_TYPE.USER }} />,
			});
		},
		[handleDelete],
	);

	if (health.data?.demo) {
		return (
			<Card className="mt-4 border-t-4 border-red-500/50">
				<CardHeader>
					<CardTitle className="text-2xl font-bold flex items-center gap-2 text-red-500">
						<Lock className="h-6 w-6" />
						Access Denied
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">User Management is disabled in Demo Mode.</p>
						<p className="mt-2">For security reasons, managing users is not permitted.</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>
					<T id="notification.error" />
				</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="mt-4 border-t-4 border-orange-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconUsers className="h-6 w-6" />
					<T id="users" />
				</CardTitle>
				{data?.length ? (
					<div className="flex items-center space-x-2">
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
							/>
						</div>

						<Button
							size="sm"
							className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
							onClick={() => showUserModal("new")}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.USER }} />
						</Button>
					</div>
				) : null}
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					currentUserId={currentUser?.id}
					onEditUser={handleEditUser}
					onEditPermissions={handleEditPermissions}
					onSetPassword={handleSetPassword}
					onDeleteUser={handleDeleteConfirm}
					onDisableToggle={handleDisableToggle}
					onNewUser={handleNewUser}
					onLoginAs={handleLoginAs}
				/>
			</CardContent>
		</Card>
	);
}
