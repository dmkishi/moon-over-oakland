Moon Over Oakland
================================================================================
Automatically post moon phase updates specifically for Oakland, CA to Bluesky.
The posts are written for a general audience.

**Features**:
- Posts on **new moon**, **first quarter**, **full moon**, and **last quarter**.
  - [Posting algorithm](docs/posting-algorithm.md).
  - Templated with [LiquidJS](https://liquidjs.com/).
- Moon and sun ephemeris for posts are **calculated locally** and does not
  depend on any external services or APIs.
- Deployable **anywhere as a Docker image**.

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

Usage
--------------------------------------------------------------------------------
```sh
pnpm check
pnpm post                # Posts online (but only on permitted moon phases)
pnpm preview             # Preview post with calculated data (NEVER posts)
pnpm preview 2026-01-01  # Optionally specify a date
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

### Building for another architecture
An arm64 image fails on an x86 host with an exec format error. Build for the
host the image is destined for:

```sh
docker buildx build --platform linux/amd64 --tag dmkishi/moon-over-oakland .
```

This bypasses `pnpm docker:build`, so nothing smoke tests the result, and that
is deliberate: a cross-built image cannot be smoke tested on an arm64 machine.
Under QEMU emulation `Math.sin` returns `0`, which turns the ephemeris into
`NaN` and crashes the run on an image that is perfectly healthy on real
hardware. Build it here, then run `pnpm docker:smoke-test` there.

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
