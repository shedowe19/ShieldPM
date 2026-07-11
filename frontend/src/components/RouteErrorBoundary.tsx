import { Component, type ReactNode } from "react";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";

interface Props {
	children: ReactNode;
	resetKey?: string;
}

interface State {
	hasError: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidUpdate(previousProps: Props) {
		if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
			this.setState({ hasError: false });
		}
	}

	private reloadPage = () => {
		window.location.reload();
	};

	render() {
		if (this.state.hasError) {
			return (
				<section className="mx-auto my-12 max-w-md space-y-4 text-center" role="alert" aria-live="assertive">
					<h1 className="text-xl font-semibold">
						<T id="route-error.title" />
					</h1>
					<p className="text-sm text-muted-foreground">
						<T id="route-error.description" />
					</p>
					<Button type="button" onClick={this.reloadPage}>
						<T id="route-error.reload" />
					</Button>
				</section>
			);
		}

		return this.props.children;
	}
}
