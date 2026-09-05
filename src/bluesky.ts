/**
 * Bluesky adapter
 */
import { AtpAgent, RichText } from '@atproto/api';
import { Temporal } from 'temporal-polyfill/implementation';

/** Number of newest records (i.e. posts) to request */
const RECORDS_CHECKED = 10;

/** Magic number is documented but not exported by `@atproto/api` */
export const MAX_GRAPHEMES = 300;

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
  return new RichText({ text }).graphemeLength;
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
  agent: AtpAgent,
  did: string,
  timezone: string,
): Promise<boolean> {
  const today = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
  const { data } = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: 'app.bsky.feed.post',
    limit: RECORDS_CHECKED,
  });

  return data.records.some(
    (record) => localDateOf(record.value, timezone)?.equals(today) === true,
  );
}

export async function createBlueskyClient(
  handle: string,
  appPassword: string,
  timezone: string,
): Promise<BlueskyClient> {
  const agent = new AtpAgent({
    service: 'https://bsky.social',
  });

  const { data: session } = await agent.login({
    identifier: handle,
    password: appPassword,
  });

  return {
    async post(text) {
      if (await hasPostedToday(agent, session.did, timezone)) {
        return {
          status: 'skipped',
        };
      }

      const { uri, cid } = await agent.post({ text, langs: ['en-US'] });
      return {
        status: 'posted',
        uri,
        cid,
      };
    },
  };
}
