import { IconLock, IconLogout, IconUser } from "@tabler/icons-react";
import { LocalePicker } from "src/components/LocalePicker";
import { ThemeSwitcher } from "src/components/ThemeSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "src/components/ui/avatar";
import { Button } from "src/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { useAuthState } from "src/context";
import { useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { showChangePasswordModal, showUserModal } from "src/modals/account-lazy";

export function SiteHeader() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 d-print-none">
			<div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4 justify-end">
				<div className="hidden md:flex gap-2">
					<LocalePicker />
					<ThemeSwitcher />
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full"
							aria-label={intl.formatMessage({ id: "sr.toggle-user-menu" })}
						>
							<Avatar className="h-8 w-8">
								<AvatarImage
									src={currentUser?.avatar || "/images/default-avatar.jpg"}
									alt={currentUser?.nickname}
								/>
								<AvatarFallback>{currentUser?.nickname?.substring(0, 2).toUpperCase()}</AvatarFallback>
							</Avatar>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none">{currentUser?.nickname}</p>
								<p className="text-xs leading-none text-muted-foreground">
									<T id={isAdmin ? "role.admin" : "role.standard-user"} />
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<div className="md:hidden">
							<div className="flex items-center justify-between p-2">
								<ThemeSwitcher />
								<LocalePicker />
							</div>
							<DropdownMenuSeparator />
						</div>
						<DropdownMenuItem onClick={() => void showUserModal("me")}>
							<IconUser className="mr-2 h-4 w-4" />
							<T id="user.edit-profile" />
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => void showChangePasswordModal("me")}>
							<IconLock className="mr-2 h-4 w-4" />
							<T id="user.change-password" />
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => logout()}>
							<IconLogout className="mr-2 h-4 w-4" />
							<T id="user.logout" />
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
