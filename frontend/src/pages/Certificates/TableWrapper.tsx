import { IconCertificate, IconChevronDown, IconHelp, IconPlus, IconSearch, IconShieldLock } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { type Certificate, deleteCertificate, downloadCertificate, downloadRootCa } from "src/api/backend";
import { HasPermission } from "src/components/HasPermission";
import { LoadingPage } from "src/components/LoadingPage";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button as ShadcnButton } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { Input } from "src/components/ui/input";
import { useCertificates } from "src/hooks/useCertificates";
import { intl, T } from "src/locale";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showInternalCertificateModal,
	showRenewCertificateModal,
} from "./lazy";
import Table from "./Table";

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
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.CERTIFICATE, "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id);
		} catch (err) {
			if (err instanceof Error) showError(err.message);
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item: Certificate) =>
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
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setSearch(e.target.value.toLowerCase().trim())
								}
							/>
						</div>
					) : null}
					<ShadcnButton
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={() => showHelpModal("Certificates", "pink")}
					>
						<IconHelp className="h-4 w-4" />
					</ShadcnButton>
					<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
						<ShadcnButton
							variant="outline"
							onClick={() => downloadRootCa()}
							title={intl.formatMessage({ id: "certificates.download_root_ca" })}
						>
							<IconCertificate className="mr-2 h-4 w-4" />
							<T id="certificates.root_ca" />
						</ShadcnButton>
						{data?.length ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ShadcnButton
										size="sm"
										className="bg-pink-600/90 hover:bg-pink-600 text-white shadow-sm"
									>
										<IconPlus className="mr-2 h-4 w-4" />
										<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }} />
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
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => showInternalCertificateModal()}>
										<IconShieldLock className="mr-2 h-4 w-4" />
										<T id="certificates.internal" />
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
							title: <T id="object.delete" tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["certificates"], [AUDIT_LOG_OBJECT_TYPE.CERTIFICATE, id]],
							children: (
								<T id="object.delete.content" tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }} />
							),
						})
					}
				/>
			</CardContent>
		</Card>
	);
}
