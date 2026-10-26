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

**Table of Contents**:
1. [Develop](#develop)
   1. [Requirements](#requirements)
   1. [Setup](#setup)
   1. [Usage](#usage)
   1. [Docker Image](#docker-image)
1. [Deploy](#deploy)
   1. [Requirements](#requirements-1)
   1. [Install](#install)
   1. [Maintenance](#maintenance)
   1. [Alternative Hosts](#alternative-hosts)
1. [See Also](#see-also)
1. [License](#license)

Develop
--------------------------------------------------------------------------------
### Requirements
- **Node.js**: 26 or newer (see `.nvmrc`)
- **pnpm**: 12.3.4 (see `packageManager` in `package.json`); `brew install pnpm`
- **Git LFS**: Installed before cloning, for the moon image textures in
  `assets/` (`brew install git-lfs`, then `git lfs install` once per machine)
- **Bluesky**: An account and app password, see [step 2](
  #2-configure-social-media-credentials)
- Optional: **Docker**, to build the image locally

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

The image job checks out with `lfs: true`, so the Dockerfile copies real
textures, not pointers. The builds must keep `context: .`: the action's default
Git context skips LFS.

Deploy
--------------------------------------------------------------------------------
The deployment steps below are for Raspberry Pi 3 or newer. See [Alternative
Hosts](#alternative-hosts) for other options.

### Requirements
- **Model**: Raspberry Pi 3 or newer
- **OS**: Raspberry Pi OS Lite (64-bit)
- **Network**: Internet access and SSH
- **Time zone**: `America/Los_Angeles`
- **Clock**: NTP on
- **Cron**: Installed and running, the default on Raspberry Pi OS
- **Docker**: Installed, with your user in the `docker` group so cron can run it

### Install
#### 1. Run the install script
```sh
curl -fsSL https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh | sh
```

The script checks the Raspberry Pi against the requirements. On the first run,
it then prompts for the secrets and saves them to `~/moon-over-oakland/env`:

1. `BLUESKY_HANDLE`: e.g. `your-handle.bsky.social`
1. `BLUESKY_APP_PASSWORD`: e.g. `xxxx-xxxx-xxxx-xxxx`
1. `HEALTHCHECKS_URL`: Optional, press Enter to skip. See [step 2](
   #2-set-up-healthchecksio-optional).

Next, it pulls the newest Docker image built from `main` and dry-runs a test
post. If it passes, it installs `run.sh`, `update.sh`, `dry-run.sh` and adds a
crontab line. It prints `Live: ghcr.io/dmkishi/moon-over-oakland:sha-<short>`
when done.

#### 2. Set up Healthchecks.io (optional)
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
Once installed, everything lives in `~/moon-over-oakland/`, plus one crontab
line. The install script writes every file except `env` and `log`, and rewrites
them on each deploy, so `env` is the only file to edit.

| File         | Purpose                                           |
|--------------|---------------------------------------------------|
| `run.sh`     | **Do not edit**. Installed by the install script. |
| `update.sh`  | **Do not edit**. Installed by the install script. |
| `dry-run.sh` | **Do not edit**. Installed by the install script. |
| `env`        | Secrets.                                          |
| `log`        | Output of each run and each deploy. No rotation.  |

- **Run**: Cron runs `run.sh`, which runs the image tag it was installed with,
  checks that the clock is synchronized with NTP, and tries to post. It makes up
  to 4 attempts, 5 minutes apart. **A retry never double-posts**: the app checks
  Bluesky for a post from today first.
- **Update**: `~/moon-over-oakland/update.sh`
- **Roll back**: `~/moon-over-oakland/update.sh sha-<short>`
- **Dry run**: `~/moon-over-oakland/dry-run.sh [YYYY-MM-DD]`

### Alternative Hosts
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
