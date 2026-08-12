import { IconDotsVertical, IconDownload, IconRefresh, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Certificate } from "src/api/backend";
import { EmptyData } from "src/components/EmptyData";
import { HasPermission } from "src/components/HasPermission";
import { CertificateInUseFormatter } from "src/components/Table/Formatter/CertificateInUseFormatter";
import { DateFormatter } from "src/components/Table/Formatter/DateFormatter";
import { DomainsFormatter } from "src/components/Table/Formatter/DomainsFormatter";
import { UserAvatar } from "src/components/Table/Formatter/UserAvatar";
import { TableLayout } from "src/components/Table/TableLayout";
import { shieldTableFeatures } from "src/components/Table/tableFeatures";
import { Button } from "src/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { intl, T } from "src/locale";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { AUDIT_LOG_OBJECT_TYPE, CERTIFICATE_PROVIDER } from "src/types/enums";
import {
	showCustomCertificateModal,
	showDNSCertificateModal,
	showHTTPCertificateModal,
	showInternalCertificateModal,
} from "./lazy";

interface Props {
	data: Certificate[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onDelete?: (id: number) => void;
	onRenew?: (id: number) => void;
	onDownload?: (id: number) => void;
}
export default function Table({ data, isFetching, onDelete, onRenew, onDownload, isFiltered }: Props) {
	const columnHelper = createColumnHelper<typeof shieldTableFeatures, Certificate>();
	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor("owner", {
					id: "owner",
					cell: (info) => {
						const value = info.getValue();
						return <UserAvatar url={value ? value.avatar : ""} name={value ? value.name : ""} />;
					},
					meta: {
						className: "w-1",
					},
				}),
				columnHelper.accessor("id", {
					id: "certificateId",
					header: "ID",
					meta: {
						className: "w-1 font-mono text-xs",
					},
				}),
				columnHelper.accessor((row) => row, {
					id: "domainNames",
					header: intl.formatMessage({ id: "column.name" }),
					cell: (info) => {
						const value = info.getValue();
						return (
							<DomainsFormatter
								domains={value.domainNames}
								createdOn={value.createdOn}
								niceName={value.niceName}
								provider={value.provider || ""}
							/>
						);
					},
				}),
				columnHelper.accessor((row) => row, {
					id: "provider",
					header: intl.formatMessage({ id: "column.provider" }),
					cell: (info) => {
						const r = info.getValue();
						if (r.provider === CERTIFICATE_PROVIDER.LETSENCRYPT) {
							if (r.meta?.dnsChallenge && r.meta?.dnsProvider) {
								return (
									<>
										<T id="lets-encrypt" /> &ndash; {r.meta?.dnsProvider}
									</>
								);
							}
							return <T id="lets-encrypt" />;
						}
						if (r.provider === "other") {
							return <T id="certificates.custom" />;
						}
						return <T id={r.provider} />;
					},
				}),
				columnHelper.accessor("expiresOn", {
					id: "expiresOn",
					header: intl.formatMessage({ id: "column.expires" }),
					cell: (info) => {
						return <DateFormatter value={info.getValue()} highlightPast />;
					},
				}),
				columnHelper.accessor((row) => row, {
					id: "proxyHosts",
					header: intl.formatMessage({ id: "column.status" }),
					cell: (info) => {
						const r = info.getValue();
						return (
							<CertificateInUseFormatter
								proxyHosts={r.proxyHosts || []}
								redirectionHosts={r.redirectionHosts || []}
								deadHosts={r.deadHosts || []}
								streams={r.streams || []}
							/>
						);
					},
				}),
				columnHelper.display({
					id: "id",
					cell: (info) => {
						return (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										className="h-8 w-8 p-0"
										aria-label={intl.formatMessage({ id: "sr.open-menu" })}
									>
										<IconDotsVertical className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuLabel>
										<T
											id="object.actions-title"
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }}
											data={{ id: info.row.original.id }}
										/>
									</DropdownMenuLabel>
									<DropdownMenuItem onClick={() => onRenew?.(info.row.original.id)}>
										<IconRefresh className="mr-2 h-4 w-4" />
										<T id="action.renew" />
									</DropdownMenuItem>
									<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
										<DropdownMenuItem onClick={() => onDownload?.(info.row.original.id)}>
											<IconDownload className="mr-2 h-4 w-4" />
											<T id="action.download" />
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-red-600 focus:text-red-500"
											onClick={() => onDelete?.(info.row.original.id)}
										>
											<IconTrash className="mr-2 h-4 w-4" />
											<T id="action.delete" />
										</DropdownMenuItem>
									</HasPermission>
								</DropdownMenuContent>
							</DropdownMenu>
						);
					},
					meta: {
						className: "text-end w-1",
					},
				}),
			]),
		[columnHelper, onDelete, onRenew, onDownload],
	);

	const tableInstance = useTable({
		features: shieldTableFeatures,
		columns,
		data,
		meta: {
			isFetching,
		},
	});

	const customAddBtn = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="default" className="bg-pink-600 hover:bg-pink-700 my-3">
					<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
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
					<T id="certificates.internal" />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object={AUDIT_LOG_OBJECT_TYPE.CERTIFICATE}
					objects="certificates"
					isFiltered={isFiltered}
					color="pink"
					customAddBtn={customAddBtn}
					permissionSection={CERTIFICATES}
				/>
			}
		/>
	);
}
