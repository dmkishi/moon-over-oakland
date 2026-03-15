Moon Over Oakland
================================================================================
Automatically post moon phase updates for Oakland, CA to Bluesky using GitHub Actions.

Features
--------------------------------------------------------------------------------
- Posts on new moon, first quarter, full moon, and third quarter.
- Moon calculations (esp. rise/set times) are Oakland-based.
- Customizable Liquid templates with moon phase-specific snippets.
- Automated daily checks via GitHub Actions.
- Secure credential management via GitHub Secrets.

Setup
--------------------------------------------------------------------------------
### 1. Clone and install
```sh
git clone https://github.com/dmkishi/moon-over-oakland.git
cd moon-over-oakland
pnpm install
```

### 2. Configure social media credentials in `.env`
Make new copy of `.env`:
```sh
cp .env.example .env
```

Edit `.env` with your Bluesky credentials:
```sh
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

#### New Account on Bluesky
To create a new Bluesky account, **a unique email address is required**. The
easiest solution is to use a pre-existing Gmail account with an email alias,
AKA plus ("+") sign addressing. All these go to the same inbox:

- `your.username@gmail.com`
- `your.username+bksy@gmail.com`
- `your.username+moon-over-oakland.bksy.social@gmail.com`

#### App Password on Bluesky
To create a Bluesky app password:
1. Go to Settings → Privacy and Security → App Passwords
2. Create a new app password
3. Copy it to your `.env` file

### 3. Test locally
```sh
pnpm typecheck
pnpm test
pnpm build
pnpm tryPost     # Post online (only if permitted moon phase)
pnpm view:dev    # View calculated moon-day data and post-draft (never posts)
pnpm view:build  # "

# Optionally specify a date (never posts)
pnpm view:dev 2026-01-01
```

NASA JPL Horizons Script
--------------------------------------------------------------------------------
Use this script to request and generate authoritative data for use as test
fixtures.

This script queries the JPL Horizons API for daily Moon position data and
summarizes moonrise/moonset times, azimuth, tilt, illumination, and distance.

```sh
pnpm horizons -- [YYYY-MM-DD] [--freq=N] [--show-raw] [--show-table]
```

GitHub Actions Setup
--------------------------------------------------------------------------------
### 1. Add repository secrets
Go to your repo → Settings → Secrets and variables → Actions → Secrets:

- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., `your-handle.bsky.social`)
- `BLUESKY_APP_PASSWORD`: Your app password

### 2. Enable the workflow
The workflow runs daily at 6 AM PST / 7 AM PDT (1 PM UTC). You can also trigger
it manually from the Actions tab.

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
