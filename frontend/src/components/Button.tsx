import cn from "classnames";
import { type HTMLMotionProps, m } from "framer-motion";
import type { ReactNode } from "react";
import type { ButtonActionType, ButtonSize, ButtonVariant, UiColor } from "src/types/enums";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
	children: ReactNode;
	className?: string;
	type?: "button" | "submit";
	actionType?: ButtonActionType;
	variant?: ButtonVariant;
	size?: ButtonSize;
	fullWidth?: boolean;
	isLoading?: boolean;
	disabled?: boolean;
	color?: UiColor;
	onClick?: () => void;
}

function Button({
	children,
	className,
	onClick,
	type,
	actionType,
	variant,
	size,
	color,
	fullWidth,
	isLoading,
	disabled,
	...rest
}: Props) {
	const myOnClick = (_e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
		if (!isLoading && onClick) {
			onClick();
		}
	};

	const cns = cn(
		"btn",
		className,
		actionType && `btn-${actionType}`,
		variant && `btn-${variant}`,
		size && `btn-${size}`,
		color && `btn-${color}`,
		fullWidth && "w-100",
		isLoading && "btn-loading",
	);

	return (
		<m.button
			type={type || "button"}
			className={cns}
			onClick={myOnClick}
			disabled={disabled || isLoading}
			whileHover={{ scale: 1.05 }}
			whileTap={{ scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 17 }}
			{...rest}
		>
			{children}
		</m.button>
	);
}

export { Button };
