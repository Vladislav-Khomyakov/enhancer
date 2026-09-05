import type { ComponentChildren } from "preact";

export interface TooltipComponentProps {
	children: ComponentChildren;
	content: ComponentChildren;
	position?: "top" | "bottom" | "left" | "right";
	delay?: number;
	maxWidth?: number;
	interactive?: boolean;
	appearance?: "default" | "twitch";
}
