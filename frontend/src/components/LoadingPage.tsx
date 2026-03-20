import { Loading } from "src/components/Loading";
import { Page } from "src/components/Page";

interface Props {
	label?: string;
	noLogo?: boolean;
}
export function LoadingPage({ label, noLogo }: Props) {
	return (
		<Page className="page-center">
			<div className="container-tight py-4">
				<Loading label={label} noLogo={noLogo} />
			</div>
		</Page>
	);
}
