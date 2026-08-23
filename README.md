Moon Over Oakland
================================================================================
Automatically post moon phase updates for Oakland, CA to Bluesky using GitHub
Actions. The posts are targeted towards a general audience.

Features
--------------------------------------------------------------------------------
- Posts on **new moon**, **first quarter**, **full moon**, and **last quarter**.
  - [Posting algorithm](docs/posting-algorithm.md)
- Moon calculations (esp. rise/set times) are **Oakland specific**.
- Moon phase-specific **posts are customizable with Liquid templates**.
- Postings are **automated with GitHub Actions**.
- Secure credential management with GitHub Secrets.

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

### 3. Configure GitHub Actions
#### 1. Add repository secrets
Go to your repo → Settings → Secrets and variables → Actions → Secrets:

- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., `your-handle.bsky.social`)
- `BLUESKY_APP_PASSWORD`: Your app password

#### 2. Enable the workflow
The workflow runs daily at 6 AM PST / 7 AM PDT (1 PM UTC). You can also trigger
it manually from the Actions tab.

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
    [`tests/fixtures/moonPost.accuracy.jsonc`](tests/fixtures/moonPost.accuracy.jsonc).
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

**Note**: The location and timezone are sourced from [`src/constants.ts`](
src/constants.ts)

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
