import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { HasPermission } from "src/components/HasPermission";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";
import { type ADMIN, MANAGE, type Permission, type Section } from "src/modules/Permissions";

interface Props {
	onNew?: () => void;
	isFiltered?: boolean;
	object: string;
	objects: string;
	color?: string;
	customAddBtn?: ReactNode;
	permissionSection?: Section | typeof ADMIN;
	permission?: Permission;
}

const getColorClass = (color: string) => {
	switch (color) {
		case "lime":
			return "bg-lime-600 hover:bg-lime-700 text-white";
		case "cyan":
			return "bg-cyan-600 hover:bg-cyan-700 text-white";
		case "pink":
			return "bg-pink-600 hover:bg-pink-700 text-white";
		case "yellow":
			return "bg-yellow-600 hover:bg-yellow-700 text-white";
		case "red":
			return "bg-red-600 hover:bg-red-700 text-white";
		case "blue":
			return "bg-blue-600 hover:bg-blue-700 text-white";
		case "orange":
			return "bg-orange-600 hover:bg-orange-700 text-white";
		default:
			return "bg-primary text-primary-foreground hover:bg-primary/90";
	}
};

function EmptyData({
	onNew,
	isFiltered,
	object,
	objects,
	color = "primary",
	customAddBtn,
	permissionSection,
	permission,
}: Props) {
	return (
		<div className="flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50">
			<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
				<FolderOpen className="h-10 w-10 text-muted-foreground/50" />
			</div>
			{isFiltered ? (
				<h3 className="mt-6 text-xl font-semibold">
					<T id="empty-search" />
				</h3>
			) : (
				<>
					<h3 className="mt-6 text-xl font-semibold">
						<T id="object.empty" tData={{ objects }} />
					</h3>
					<HasPermission section={permissionSection} permission={permission || MANAGE} hideError>
						<p className="mb-6 mt-2 text-muted-foreground max-w-sm mx-auto">
							<T id="empty-subtitle" />
						</p>
						{customAddBtn ? (
							customAddBtn
						) : (
							<Button
								className={
									color === "pink" ? "bg-pink-600 hover:bg-pink-700 text-white" : getColorClass(color)
								}
								onClick={onNew}
								size="lg"
							>
								<T id="object.add" tData={{ object }} />
							</Button>
						)}
					</HasPermission>
				</>
			)}
		</div>
	);
}

export { EmptyData };
