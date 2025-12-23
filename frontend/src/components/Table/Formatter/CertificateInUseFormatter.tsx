import type { DeadHost, ProxyHost, RedirectionHost, Stream } from "src/api/backend";
import { TrueFalseFormatter } from "src/components";
import { T } from "src/locale";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "src/components/ui/popover";

const getSection = (title: string, items: ProxyHost[] | RedirectionHost[] | DeadHost[]) => {
	if (items.length === 0) {
		return null;
	}
	return (
		<div className="mb-2 last:mb-0">
			<div className="font-semibold border-b mb-1 pb-1">
				<T id={title} />
			</div>
			{items.map((host) => (
				<div key={host.id} className="ml-2 text-sm">
					{host.domainNames.join(", ")}
				</div>
			))}
		</div>
	);
};

const getSectionStream = (items: Stream[]) => {
	if (items.length === 0) {
		return null;
	}
	return (
		<div className="mb-2 last:mb-0">
			<div className="font-semibold border-b mb-1 pb-1">
				<T id="streams" />
			</div>
			{items.map((stream) => (
				<div key={stream.id} className="ml-2 text-sm">
					{stream.forwardingHost}:{stream.forwardingPort}
				</div>
			))}
		</div>
	);
};

interface Props {
	proxyHosts: ProxyHost[];
	redirectionHosts: RedirectionHost[];
	deadHosts: DeadHost[];
	streams: Stream[];
}
export function CertificateInUseFormatter({ proxyHosts, redirectionHosts, deadHosts, streams }: Props) {
	const totalCount = proxyHosts?.length + redirectionHosts?.length + deadHosts?.length + streams?.length;
	if (totalCount === 0) {
		return <TrueFalseFormatter value={false} falseLabel="certificate.not-in-use" />;
	}

	proxyHosts.sort();
	redirectionHosts.sort();
	deadHosts.sort();
	streams.sort();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button type="button" className="inline-flex items-center justify-center p-0 m-0 border-none bg-transparent cursor-pointer outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm">
					<TrueFalseFormatter value trueLabel="certificate.in-use" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80">
				{getSection("proxy-hosts", proxyHosts)}
				{getSection("redirection-hosts", redirectionHosts)}
				{getSection("dead-hosts", deadHosts)}
				{getSectionStream(streams)}
			</PopoverContent>
		</Popover>
	);
}
