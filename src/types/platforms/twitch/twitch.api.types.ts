export type GQLResponse<T> = {
	data: T;
};

export type ChattersResponse = {
	channel: {
		chatters: {
			count: number;
		};
	};
};

export type CollaborativeViewersResponse = {
	users: Array<{
		login: string;
		displayName: string;
		profileImageURL: string;
		stream: {
			viewersCount: number;
		} | null;
	}>;
	user: {
		login: string;
		displayName: string;
		profileImageURL: string;
		description: string | null;
		channel: {
			socialMedias: Array<{
				name: string;
				title: string;
				url: string;
			}>;
		};
		panels: Array<{
			id: string;
			type: string;
			title?: string | null;
			description?: string | null;
			imageURL?: string | null;
			linkURL?: string | null;
		}>;
	} | null;
};

export type UsersStatusResponse = {
	users: ({
		login: string;
		displayName: string;
		profileImageURL: string | null;
		stream: {
			viewersCount: number;
			title: string | null;
			createdAt: string;
			previewImageURL: string | null;
			game: { displayName: string } | null;
		} | null;
		lastBroadcast: { startedAt: string | null } | null;
	} | null)[];
};

export type CurrentUserFollowsResponse = {
	currentUser: {
		follows: {
			edges: {
				cursor: string;
				node: {
					id: string;
					login: string;
					displayName: string;
					profileImageURL: string | null;
				} | null;
			}[];
			pageInfo: { hasNextPage: boolean };
		} | null;
	} | null;
};

export type VideoCreatedAtResponse = {
	video: {
		createdAt: string | null;
	} | null;
};

export type UsersByIdsResponse = {
	users: ({ id: string; login: string } | null)[] | null;
};

type FollowMutationPayload = {
	follow?: { user?: { login?: string; displayName?: string } | null } | null;
	error?: unknown;
} | null;

export type FollowMutationResult = {
	data?: { followUser?: FollowMutationPayload; unfollowUser?: FollowMutationPayload } | null;
} | null;
