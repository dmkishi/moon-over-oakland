Posting Algorithm
================================================================================
This document describes rules for determining which calendar date to assign a
moon phase post to. Because moonrise and moonset characteristics vary by phase,
each phase uses a different rule to publish on the date closest to its event time.

🌑 New Moon
--------------------------------------------------------------------------------
Post on the date of the phase event, regardless of the event time.

### Attributes
- Transits during the day in tandem with the sun:
  - rises with the sun, and
  - sets with the sun.

### Event Calendar 2026
Event       | Rise | Set   | Note on Event Time
------------|------|-------|-------------------
 1-18 11:52 | 7:36 | 17:17 |
 2-17  4:01 | 7:08 | 18:22 | Before sunrise
 3-18 18:24 | 7:00 | 19:19 |
 4-17  4:53 | 6:20 | 20:35 | Before sunrise
 5-16 13:01 | 5:26 | 20:44 |
 6-14 19:54 | 4:53 | 20:47 |
 7-14  2:43 | 6:04 | 21:13 | Before sunrise
 8-12 10:36 | 6:12 | 20:17 |
 9-10 20:26 | 6:15 | 19:10 | After sunset
10-10  8:49 | 7:19 | 19:27 |
11-08 23:02 | 6:16 | 16:26 | After sunset
12-08 16:52 | 7:12 | 16:23 | After sunset

🌕 Full Moon
--------------------------------------------------------------------------------
If the full moon event falls before the Q-point, post on the previous calendar
date. Otherwise, post on the same calendar date.

The Q-point is the midpoint between the time of upper culmination (or **oK**),
when the moon is at its highest point in the sky (which tends to be near
midnight), and the moonset. The Q-point then generally tends to be between 3:30 AM and 4:30 AM. This splits the day at a time when most people are asleep,
assigning the full moon to the night it is most prominently visible.

The upper culmination can simply and naively be calculated as the midpoint
between moonrise and moonset. This provides a reasonably accurate approximation.

The Q-point is derived by taking the midpoint between the upper culmination and
moonset.

```text
oK = (moonrise + moonset) / 2 + 12h
Q  = (oK + moonset) / 2
```

**Note**: Because moonrise and moonset cross midnight (rise in the PM, set in
the AM), the naive average `(moonrise + moonset) / 2` does not yield the true
midpoint of the visible arc. Adding 12h corrects for this, producing the transit
time. All times wrap modulo 24h (e.g., 25:10 → 1:10).

### Attributes
- Transits through the night:
  - rises at sunset, and
  - sets at sunrise **on the following day**.

### Event Calendar 2026
Event       | Rise  | Set  | oK    | Q    | Note on Event Time
------------|-------|------|-------|------|-----------------------------
 1-03  2:03 | 17:29 | 8:00 |  0:45 | 4:23 | p –15 H moonrise (visible)
 2-01 19:09 | 17:33 | 7:17 |  0:25 |    - | s
 3-03  3:38 | 19:39 | 6:42 |  1:11 | 3:57 | p –16 H moonrise (visible)
 4-01 19:12 | 19:33 | 6:32 |  1:03 |    - | s   0 H moonrise (invisible)
 5-01 10:24 | 20:29 | 5:51 |  1:10 | 3:31 | s –10 H moonrise (invisible)
 5-31  1:46 | 21:20 | 5:37 |  1:29 | 3:33 | p –20 H moonrise (visible)
 6-29 16:57 | 20:55 | 5:13 |  1:04 |    - | s  –3 H moonrise (invisible)
 7-29  7:35 | 20:42 | 6:06 |  1:24 | 3:45 | s –13 H moonrise (invisible)
 8-27 21:18 | 19:37 | 6:01 |  0:49 |    - | s
 9-26  9:48 | 19:52 | 7:01 |  1:27 | 4:14 | s –10 H moonrise (invisible)
10-25 21:11 | 17:48 | 6:59 |  0:24 |    - | s
11-24  6:53 | 16:46 | 7:19 |  0:03 | 3:41 | s –10 H moonrise (visible)
12-23 17:28 | 16:32 | 7:16 | 23:54 |    - | s

- **s**: Post same day
- **p**: Post previous day

🌓 Half Moon (First Quarter)
--------------------------------------------------------------------------------
Post on the date of the phase event, regardless of the event time.

### Attributes
- Tends to rise around noon.
- Tends to set around midnight.

### Event Calendar 2026
Event       | Rise  |  Set  | uK   | Note on Event Time
------------|-------|-------|------|-------------------
 1-25 20:47 | 10:47 | 23:59 |    - |
 2-24  4:28 | 10:46 |  1:25 | 6:06 | –6 H moonrise
 3-25 12:18 | 11:40 |  2:33 |    - |
 4-23 19:32 | 11:54 |  2:13 |    - |
 5-23  4:11 | 13:12 |  1:54 | 7:33 | –9 H moonrise
 6-21 19:56 | 13:10 |  0:45 |    - |
 7-21  4:06 | 14:06 | 23:59 | 7:03 | –10 H moonrise
 8-19 19:46 | 13:58 | 23:31 |    - |
 9-18 13:43 | 14:39 | 23:43 | 7:11 | –1 H moonrise
10-18  9:12 | 14:39 | 23:59 | 7:19 | –5 H moonrise
11-17  3:48 | 13:04 | 23:59 | 6:32 | –10 H moonrise
12-16 21:43 | 11:52 | 23:59 |    - |

🌗 Half Moon (Last Quarter)
--------------------------------------------------------------------------------
Post on the moon phase event calendar date if the event time is before the
lower culmination (**uK**). Otherwise, post on the next calendar date.

The lower culmination is the polar opposite of the upper culmination used in the
Full Moon above. It is when the moon is at its lowest point below the horizon.
Because the moonrise time can cross the midnight boundary, the calculation below
must account for it.

```text
duration = (moonset - moonrise) mod 24h
transit  = (moonrise + duration / 2) mod 24h
uK       = (transit + 12h) mod 24h
```

### Attributes
- Tends to rise around midnight.
- Tends to set around noon.

### Event Calendar 2026
Event       | Rise  |  Set  | uK    | Note on Event Time
------------|-------|-------|-------|-------------------
 1-10  7:49 |  0:15 | 11:27 | 17:51 | s
 2-9   4:44 |  1:05 | 10:50 | 17:58 | s
 3-11  2:40 |  2:50 | 11:51 | 19:21 |  s
 4-9  21:53 |  2:21 | 11:33 | 18:57 |  n
 5-9  14:11 |  2:06 | 12:30 | 19:18 |  s
 6-8   3:01 |  1:25 | 13:29 | 19:27 | s
 7-7  12:30 |  0:16 | 13:30 | 18:53 | s
 8-5  19:22 | 23:48 | 13:41 | 18:45 |  n
 9-4   0:51 |  0:00 | 15:06 | 19:33 | s
10-3   6:25 |  0:00 | 14:56 | 19:28 | s
11-1  12:29 | 23:43 | 13:18 | 18:31 | s
11-30 22:09 | 23:52 | 12:20 | 18:06 |  n
12-30 11:00 |  0:00 | 11:38 | 17:49 | s

- **s**: Post same day
- **n**: Post next day
