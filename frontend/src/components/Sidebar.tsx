import {
	IconActivity,
	IconBook,
	IconDeviceDesktop,
	IconHome,
	IconLock,
	IconMenu2,
	IconMessageCircle,
	IconSettings,
	IconShield,
	IconUser,
} from "@tabler/icons-react";
import type React from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AiChatLauncher, AiChatLauncherTrigger } from "src/components/AiChat/AiChatLauncher";
import { HasPermission } from "src/components/HasPermission";
import { Button } from "src/components/ui/button";
import { ScrollArea } from "src/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "src/components/ui/sheet";
import { T } from "src/locale";
import {
	ACCESS_LISTS,
	ADMIN,
	ANALYTICS,
	CERTIFICATES,
	CLOUDFLARED_TUNNELS,
	DDNS_PROVIDERS,
	DEAD_HOSTS,
	type MANAGE,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	TOR_ONIONS,
	VIEW,
	WIREGUARD_PEERS,
} from "src/modules/Permissions";

interface MenuItem {
	label: string;
	icon?: React.ElementType;
	to?: string;
	items?: MenuItem[];
	permissionSection?: Section | typeof ADMIN;
	permission?: typeof VIEW | typeof MANAGE;
}

const menuItems: MenuItem[] = [
	{
		to: "/",
		icon: IconHome,
		label: "dashboard",
	},
	{
		to: "/analytics",
		icon: IconActivity,
		label: "analytics.title",
		permissionSection: ANALYTICS,
		permission: VIEW,
	},
	{
		icon: IconDeviceDesktop,
		label: "hosts",
		items: [
			{
				to: "/nginx/proxy",
				label: "proxy-hosts",
				permissionSection: PROXY_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nginx/redirection",
				label: "redirection-hosts",
				permissionSection: REDIRECTION_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nginx/stream",
				label: "streams",
				permissionSection: STREAMS,
				permission: VIEW,
			},
			{
				to: "/nginx/cloudflared",
				label: "cloudflared.title",
				permissionSection: CLOUDFLARED_TUNNELS,
				permission: VIEW,
			},
			{
				to: "/nginx/ddns",
				label: "ddns-providers",
				permissionSection: DDNS_PROVIDERS,
				permission: VIEW,
			},
			{
				to: "/nginx/tor",
				label: "tor.title",
				permissionSection: TOR_ONIONS,
				permission: VIEW,
			},
			{
				to: "/nginx/wireguard",
				label: "wireguard.title",
				permissionSection: WIREGUARD_PEERS,
				permission: VIEW,
			},
			{
				to: "/nginx/404",
				label: "dead-hosts",
				permissionSection: DEAD_HOSTS,
				permission: VIEW,
			},
		],
	},
	{
		to: "/access",
		icon: IconLock,
		label: "access-lists",
		permissionSection: ACCESS_LISTS,
		permission: VIEW,
	},
	{
		to: "/certificates",
		icon: IconShield,
		label: "certificates",
		permissionSection: CERTIFICATES,
		permission: VIEW,
	},
	{
		to: "/users",
		icon: IconUser,
		label: "users",
		permissionSection: ADMIN,
	},
	{
		to: "/audit-log",
		icon: IconBook,
		label: "auditlogs",
		permissionSection: ADMIN,
	},
	{
		to: "/chatops",
		icon: IconMessageCircle,
		label: "ChatOps",
		permissionSection: ADMIN,
	},
	{
		to: "/settings",
		icon: IconSettings,
		label: "settings",
		permissionSection: ADMIN,
	},
];

const SidebarItem = ({ item, onClick }: { item: MenuItem; onClick?: () => void }) => {
	const location = useLocation();
	const [isOpen, setIsOpen] = useState(false);
	const isActive = item.to ? location.pathname === item.to : false;
	const isChildActive = item.items?.some((sub) => sub.to && location.pathname === sub.to);

	if (item.items && item.items.length > 0) {
		return (
			<HasPermission section={item.permissionSection} permission={item.permission || VIEW} hideError>
				<div className="space-y-1">
					<Button
						variant={isActive || isChildActive ? "secondary" : "ghost"}
						className="w-full justify-start"
						onClick={() => setIsOpen(!isOpen)}
					>
						{item.icon && <item.icon className="mr-2 h-4 w-4" />}
						<span className="flex-1 text-left">
							<T id={item.label} />
						</span>
					</Button>
					{isOpen || isChildActive ? (
						<div className="ml-4 space-y-1 border-l pl-2">
							{item.items.map((subitem, idx) => (
								<SidebarItem key={`${idx}-${subitem.to}`} item={subitem} onClick={onClick} />
							))}
						</div>
					) : null}
				</div>
			</HasPermission>
		);
	}

	return (
		<HasPermission section={item.permissionSection} permission={item.permission || VIEW} hideError>
			<Button
				asChild
				variant={isActive ? "secondary" : "ghost"}
				className="w-full justify-start"
				onClick={onClick}
			>
				<Link to={item.to || "#"}>
					{item.icon && <item.icon className="mr-2 h-4 w-4" />}
					<T id={item.label} />
				</Link>
			</Button>
		</HasPermission>
	);
};

export function Sidebar() {
	return (
		<AiChatLauncher>
			{/* Mobile Trigger */}
			<div className="lg:hidden p-4 border-b flex items-center gap-4 bg-background">
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon">
							<IconMenu2 />
							<span className="sr-only">
								<T id="sr.toggle-navigation" />
							</span>
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-[280px] p-0">
						<div className="flex flex-col h-full bg-slate-950 text-slate-100 border-r-slate-800">
							<div className="p-6">
								<Link to="/" className="flex items-center gap-2 font-semibold">
									<img src="/images/logo-no-text.svg" alt="ShieldPM" className="h-8 w-8" />
									<span className="text-lg">ShieldPM</span>
								</Link>
							</div>
							<ScrollArea className="flex-1 px-4">
								<nav className="flex flex-col gap-2 py-4">
									{menuItems.map((item) => (
										<SidebarItem key={item.to || item.label} item={item} />
									))}
									<div className="pt-4 border-t border-slate-800 mt-2">
										<AiChatLauncherTrigger />
									</div>
								</nav>
							</ScrollArea>
						</div>
					</SheetContent>
				</Sheet>
				<div className="flex-1">
					<Link to="/" className="flex items-center gap-2 font-semibold">
						<img src="/images/logo-no-text.svg" alt="ShieldPM" className="h-6 w-6" />
						<span className="text-lg">ShieldPM</span>
					</Link>
				</div>
			</div>

			{/* Desktop Sidebar */}
			<div className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-[240px] bg-slate-950 text-slate-100 border-r border-slate-800 z-40">
				<div className="p-6">
					<Link to="/" className="flex items-center gap-2 font-semibold">
						<img src="/images/logo-no-text.svg" alt="ShieldPM" className="h-8 w-8" />
						<span className="text-xl">ShieldPM</span>
					</Link>
				</div>
				<ScrollArea className="flex-1 px-4">
					<nav className="flex flex-col gap-2 py-4">
						{menuItems.map((item) => (
							<SidebarItem key={item.to || item.label} item={item} />
						))}
						<div className="pt-4 border-t border-slate-800 mt-2">
							<AiChatLauncherTrigger />
						</div>
					</nav>
				</ScrollArea>
			</div>
		</AiChatLauncher>
	);
}
