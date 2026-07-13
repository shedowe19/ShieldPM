import { IconDownload, IconServer } from "@tabler/icons-react";
import type { ProxyHost } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { intl, T } from "src/locale";

type AnalyticsHost = Pick<ProxyHost, "domainNames" | "id">;

interface Props {
	hosts?: AnalyticsHost[];
	onDownload: () => void;
	onRangeChange: (range: string) => void;
	onSelectedHostIdChange: (hostId: string) => void;
	range: string;
	selectedHostId: string;
}

export const analyticsRanges = ["1h", "24h", "7d", "30d"];

export const AnalyticsFilters = ({
	hosts,
	onDownload,
	onRangeChange,
	onSelectedHostIdChange,
	range,
	selectedHostId,
}: Props) => (
	<div className="flex items-center space-x-2">
		<Select value={selectedHostId} onValueChange={onSelectedHostIdChange}>
			<SelectTrigger className="w-[200px]">
				<IconServer className="mr-2 h-4 w-4 text-muted-foreground" />
				<SelectValue placeholder={intl.formatMessage({ id: "analytics.select-host" })} />
			</SelectTrigger>
			<SelectContent>
				{hosts?.map((host) => (
					<SelectItem key={host.id} value={String(host.id)}>
						{host.domainNames[0]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>

		<div className="flex bg-muted rounded-md p-1">
			{analyticsRanges.map((currentRange) => (
				<Button
					key={currentRange}
					variant={range === currentRange ? "default" : "ghost"}
					onClick={() => onRangeChange(currentRange)}
					size="sm"
					className="h-8"
				>
					<T id={`analytics.range.${currentRange}`} />
				</Button>
			))}
		</div>

		<Button
			aria-label={intl.formatMessage({ id: "action.download" })}
			onClick={onDownload}
			size="icon"
			title={intl.formatMessage({ id: "action.download" })}
			type="button"
			variant="outline"
		>
			<IconDownload className="h-4 w-4" />
			<span className="sr-only">
				<T id="action.download" />
			</span>
		</Button>
	</div>
);
