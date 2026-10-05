import {
	IconArrowsCross,
	IconBolt,
	IconBoltOff,
	IconDisc,
	IconHistory,
	IconLock,
	IconNote,
	IconShield,
	IconUser,
} from "@tabler/icons-react";
import cn from "classnames";
import type { ReactNode } from "react";
import type { AuditLog } from "src/api/backend";
import { Badge } from "src/components/ui/badge";
import { getAuditLogObjectTypeMessageId } from "src/lib/audit-log-object-types";
import { formatDateTime, T } from "src/locale";
import { AUDIT_LOG_ACTION, AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface AuditMeta {
	name?: string;
	domainNames?: string[];
	incomingPort?: number;
	niceName?: string;
	id?: string;
	content?: string;
	onionAddress?: string;
	[key: string]: unknown;
}

const getEventValue = (event: AuditLog): ReactNode => {
	const meta = (event.meta || {}) as AuditMeta;

	switch (event.objectType) {
		case AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST:
		case AUDIT_LOG_OBJECT_TYPE.FIREWALL_LIST:
		case AUDIT_LOG_OBJECT_TYPE.USER:
			return meta.name ?? "N/A";
		case AUDIT_LOG_OBJECT_TYPE.PROXY_HOST:
		case AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST:
		case AUDIT_LOG_OBJECT_TYPE.DEAD_HOST:
			return meta.domainNames?.join(", ") || "N/A";
		case AUDIT_LOG_OBJECT_TYPE.STREAM:
			return meta.incomingPort ? String(meta.incomingPort) : "N/A";
		case AUDIT_LOG_OBJECT_TYPE.CERTIFICATE:
			return meta.domainNames?.join(", ") || meta.niceName || "N/A";
		case AUDIT_LOG_OBJECT_TYPE.DDNS_PROVIDER:
		case AUDIT_LOG_OBJECT_TYPE.TERMINAL_HOST:
		case AUDIT_LOG_OBJECT_TYPE.CLOUDFLARED_TUNNEL:
		case AUDIT_LOG_OBJECT_TYPE.SETTING:
			return meta.name || meta.id || "N/A";
		case AUDIT_LOG_OBJECT_TYPE.DASHBOARD_NOTE:
			return meta.content || <T id="dashboard_note" />;
		case AUDIT_LOG_OBJECT_TYPE.TOR_ONION:
			return meta.onionAddress || "N/A";
		case AUDIT_LOG_OBJECT_TYPE.WIREGUARD_PEER:
			return typeof meta.name === "string" && meta.name.trim() ? (
				meta.name
			) : (
				<T id="audit-log.peer-id" data={{ id: event.objectId }} />
			);
		case AUDIT_LOG_OBJECT_TYPE.WIREGUARD_SETTINGS:
			return <T id="audit-log.filter.wireguard-settings" />;
		default:
			return (
				<T
					id="audit-log.unknown-object-type"
					data={{
						type:
							typeof event.objectType === "string" && event.objectType.trim() ? event.objectType : "N/A",
					}}
				/>
			);
	}
};

const getColorForAction = (action: string) => {
	switch (action) {
		case AUDIT_LOG_ACTION.CREATED:
			return "text-green-500";
		case AUDIT_LOG_ACTION.DELETED:
			return "text-destructive";
		default:
			return "text-blue-500";
	}
};

const getIcon = (row: AuditLog) => {
	const c = cn(getColorForAction(row.action), "mr-1");
	let ico = null;
	switch (row.objectType) {
		case AUDIT_LOG_OBJECT_TYPE.USER:
			ico = <IconUser size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.PROXY_HOST:
			ico = <IconBolt size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST:
			ico = <IconArrowsCross size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.DEAD_HOST:
			ico = <IconBoltOff size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.STREAM:
			ico = <IconDisc size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST:
			ico = <IconLock size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.CERTIFICATE:
		case AUDIT_LOG_OBJECT_TYPE.FIREWALL_LIST:
		case AUDIT_LOG_OBJECT_TYPE.WIREGUARD_PEER:
		case AUDIT_LOG_OBJECT_TYPE.WIREGUARD_SETTINGS:
			ico = <IconShield size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.DDNS_PROVIDER:
			ico = <IconDisc size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.TOR_ONION:
			ico = <IconShield size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.CLOUDFLARED_TUNNEL:
			ico = <IconBolt size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.TERMINAL_HOST:
			ico = <IconBolt size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.SETTING:
			ico = <IconBolt size={16} className={c} />;
			break;
		case AUDIT_LOG_OBJECT_TYPE.DASHBOARD_NOTE:
			ico = <IconNote size={16} className={c} />;
			break;
		default:
			ico = <IconHistory size={16} className={c} />;
	}

	return ico;
};

interface Props {
	row: AuditLog;
}
export function EventFormatter({ row }: Props) {
	return (
		<div className="flex-1">
			<div className="font-medium flex items-center">
				{getIcon(row)}
				<T
					id={`object.event.${row.action}`}
					tData={{ object: getAuditLogObjectTypeMessageId(row.objectType) }}
				/>
				&nbsp; &mdash;{" "}
				<Badge variant="secondary" className="ml-2 font-normal max-w-[300px] truncate block">
					{getEventValue(row)}
				</Badge>
			</div>
			<div className="text-muted-foreground text-sm mt-1">{formatDateTime(row.createdOn)}</div>
		</div>
	);
}
