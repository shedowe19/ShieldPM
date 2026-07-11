import { IconServer } from "@tabler/icons-react";
import { useState } from "react";
import { detectService, getIconUrl } from "src/lib/serviceIcons";
import { cn } from "src/lib/utils";
import { intl } from "src/locale";
import { ICON_TYPE, type IconType } from "src/types/enums";

interface ServiceIconProps {
	/** Port number for auto-detection */
	port?: number;
	/** Hostname for more specific service detection */
	hostname?: string;
	/** Custom icon URL (used when iconType is 'custom') */
	customIconUrl?: string | null;
	/** Icon type: 'auto' (detect from port/hostname), 'custom' (use customIconUrl), 'none' (no icon) */
	iconType?: IconType;
	/** Icon size in pixels */
	size?: number;
	/** Additional CSS classes */
	className?: string;
	/** Show detected service name as tooltip */
	showTooltip?: boolean;
}

/**
 * ServiceIcon Component
 *
 * Displays a service icon based on:
 * 1. Auto-detection from port and hostname
 * 2. Custom user-provided URL
 * 3. Fallback to generic server icon
 */
export function ServiceIcon({
	port,
	hostname = "",
	customIconUrl,
	iconType = ICON_TYPE.AUTO,
	size = 24,
	className = "",
	showTooltip = false,
}: ServiceIconProps) {
	const [hasError, setHasError] = useState(false);

	// Determine which icon to show
	let iconUrl: string | null = null;
	let serviceName: string | null = null;

	if (iconType === ICON_TYPE.NONE) {
		// No icon requested
		return null;
	}

	if (iconType === ICON_TYPE.CUSTOM && customIconUrl) {
		iconUrl = customIconUrl;
		serviceName = intl.formatMessage({ id: "service-icon.custom" });
	} else if (iconType === ICON_TYPE.AUTO && port) {
		const service = detectService(port, hostname);
		if (service) {
			iconUrl = getIconUrl(service.name);
			serviceName = service.displayName;
		}
	}

	// Handle image load error or no icon found - show fallback
	if (!iconUrl || hasError) {
		return (
			<IconServer
				size={size}
				className={cn("text-muted-foreground shrink-0", className)}
				aria-label={intl.formatMessage({ id: "service-icon.fallback" })}
			/>
		);
	}

	return (
		<img
			src={iconUrl}
			alt={serviceName || intl.formatMessage({ id: "service-icon.fallback" })}
			title={showTooltip ? serviceName || undefined : undefined}
			width={size}
			height={size}
			className={cn("rounded shrink-0 object-contain", className)}
			onError={() => setHasError(true)}
			loading="lazy"
			decoding="async"
		/>
	);
}

export default ServiceIcon;
