Moon Over Oakland
================================================================================
Automatically post moon phase updates for Oakland, CA to Bluesky using GitHub Actions.

Features
--------------------------------------------------------------------------------
- Posts on new moon, first quarter, full moon, and third quarter.
- Moon calculations (rise/set times, altitude, distance) are Oakland-based.
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
Copy the example environment file:
```sh
cp .env.example .env
```

Edit `.env` with your Bluesky credentials:
```sh
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

To create a Bluesky app password:
1. Go to Settings → Privacy and Security → App Passwords
2. Create a new app password
3. Copy it to your `.env` file

### 3. Test locally
```sh
# Dry run (no actual posting)
DRY_RUN=true pnpm dev

# Build and run
pnpm build
pnpm start

pnpm typecheck  # Type check
pnpm dev        # Run in dev mode
pnpm build      # Build for production
```

GitHub Actions Setup
--------------------------------------------------------------------------------
### 1. Add repository secrets
Go to your repo → Settings → Secrets and variables → Actions → Secrets:

- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., `your-handle.bsky.social`)
- `BLUESKY_APP_PASSWORD`: Your app password

### 2. Enable the workflow
The workflow runs daily at 8 PM UTC (noon PST). You can also trigger it manually from the Actions tab.

Customizing Templates
--------------------------------------------------------------------------------
Templates use [LiquidJS](https://liquidjs.com/) syntax.

### Main template
Edit `src/templates/post.liquid` for the overall post structure.

### Phase-specific snippets
Edit files in `src/templates/snippets/`:
- `new.liquid` — New moon content
- `first-quarter.liquid` — First quarter content
- `full.liquid` — Full moon content
- `third-quarter.liquid` — Third quarter content

### Available variables
| Variable        | Example                  | Description           |
|-----------------|--------------------------|-----------------------|
| `phase`         | `full`                   | Moon phase name       |
| `illumination`  | `99.5`                   | Percent illuminated   |
| `age`           | `14.5`                   | Days into lunar cycle |
| `distance`      | `384400`                 | Distance in km        |
| `moonrise`      | `7:30 PM`                | Local moonrise time   |
| `moonset`       | `6:15 AM`                | Local moonset time    |
| `altitude`      | `45.2`                   | Degrees above horizon |
| `azimuth`       | `180`                    | Compass direction     |
| `date`          | `Friday, March 6, 2026`  | Formatted date        |

See Also
--------------------------------------------------------------------------------
- [Solar San Francisco](https://bsky.app/profile/sanfran.solar.v.cx) on Bluesky.

License
--------------------------------------------------------------------------------
[MIT](LICENSE)
