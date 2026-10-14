#!/bin/sh
# Sets up or updates a Raspberry Pi for moon-over-oakland. Run on the Pi:
#
#   curl -fsSL https://raw.githubusercontent.com/dmkishi/moon-over-oakland/main/scripts/install-raspberry-pi.sh | sh -s -- [sha-<short>]
#
# - Optional `sha-<short>` argument. If omitted, it deploys the newest image
#   built from `main`.
# - Safe to rerun. To roll back, run it with an earlier tag.
# - Installs one crontab line and:
#
#   ~/moon-over-oakland/
#   ├── run.sh  Pinned image tag, clock check, and retry loop
#   ├── env     Secrets, mode 0600
#   └── log     Output of each run and each deploy

set -eu

REPO=ghcr.io/dmkishi/moon-over-oakland
DIR=$HOME/moon-over-oakland
FULL_MOON_DATE=2026-01-02 # For the test dry-run.

fail() {
  echo "Error: $*" >&2
  exit 1
}

is_sha_tag() {
  hex='[0-9a-f]'
  case $1 in
    sha-$hex$hex$hex$hex$hex$hex$hex) ;;
    *) return 1 ;;
  esac
}

main() {
  TAG=${1:-}
  [ -z "$TAG" ] || is_sha_tag "$TAG" || fail 'Usage: install-raspberry-pi.sh [sha-<short>]'

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
    (umask 077 && printf '%s\n' BLUESKY_HANDLE= BLUESKY_APP_PASSWORD= HEALTHCHECKS_URL= > "$DIR/env")
    fail "Created $DIR/env. Fill in the values, unquoted, then rerun. HEALTHCHECKS_URL is optional."
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
  #   that commit's `sha-<short>` tag, so `run.sh` stays pinned to a fixed tag.
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

  PREVIOUS=$(sed -n "s|^IMAGE=$REPO:||p" "$DIR/run.sh" 2>/dev/null || true)

  ##############################################################################
  # Write run.sh
  ##############################################################################
  # Written beside the live script and renamed over it, so a 6:00 run never
  # reads a half-written file
  {
    echo '#!/bin/sh'
    echo ''
    echo "IMAGE=$IMAGE"
    cat <<'RUN_SH'
# DO NOT EDIT. Written by install-raspberry-pi.sh, which overwrites this file on
# every run. Re-run it to change the image.
#
# Up to 4 attempts, 5 minutes apart, so a Wi-Fi drop or Bluesky blip at 6:00 AM
# doesn't cost a post. A retry after a lost response finds the post already
# made and skips, so it never double-posts.
for attempt in 1 2 3 4; do
  echo "--- $(date -Is) attempt $attempt"

  clock_synced=$(timedatectl show --property=NTPSynchronized --value)
  if [ "$clock_synced" = yes ]; then
    # --pull=never: pulling here would let a registry or network hiccup fail
    # the post even though the image is on disk
    docker run --rm --pull=never --env-file "$HOME/moon-over-oakland/env" "$IMAGE" && exit 0
  else
    echo 'Clock not synchronized'
  fi
  [ "$attempt" -lt 4 ] && sleep 300
done
exit 1
RUN_SH
  } > "$DIR/run.sh.new"
  chmod 0755 "$DIR/run.sh.new"
  mv -f "$DIR/run.sh.new" "$DIR/run.sh"

  ##############################################################################
  # Add a log entry
  ##############################################################################
  echo "--- $(date -Is) deployed $IMAGE (previous: ${PREVIOUS:-none})" >> "$DIR/log"

  ##############################################################################
  # Crontab
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
  # Keeps the live tag and the one before it for rollback. Never `docker image
  # prune -a`: the container only exists at 6:00, so prune would take the live
  # image too. A rerun of the live tag skips this, since the tag before it isn't
  # known.
  if [ "$PREVIOUS" != "$TAG" ]; then
    docker image ls --format '{{.Tag}}' "$REPO" | while read -r tag; do
      case $tag in
        "$TAG" | "$PREVIOUS" | '<none>') ;;
        *) docker image rm "$REPO:$tag" ;;
      esac
    done
  fi

  echo
  echo "Live: $IMAGE"
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ]; then
    echo "To roll back, rerun with $PREVIOUS."
  fi
}

main "$@"
