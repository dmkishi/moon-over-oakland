#!/bin/sh
#
# Sets up or updates a Raspberry Pi for moon-over-oakland. Run on the Pi:
#
#   curl -fsSL https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh | sh -s -- [sha-<short>]
#
# - Optional `sha-<short>` argument. If omitted, it deploys the newest image
#   built from `main`.
# - The first run prompts for the secrets in `env`.
# - Safe to rerun. To roll back, run it with an earlier tag.
# - Reads INSTALLER_URL from the environment, to install on a test deployment
#   from a development branch. Defaults to the URL above.
# - Installs one crontab line and:
#
#   ~/moon-over-oakland/
#    ├── run.sh      Auto-posts at 6:00 AM (via cron)
#    ├── update.sh   Updates or rolls back. Optionally target: update.sh [sha-<short>]
#    ├── dry-run.sh  Dry-runs a post: dry-run.sh [YYYY-MM-DD]
#    ├── env         Secrets, mode 0600
#    └── log         Output of each run and each deploy

set -eu

REPO=ghcr.io/dmkishi/moon-over-oakland
DEFAULT_INSTALLER_URL=https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh
DIR=$HOME/moon-over-oakland
SCRIPTS='run.sh update.sh dry-run.sh'
FULL_MOON_DATE=2026-01-02 # For the test dry-run.

# Prints an error and exits the script.
#
# Arguments:
#   Error message.
# Outputs:
#   Writes the message, prefixed with "Error: ", to stderr.
# Returns:
#   Never; exits 1.
fail() {
  echo "Error: $*" >&2
  exit 1
}

# Checks that a tag has the `sha-<short>` form: `sha-` followed by 7 lowercase
# hex digits.
#
# Arguments:
#   Image tag to check.
# Returns:
#   0 if it matches, 1 if not.
is_sha_tag() (
  hex='[0-9a-f]'
  case $1 in
    sha-$hex$hex$hex$hex$hex$hex$hex) ;;
    *) return 1 ;;
  esac
)

# Prompts for a value on the terminal. Reads /dev/tty, since under `curl | sh`
# stdin is the script itself. Re-prompts on a quoted value, since Docker's
# --env-file would keep the quotes.
#
# Arguments:
#   Prompt text.
#   `required` to re-prompt until a value is entered, or `optional`.
#   `secret` to hide the input, or nothing.
# Outputs:
#   Writes the prompt to stderr and the value to stdout.
ask() (
  # Restores echo even when Ctrl-C interrupts a hidden read.
  trap 'stty echo < /dev/tty' EXIT
  trap 'exit 130' INT TERM
  while :; do
    printf '%s: ' "$1" >&2
    if [ "${3:-}" = secret ]; then
      stty -echo < /dev/tty
      IFS= read -r value < /dev/tty
      stty echo < /dev/tty
      echo >&2
    else
      IFS= read -r value < /dev/tty
    fi
    case $value in
      \"* | \'*) echo 'Enter it without quotes.' >&2 ;;
      '')
        [ "$2" = required ] || break
        echo 'This is required.' >&2
        ;;
      *) break ;;
    esac
  done
  printf '%s\n' "$value"
)

# Escapes text so sed inserts it literally as a replacement.
#
# Arguments:
#   Text to escape.
# Outputs:
#   Writes the escaped text to stdout.
sed_escape() {
  printf '%s\n' "$1" | sed 's/[\\|&]/\\&/g'
}

# Fills the `@NAME@` placeholders in a script template and writes the result
# to <name>.new.
#
# Arguments:
#   Name of the script.
#   Contents of its template.
# Globals:
#   DIR, IMAGE, INSTALLER_URL, FULL_MOON_DATE
write_script() (
  temp_path=$DIR/$1.new
  printf '%s\n' "$2" | sed \
    -e "s|@IMAGE@|$(sed_escape "$IMAGE")|g" \
    -e "s|@INSTALLER_URL@|$(sed_escape "$INSTALLER_URL")|g" \
    -e "s|@FULL_MOON_DATE@|$(sed_escape "$FULL_MOON_DATE")|g" \
    > "$temp_path"
  ! grep -q '@[A-Z_]*@' "$temp_path" ||
    fail "$1.in has a placeholder this installer doesn't fill."
  chmod 0755 "$temp_path"
)

main() {
  TAG=${1:-}
  [ -z "$TAG" ] || is_sha_tag "$TAG" || fail 'Usage: install-raspberry-pi.sh [sha-<short>]'
  INSTALLER_URL=${INSTALLER_URL:-$DEFAULT_INSTALLER_URL}

  # Reject non-interactive sessions.
  [ -f "$DIR/env" ] || (: < /dev/tty) 2>/dev/null ||
    fail 'No terminal to prompt for the secrets. Run it in an interactive session, e.g. `ssh -t`.'

  ##############################################################################
  # Check host configuration
  ##############################################################################
  ARCH=$(docker info --format '{{.Architecture}}' 2>/dev/null) ||
    fail "Can't reach Docker. Run \`sudo usermod -aG docker $USER\`, then log out and back in."

  [ "$ARCH" = aarch64 ] ||
    fail "Docker reports $ARCH, expected aarch64."

  [ "$(timedatectl show --property=Timezone --value)" = America/Los_Angeles ] ||
    fail 'Time zone is not America/Los_Angeles.'

  [ "$(timedatectl show --property=NTP --value)" = yes ] ||
    fail 'NTP is off. Run `sudo timedatectl set-ntp true`.'

  systemctl is-active --quiet cron ||
    fail 'cron is not running.'

  ##############################################################################
  # Make and check the env file
  ##############################################################################
  install -d -m 0700 "$DIR"
  if [ ! -f "$DIR/env" ]; then
    echo "Creating $DIR/env."
    handle=$(ask 'BLUESKY_HANDLE (e.g. your-handle.bsky.social)' required)
    password=$(ask 'BLUESKY_APP_PASSWORD (hidden)' required secret)
    healthchecks_url=$(ask 'HEALTHCHECKS_URL (optional, press Enter to skip)' optional)
    (
      umask 077
      printf '%s\n' \
        "BLUESKY_HANDLE=$handle" \
        "BLUESKY_APP_PASSWORD=$password" \
        "HEALTHCHECKS_URL=$healthchecks_url" \
        > "$DIR/env"
    )
  fi

  for key in BLUESKY_HANDLE BLUESKY_APP_PASSWORD; do
    grep -q "^$key=." "$DIR/env" ||
      fail "Fill in $key in $DIR/env, then rerun."
  done

  grep -q '^HEALTHCHECKS_URL=.' "$DIR/env" ||
    echo 'Warning: HEALTHCHECKS_URL is not set, so failed runs and a down Pi go unnoticed.' >&2

  # Docker's --env-file keeps quotes as part of the value
  if grep -q '^[A-Z_]*=["'\'']' "$DIR/env"; then
    fail "Remove the quotes around values in $DIR/env, then rerun."
  fi

  ##############################################################################
  # Resolve the tag
  ##############################################################################
  # Resolve which image tag to deploy.
  # - If passed a tag, use it.
  # - Without a tag, pull `latest`, read the commit it was built from, and use
  #   that commit's `sha-<short>` tag, so the scripts pin a fixed tag.
  if [ -z "$TAG" ]; then
    docker pull "$REPO:latest"
    REVISION=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REPO:latest")
    TAG=sha-$(printf '%s' "$REVISION" | cut -c1-7)
    is_sha_tag "$TAG" || fail "Can't read the commit from $REPO:latest."
  fi
  IMAGE=$REPO:$TAG

  ##############################################################################
  # Pull and test with a dry-run
  ##############################################################################
  docker pull "$IMAGE"
  docker run --rm --pull=never "$IMAGE" --dry-run "$FULL_MOON_DATE"

  # Save the live tag before run.sh is overwritten below, for the log entry,
  # the prune, and the rollback hint. A first install has no run.sh yet.
  PREVIOUS_TAG=$(sed -n "s|^IMAGE=$REPO:||p" "$DIR/run.sh" 2>/dev/null || true)

  ##############################################################################
  # Write the scripts
  ##############################################################################
  # All downloads finish before anything is replaced, so a failed one leaves
  # the old install intact.
  TEMPLATES_URL=${INSTALLER_URL%.sh}
  for name in $SCRIPTS; do
    # An assignment, so `set -e` catches a failed curl.
    template=$(curl -fsSL "$TEMPLATES_URL/$name.in")
    write_script "$name" "$template"
  done

  # Renamed over the live files, so a 6:00 run never reads a half-written
  # file and a running update.sh keeps reading its own copy.
  for name in $SCRIPTS; do
    mv -f "$DIR/$name.new" "$DIR/$name"
  done

  ##############################################################################
  # Add a log entry
  ##############################################################################
  echo "--- $(date -Is) deployed $IMAGE (previous: ${PREVIOUS_TAG:-none})" >> "$DIR/log"

  ##############################################################################
  # Add the crontab line
  ##############################################################################
  CRON_LINE=$(crontab -l 2>/dev/null | grep -F 'moon-over-oakland/run.sh' || true)
  if [ -z "$CRON_LINE" ]; then
    # Cron runs it in the host's time zone. Output writes to `log` instead of
    # email. Single quotes: cron expands $HOME, not this script.
    {
      crontab -l 2>/dev/null || true  # Print existing crontab entries, if any.
      echo '0 6 * * * $HOME/moon-over-oakland/run.sh >> $HOME/moon-over-oakland/log 2>&1'
    } | crontab -
  fi

  ##############################################################################
  # Prune
  ##############################################################################
  # Keeps the live tag and the one before it. Never `docker image prune -a`: the
  # container only exists at 6:00 AM, so prune would take the live image too. A
  #rerun of the live tag skips this, since the tag before it isn't known.
  if [ "$PREVIOUS_TAG" != "$TAG" ]; then
    docker image ls --format '{{.Tag}}' "$REPO" | while read -r tag; do
      case $tag in
        "$TAG" | "$PREVIOUS_TAG" | '<none>') ;;
        *) docker image rm "$REPO:$tag" ;;
      esac
    done
  fi

  echo
  echo "Live: $IMAGE"
  if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$TAG" ]; then
    echo "To roll back, run ~/moon-over-oakland/update.sh $PREVIOUS_TAG."
  fi
}

main "$@"
