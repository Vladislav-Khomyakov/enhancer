export const ChattersQuery = `query GetChannelChattersCount($name: String!) {
        channel(name: $name) {
            chatters {
                count
            }
        }
    }`;

export const CollaborativeViewersQuery = `query GetCollaborativeViewers($logins: [String!]!, $mainLogin: String!) {
        users(logins: $logins) {
            login
            displayName
            profileImageURL(width: 70)
            stream {
                viewersCount
            }
        }
        user(login: $mainLogin) {
            login
            displayName
            profileImageURL(width: 300)
            description
            channel {
                socialMedias {
                    name
                    title
                    url
                }
            }
            panels {
                id
                type
                ... on DefaultPanel {
                    title
                    description
                    imageURL
                    linkURL
                }
            }
        }
    }`;

export const VideoCreatedAtQuery = `query GetVideoCreatedAt($id: ID!) {
    video(id: $id) {
        createdAt
    }
}`;
