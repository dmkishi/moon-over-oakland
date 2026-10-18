Moon Over Oakland
================================================================================
Automatically post moon phase updates specifically for Oakland, CA to Bluesky.
The posts are written for a general audience.

**Bluesky Accounts**:
- **Production**: [moon-over-oakland.bsky.social](https://bsky.app/profile/moon-over-oakland.bsky.social)
- **Test**: [test-moon.bsky.social](https://bsky.app/profile/test-moon.bsky.social)

**Features**:
- **Moon and sun ephemeris are calculated locally** with no dependencies on
  external services or APIs, and are tested against NASA JPL Horizons.
  - Rise and set times drift up to about 8 minutes per 100 miles from Oakland.
    See [observer distance](docs/observer-distance.md).
- **Posts on the four principal phases**: new moon, first quarter, full moon,
  and last quarter. See [posting algorithm](docs/posting-algorithm.md).
- **Ships as an ARM64 Docker image** on GHCR (GitHub Container Registry) that
  runs on Apple Silicon Macs, 64-bit Raspberry Pis, etc. **Rebuilt weekly** to
  pick up base image security patches.
- Optional: **[Healthchecks.io](https://healthchecks.io) dead man's switch** so
  a silent failure gets noticed.

Develop
--------------------------------------------------------------------------------
### Setup
#### 1. Install
```sh
git clone https://github.com/dmkishi/moon-over-oakland.git
cd moon-over-oakland
pnpm install
```

#### 2. Configure social media credentials
Make new copy of `.env`:
```sh
cp .env.example .env
```

Then edit `.env` with your Bluesky credentials:
```sh
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

##### To Create a New Account on Bluesky
To create a new Bluesky account, **a unique email address is required**. The
simplest solution is to use a pre-existing Gmail account with an email alias,
AKA plus ("+") sign addressing. All these go to the same inbox:

- `your.username@gmail.com`
- `your.username+bsky@gmail.com`
- `your.username+moon-over-oakland.bksy.social@gmail.com`

##### To Create an App Password on Bluesky
1. Go to **Settings** → **Privacy and Security** → **App Passwords**
2. Create a new app password
3. Copy-and-paste it into the `.env` file

##### Test Account (optional)
`pnpm post:test` posts to a second, test Bluesky account, so a template change
can be checked against Bluesky's own renderer without touching the timeline
people read. Create a second account and app password exactly as above and then
fill in the matching pair. Test posts ignore the once-a-day guard, so that every
`pnpm post:test` posts.

```sh
TEST_BLUESKY_HANDLE=your-test-handle.bsky.social
TEST_BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### Usage
```sh
pnpm check
pnpm post                  # Posts online (but only on permitted moon phases)
pnpm post:test 2026-01-02  # Same, to the test account
pnpm preview               # Preview post with calculated data (NEVER posts)
pnpm preview 2026-01-01    # Optionally specify a date
```

#### NASA JPL Horizons
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
src/observer.ts).

### Docker Image
[`image.yml`](.github/workflows/image.yml) builds and smoke tests the image on
every pull request. On `main`, it also pushes the image to
`ghcr.io/dmkishi/moon-over-oakland`.

The image holds no secrets. They're passed at runtime through `--env-file`.

Deployment (Raspberry Pi 3+)
--------------------------------------------------------------------------------
Once installed, everything lives in `~/moon-over-oakland/`, plus one crontab
line:

| File     | Purpose                                          |
|----------|--------------------------------------------------|
| `run.sh` | **Do not edit**. Written by the install script.  |
| `env`    | Secrets.                                         |
| `log`    | Output of each run and each deploy. No rotation. |

`run.sh` pins the Docker image, checks that the clock is synchronized with NTP,
and tries to post. It makes up to 4 attempts, 5 minutes apart. **A retry never
double-posts**: the app checks Bluesky for a post from today first.

### Requirements
- **Model**: Raspberry Pi 3 or newer
- **OS**: Raspberry Pi OS Lite (64-bit)
- **Network**: Internet access and SSH
- **Time zone**: `America/Los_Angeles`
- **Clock**: NTP on
- **Cron**: Installed and running, the default on Raspberry Pi OS
- **Docker**: Installed, with your user in the `docker` group so cron can run it

### Steps
#### 1. Run the install script and fill in the secrets
```sh
curl -fsSL https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh | sh
```

The first run creates `~/moon-over-oakland/env` and stops.

Populate `~/moon-over-oakland/env` **without quotes**. `HEALTHCHECKS_URL` is
optional, see [step 3](#3-set-up-healthchecksio-optional):

```sh
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
HEALTHCHECKS_URL=https://hc-ping.com/<uuid>
```

#### 2. Run the install script again
On the second run, the script checks the Raspberry Pi against the requirements,
pulls the newest Docker image built from `main`, and dry-runs a test full moon
post. If it passes, it writes `run.sh` with that image's tag pinned and adds a
crontab line. It prints `Live: ghcr.io/dmkishi/moon-over-oakland:sha-<short>`
when done.

#### 3. Set up Healthchecks.io (optional)
[Healthchecks.io](https://healthchecks.io) is optional but strongly recommended,
since it is the only way you'll hear that a run failed or never happened.

Each production run pings `/start` when it begins, then the plain URL on success
or `/fail` on error. Healthchecks.io sends an alert email when a ping is late or
a `/fail` arrives. Each ping carries the image's commit, so the check's log
shows which build ran. **Dry runs and test posts ping nothing, and an
unreachable monitor never fails the post**.

Create a check with:

- **Schedule**: Cron, `0 6 * * *`
- **Time zone**: `America/Los_Angeles`
- **Grace time**: About 1 hour

Set its ping URL as `HEALTHCHECKS_URL` in `~/moon-over-oakland/env`. The next
run picks it up, so there is no need to rerun the install script.

### Maintenance
#### Update
Rerun the install command above. With no argument, it deploys the newest image
built from `main`.

#### Rollback
To roll back to a specific build, pass its tag:

```sh
curl -fsSL https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh | sh -s -- sha-<short>
```

#### Dry Run
Render a post without posting or pinging Healthchecks.io:

```sh
docker run --rm ghcr.io/dmkishi/moon-over-oakland:sha-<short> --dry-run 2026-01-02
```

Deployment (Alternatives)
--------------------------------------------------------------------------------
- **[Render](https://render.com)**: Native cron jobs run the image directly, but
  schedules are UTC only, so 6 AM Pacific drifts an hour with DST.
- **[DigitalOcean](https://www.digitalocean.com)**: A $4/month Droplet is closest
  to the Pi setup, but it is x86, so the install script's `aarch64` check fails.
- **[Fly.io](https://fly.io)**: Cheap per-second billing, but scheduled Machines
  only take `daily`, not an exact time, so a precise run needs a cron process
  inside.

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
