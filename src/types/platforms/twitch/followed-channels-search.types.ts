import type { Signal } from "@preact/signals";

export type FollowedChannelSearchResult = {
	avatarUrl?: string;
	game?: string;
	href: string;
	name: string;
	status?: string;
};

export type FollowedChannelsSearchComponentProps = {
	initialValue: string;
	onSearch: (value: string) => void;
	results: Signal<FollowedChannelSearchResult[]>;
};
