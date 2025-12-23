import { IconArrowsCross, IconBolt, IconBoltOff, IconDisc, IconLock, IconShield, IconUser } from "@tabler/icons-react";
import cn from "classnames";
import type { AuditLog } from "src/api/backend";
import { formatDateTime, T } from "src/locale";
import { Badge } from "src/components/ui/badge";

const getEventValue = (event: AuditLog) => {
	switch (event.objectType) {
		case "access-list":
		case "user":
			return event.meta?.name;
		case "proxy-host":
		case "redirection-host":
		case "dead-host":
			return event.meta?.domainNames?.join(", ") || "N/A";
		case "stream":
			return event.meta?.incomingPort || "N/A";
		case "certificate":
			return event.meta?.domainNames?.join(", ") || event.meta?.niceName || "N/A";
		default:
			return `UNKNOWN EVENT TYPE: ${event.objectType}`;
	}
};

const getColorForAction = (action: string) => {
	switch (action) {
		case "created":
			return "text-green-500";
		case "deleted":
			return "text-destructive";
		default:
			return "text-blue-500";
	}
};

const getIcon = (row: AuditLog) => {
	const c = cn(getColorForAction(row.action), "mr-1");
	let ico = null;
	switch (row.objectType) {
		case "user":
			ico = <IconUser size={16} className={c} />;
			break;
		case "proxy-host":
			ico = <IconBolt size={16} className={c} />;
			break;
		case "redirection-host":
			ico = <IconArrowsCross size={16} className={c} />;
			break;
		case "dead-host":
			ico = <IconBoltOff size={16} className={c} />;
			break;
		case "stream":
			ico = <IconDisc size={16} className={c} />;
			break;
		case "access-list":
			ico = <IconLock size={16} className={c} />;
			break;
		case "certificate":
			ico = <IconShield size={16} className={c} />;
			break;
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
				<T id={`object.event.${row.action}`} tData={{ object: row.objectType }} />
				&nbsp; &mdash; <Badge variant="secondary" className="ml-2 font-normal">{getEventValue(row)}</Badge>
			</div>
			<div className="text-muted-foreground text-sm mt-1">{formatDateTime(row.createdOn)}</div>
		</div>
	);
}
