import { TrueFalseFormatter } from "src/components";

interface HostStatusProps {
	host: { enabled: boolean; meta?: { nginxOnline?: boolean; nginxErr?: string } };
}

export function HostStatus({ host }: HostStatusProps) {
	return (
		<span title={host.meta?.nginxOnline === false ? host.meta.nginxErr : undefined}>
			<TrueFalseFormatter
				value={host.enabled && host.meta?.nginxOnline !== false}
				trueLabel="online"
				falseLabel="offline"
			/>
		</span>
	);
}
