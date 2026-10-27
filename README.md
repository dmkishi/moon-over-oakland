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
  - **Each post carries an image of the Moon** at the phase instant, rendered
    locally from NASA LRO maps: true size, libration, axis tilt, and terrain
    shadows along the terminator, celestial north up. See [rendering attributes](
    docs/moon-attributes.md#rendering-attributes).
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
1. [Credits](#credits)
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

`pnpm preview` also shows the moon image inline in iTerm2, WezTerm, and VS
Code. VS Code only draws it with `"terminal.integrated.enableImages": true`.

`--image=<path>` is for local runs. It doesn't work in Docker: the container
runs as `node` in a directory owned by `root`, and `--rm` discards it anyway.

If the image fails, the text posts alone, the run pings Healthchecks.io's
`/fail`, and the process exits 0 so `run.sh` doesn't retry over it. Under
`--dry-run` it exits 1 instead, which fails the Docker smoke test.

#### Moon Image Textures
```sh
pnpm generate-moon-assets
```

Regenerates `assets/moon-color.png` and `assets/moon-height.png` from NASA's
[CGI Moon Kit](https://svs.gsfc.nasa.gov/4720): the 4k LROC color map and the
16 px/deg LOLA elevation map, about 95 MB of downloads. Downloads are cached in
the OS temp directory and checked against SHA-256 hashes pinned in
[the script](scripts/generate-moon-assets.ts). The color map is reduced
from 16-bit to 8-bit, and the regnerated PNGs are about 42 MB together.

[`assets/manifest.json`](assets/manifest.json) records the sources, their
hashes, the sharp and libvips versions, and a SHA-256 of each output's decoded
pixels. A rebuild should reproduce those pixel hashes even where the PNG bytes
differ.

Every rebuild adds a full copy to Git LFS history for good, so commit new
textures only when they change.

#### NASA JPL Horizons
Use this script to request authoritative data from [JPL Horizons](
https://ssd.jpl.nasa.gov/horizons/) for debugging or creating test fixtures. It
has two subcommands, `sky` and `disc`.

Both take a civil day in Oakland, midnight to midnight. The bot's posting day
runs from 4:00 AM to 4:00 AM instead (see [posting algorithm](
docs/posting-algorithm.md)), so the full moon at 2:02 AM on 2026-01-03 is posted
on the 2nd but shows up under `pnpm horizons sky 2026-01-03` and `pnpm horizons
disc 2026-01-03`. The values are the same either way; only the date differs.

The location and timezone are sourced from [`src/observer.ts`](src/observer.ts).

##### `sky`: Oakland's view of the Moon
```sh
pnpm horizons sky [YYYY-MM-DD] [--every=<interval>] [--show-table] [--show-csv] [--show-raw] [--no-summary] [--no-json]
```

Summarizes moonrise and moonset, azimuth, tilt, illumination, distance, and any
phase event over one day.

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

##### `disc`: the Moon's face
```sh
pnpm horizons disc [YYYY-MM-DD | YYYY]
```

Prints rows for [`tests/fixtures/moon-disc.accuracy.jsonc`](
tests/fixtures/moon-disc.accuracy.jsonc): the Moon's disc as seen from Earth's
center.

- **Positional Argument**
  - `YYYY-MM-DD` One row per hour of that day, labeled `sample`, plus a row at
    any principal phase in it. Defaults to today.
  - `YYYY` One row per principal phase from January 1 through December 31,
    and no hourly rows.

`disc` takes no flags. The one-hour step is fixed to match [Dial-a-Moon](
https://svs.gsfc.nasa.gov/help/#apis-dialamoon)'s hourly frames; the disc changes
too slowly for a finer step to show anything new.

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

Credits
--------------------------------------------------------------------------------
The moon image is rendered from NASA's Scientific Visualization Studio
[CGI Moon Kit](https://svs.gsfc.nasa.gov/4720): LRO LROC WAC color and LOLA
elevation data. Each image's alt text carries the credit as well.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
