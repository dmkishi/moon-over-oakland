Moon Over Oakland
================================================================================
Automatically post moon phase updates specifically for Oakland, CA to Bluesky.
The posts are written for a general audience.

**Features**:
- Posts on **new moon**, **first quarter**, **full moon**, and **last quarter**.
  - [Posting algorithm](docs/posting-algorithm.md): Post if one of four principal
    moon phases (new, first quarter, full, last quarter) falls between 4:00 AM
    on the given date and 4:00 AM the next day. The window is shifted off of
    midnight so that a phase event in the small hours is posted on the preceding
    evening — when that phase is most visible. Additionally, 4:00 AM avoids the
    nonexistent or ambiguous wall-clock times daylight savings creates between
    1:00 and 3:00 AM.
- Moon and sun ephemeris for posts are **calculated** and does not depend on any
  external services or APIs.
- Deployable **anywhere as a Docker image**.
- Optional: **Healthchecks.io dead man's switch** so a silent failure gets
  noticed.

Setup
--------------------------------------------------------------------------------
### 1. Install
```sh
git clone https://github.com/dmkishi/moon-over-oakland.git
cd moon-over-oakland
pnpm install
```

### 2. Configure social media credentials
Make new copy of `.env`:
```sh
cp .env.example .env
```

Then edit `.env` with your Bluesky credentials:
```sh
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

#### To Create a New Account on Bluesky
To create a new Bluesky account, **a unique email address is required**. The
simplest solution is to use a pre-existing Gmail account with an email alias,
AKA plus ("+") sign addressing. All these go to the same inbox:

- `your.username@gmail.com`
- `your.username+bksy@gmail.com`
- `your.username+moon-over-oakland.bksy.social@gmail.com`

#### To Create an App Password on Bluesky
1. Go to **Settings** → **Privacy and Security** → **App Passwords**
2. Create a new app password
3. Copy-and-paste it into the `.env` file

#### Test Account (optional)
`pnpm post:test` posts to a second Bluesky account, so a template change can be
checked against Bluesky's own renderer without touching the timeline people
read. Create a second account and app password exactly as above — an email alias
makes the unique address painless — then fill in the matching pair:

```sh
TEST_BLUESKY_HANDLE=your-test-handle.bsky.social
TEST_BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### 3. Configure Healthchecks.io monitoring (optional)
Add a [healthchecks.io](https://healthchecks.io) ping URL to the `.env` file:
```sh
HEALTHCHECKS_URL=https://hc-ping.com/<uuid>
```

The app must ping Healthchecks.io every day. When Healthchecks.io detects a
missed pings or a fail, it sends out an alert email. A dry run pings nothing and
a monitor that is unreachable never fails the post.

Usage
--------------------------------------------------------------------------------
```sh
pnpm check
pnpm post                  # Posts online (but only on permitted moon phases)
pnpm post:test 2026-01-02  # Same, to the test account
pnpm preview               # Preview post with calculated data (NEVER posts)
pnpm preview 2026-01-01    # Optionally specify a date
```

### NASA JPL Horizons
```sh
pnpm horizons [YYYY-MM-DD] [--every=<interval>] [--show-table] [--show-csv] [--show-raw] [--no-summary] [--no-json]
```

Use this script to request authoritative data from [JPL Horizons](
https://ssd.jpl.nasa.gov/horizons/) for debugging or creating test fixtures.

- **Positional Argument**
  - `YYYY-MM-DD` Observation date; leading zeroes optional (`2000-1-2`).
    Defaults to today.
- **Named Options**
  - `--no-summary` Suppresses the summary. Default `false`.
  - `--no-json` Suppresses the fixture JSON for pasting into files such as
    [`tests/fixtures/day-events.accuracy.jsonc`](tests/fixtures/day-events.accuracy.jsonc).
    Default `false`.
  - `--show-table` Prints formatted table with all ephemeris samples. Default
    `false`.
  - `--show-csv` Prints the same samples as `--show-table` in CSV, for piping
    into something else. The flags get a column of their own rather than riding
    along in the datetime cell. Default `false`.
  - `--show-raw` Prints raw, unparsed CSV response from the API. Default
    `false`.
  - `--every=<interval>` Thins `--show-table` and `--show-csv` to one row per
    interval, given as `1h`, `30m`, or a bare count of minutes (`30`).

The ephemeris is sampled at a fixed one-minute step, which is not configurable.
Horizons does not interpolate rise, set and transit; it flags the nearest
sampled row, so the step size *is* the event resolution. The phase event is
unaffected: it is sampled on its own schedule and interpolated between samples
rather than snapped to one.

**Note**: The location and timezone are sourced from [`src/observer.ts`](
src/observer.ts)

Docker
--------------------------------------------------------------------------------
The production run is packaged as a single image. Tests, lint and typecheck stay
on the host.

```sh
pnpm docker:build       # Builds then smoke tests the image
pnpm docker:build-only  # Builds only
pnpm docker:smoke-test  # Smoke tests the image
pnpm docker:preview     # Same as `pnpm preview` (see § Usage above)
pnpm docker:post        # Same as `pnpm post` (see § Usage above)
```

Arguments after the image name reach the CLI, so `pnpm docker:preview 2026-01-01`
works the same as `pnpm preview`.

Pass secrets at runtime through `--env-file` or the host's secret store. Never
through `ENV` or `--build-arg`, both of which persist in the image layers where
anyone with `docker history` can read them.

Production images are built, smoke tested and published to
`ghcr.io/dmkishi/moon-over-oakland` by [`image.yml`](
.github/workflows/image.yml). Only `pnpm docker:post` pulls that image, since
only `pnpm docker:post` is a production run; the other scripts build and run
whatever is local.

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
