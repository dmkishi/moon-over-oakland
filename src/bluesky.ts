/**
 * Bluesky adapter
 */
// Side-effect import: registers the `com.atproto.*` endpoint types that
// `rpc.get`/`rpc.post` are typed against. `@atcute/bluesky` alone registers
// only `app.bsky.*`.
// oxlint-disable-next-line unicorn/require-module-specifiers - Type-only side effect
import type {} from '@atcute/atproto';
import type { AppBskyFeedPost } from '@atcute/bluesky';
import { feedPost } from '@atcute/bluesky/limits';
import { Client, ok } from '@atcute/client';
import { PasswordSession } from '@atcute/password-session';
import { getGraphemeLength } from '@atcute/util-text';

/** Number of newest records (i.e. posts) to request */
const RECORDS_CHECKED = 10;

const SERVICE = 'https://bsky.social';

export const MAX_GRAPHEMES: number = feedPost.text.maxGraphemes;

export type PostResult =
  | { status: 'posted'; uri: string; cid: string }
  | { status: 'skipped' };

export interface BlueskyClient {
  post: (text: string) => Promise<PostResult>;
}

/**
 * Length of `text` in graphemes, the unit Bluesky measures posts against.
 * @pure
 */
export function graphemeLength(text: string): number {
  return getGraphemeLength(text);
}

/**
 * Calendar date in a given timezone a record was created on.
 * @pure
 * @internal Exported for testing.
 */
export function localDateOf(value: unknown, timezone: string): Temporal.PlainDate | null {
  const hasCreatedAt = typeof value === 'object' && value !== null && 'createdAt' in value;
  if (!hasCreatedAt) return null;

  const createdAt = value.createdAt;
  const isTimestampString = typeof createdAt === 'string';
  if (!isTimestampString) return null;

  try {
    return Temporal.Instant.from(createdAt).toZonedDateTimeISO(timezone).toPlainDate();
  } catch {
    return null;
  }
}

/**
 * Whether any of the account's newest records was created on today's date in
 * the given timezone.
 *
 * Reads the repo rather than the app view, which lags behind a write by an
 * indeterminate amount.
 */
async function hasPostedToday(
  rpc: Client,
  did: PasswordSession['did'],
  timezone: string,
): Promise<boolean> {
  const today = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
  const data = await ok(rpc.get('com.atproto.repo.listRecords', {
    params: {
      repo: did,
      collection: 'app.bsky.feed.post',
      limit: RECORDS_CHECKED,
    },
  }));

  return data.records.some(
    (record) => localDateOf(record.value, timezone)?.equals(today) === true,
  );
}

export async function createBlueskyClient(
  handle: string,
  appPassword: string,
  timezone: string,
): Promise<BlueskyClient> {
  const session = await PasswordSession.login({
    service: SERVICE,
    identifier: handle,
    password: appPassword,
  });
  const rpc = new Client({ handler: session });

  return {
    async post(text) {
      if (await hasPostedToday(rpc, session.did, timezone)) {
        return {
          status: 'skipped',
        };
      }

      const record: AppBskyFeedPost.Main = {
        $type: 'app.bsky.feed.post',
        text,
        langs: ['en-US'],
        createdAt: new Date().toISOString(),
      };

      const { uri, cid } = await ok(rpc.post('com.atproto.repo.createRecord', {
        input: {
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record,
        },
      }));

      return {
        status: 'posted',
        uri,
        cid,
      };
    },
  };
}
