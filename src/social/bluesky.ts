import { AtpAgent } from '@atproto/api';

export interface BlueskyClient {
  post(text: string): Promise<{ uri: string; cid: string }>;
}

export async function createBlueskyClient(
  handle: string,
  appPassword: string
): Promise<BlueskyClient> {
  const agent = new AtpAgent({
    service: 'https://bsky.social',
  });

  await agent.login({
    identifier: handle,
    password: appPassword,
  });

  return {
    async post(text: string) {
      const response = await agent.post({
        text,
        createdAt: new Date().toISOString(),
      });
      return response;
    },
  };
}
