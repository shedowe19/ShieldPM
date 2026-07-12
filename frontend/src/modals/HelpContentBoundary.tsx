import { Component, type ReactNode } from "react";
import { T } from "src/locale";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
}

export class HelpContentBoundary extends Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	render() {
		if (this.state.hasError) {
			return (
				<p role="alert" className="mb-4 leading-relaxed text-muted-foreground">
					<T id="error.unknown" />
				</p>
			);
		}

		return this.props.children;
	}
}
