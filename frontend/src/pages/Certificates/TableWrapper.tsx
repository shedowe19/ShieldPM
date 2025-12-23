import { IconHelp, IconSearch, IconChevronDown, IconCertificate, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { deleteCertificate, downloadCertificate } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { useCertificates } from "src/hooks";
import { intl, T } from "src/locale";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showRenewCertificateModal,
} from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
// import { Button } from "src/components/ui/button"; // Using src/components which might conflict, let's use shadcn button aliased if needed or rely on src/components Button if it is shadcn now?
// Actually src/components index likely exports a Button. Previous migrations imported Button from src/components/ui/button. I will do the same here.
import { Button as ShadcnButton } from "src/components/ui/button";

import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useCertificates([
		"owner",
		"dead_hosts",
		"proxy_hosts",
		"redirection_hosts",
		"streams",
	]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	const handleDelete = async (id: number) => {
		await deleteCertificate(id);
		showObjectSuccess("certificate", "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item) =>
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.niceName.toLowerCase().includes(search),
		);
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-pink-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconCertificate className="h-6 w-6 text-pink-500" />
					<T id="certificates" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					{data?.length ? (
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
							/>
						</div>
					) : null}
					<ShadcnButton variant="outline" size="icon" onClick={() => showHelpModal("Certificates", "pink")}>
						<IconHelp className="h-4 w-4" />
					</ShadcnButton>
					<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
						{data?.length ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ShadcnButton
										size="sm"
										className="bg-pink-600/90 hover:bg-pink-600 text-white shadow-sm"
									>
										<IconPlus className="mr-2 h-4 w-4" />
										<T id="object.add" tData={{ object: "certificate" }} />
										<IconChevronDown className="ml-2 h-4 w-4 opacity-50" />
									</ShadcnButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => showHTTPCertificateModal()}>
										<T id="lets-encrypt-via-http" />
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => showDNSCertificateModal()}>
										<T id="lets-encrypt-via-dns" />
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => showCustomCertificateModal()}>
										<T id="certificates.custom" />
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onRenew={showRenewCertificateModal}
					onDownload={handleDownload}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "certificate" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["certificates"], ["certificate", id]],
							children: <T id="object.delete.content" tData={{ object: "certificate" }} />,
						})
					}
				/>
			</CardContent>
		</Card>
	);
}
