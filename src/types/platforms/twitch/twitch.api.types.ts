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

export type VideoCreatedAtResponse = {
	video: {
		createdAt: string | null;
	} | null;
};
