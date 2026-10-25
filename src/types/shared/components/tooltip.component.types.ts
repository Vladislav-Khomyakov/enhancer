import type { ComponentChildren } from "preact";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export type TooltipRect = { top: number; right: number; bottom: number; left: number; width: number; height: number };

export type TooltipSize = { width: number; height: number };

export type TooltipPlacement = { position: TooltipPosition; left: number; top: number; arrow: number };

export type TooltipComponentProps = {
	children: ComponentChildren;
	content: ComponentChildren;
	position?: TooltipPosition;
	delay?: number;
	maxWidth?: number;
	interactive?: boolean;
	appearance?: "default" | "twitch";
};

export type TooltipPopoverProps = {
	anchor: HTMLElement;
	content: ComponentChildren;
	position: TooltipPosition;
	onClose: () => void;
	maxWidth?: number;
	interactive?: boolean;
	appearance?: "default" | "twitch";
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
};
