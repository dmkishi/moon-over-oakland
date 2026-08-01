Posting Algorithm
================================================================================
This document describes the rules for publishing moon phase posts. The goal is
to time the posts so that its moon phase is most prominently visible to a
typical, diurnal audience.

A simple, naive rule of posting on the day of a moon phase event is not ideal
because each moon phase event takes place at different times of the day (or
night.) For instance, if a full moon phase is to take place shortly after
midnight, it would be more pertinent to announce it the day before, when on that
evening, the moon phase is most prominent.

Hence, each phase relies on a unique ruleset for establishing its time of
publishing.

🌑 New Moon
--------------------------------------------------------------------------------
**Post on the day of the phase event.** Do this regardless of the event time
within the calendar date.

### Attributes
- The moon transits during the day together with the sun:
  - Moonrise at sunrise.
  - Moonset at sunset.

### Event Calendar (2026)
Date  |  Time | Moonrise | Sunrise |  Moonset | Sunset |
------|------:|---------:|--------:|---------:|-------:|
 1–18 | 11:52 |     7:36 |    7:22 |    17:18 |  17:19 |
 2–17 |  4:01 |     7:09 |    6:56 |    18:23 |  17:52 |
 3–18 | 18:24 |     7:00 |    7:15 |    19:20 |  19:20 |
 4–17 |  4:53 |     6:20 |    6:31 |    20:36 |  19:48 |
 5–16 | 13:01 |     5:26 |    5:58 |    20:46 |  20:14 |
 6–14 | 19:54 |     4:54 |    5:46 |    20:49 |  20:34 |
 7–14 |  2:43 |     6:04 |    5:58 |    21:15 |  20:32 |
 8–12 | 10:36 |     6:12 |    6:22 |    20:18 |  20:07 |
 9–10 | 20:26 |     6:16 |    6:47 |    19:12 |  19:26 |
10–10 |  8:49 |     7:19 |    7:13 |    19:28 |  18:40 |
11–8  | 23:02 |     6:16 |    6:42 |    16:27 |  17:04 |
12–8  | 16:52 |     7:12 |    7:12 |    16:24 |  16:51 |

Data from JPL Horizons.

🌕 Full Moon
--------------------------------------------------------------------------------
**If the event time falls before the *Q-point*, post on the previous day.
Otherwise, post on the same day.**

The **Q-point** is the midpoint between the time of **upper culmination**
(**oK**), when the moon is at its highest point in the sky (typically near
midnight), and the **time of moonset** (typically near sunrise), therefore it
takes place early in the morning roughly between 3:30 AM and 4:30 AM, when most
people are asleep. The post should be made when it is most prominently visible.

The **upper culmination** (**oK**) can simply and naively be calculated as the
midpoint between moonrise and moonset, a reasonably accurate approximation.

```text
oK = (moonrise + moonset) / 2 + 12h
Q  = (oK + moonset) / 2
```

**Note**: Because moonrise and moonset cross midnight (rise in the PM, set in
the AM), the naive average `(moonrise + moonset) / 2` does not yield the true
midpoint of the visible arc. Adding 12h corrects for this, producing the transit
time. All times wrap modulo 24h (e.g., 25:10 → 1:10).

### Attributes
- The moon transits through the night:
  - Moonrise at sunset,
  - Moonset at sunrise **on the following day**.

### Event Calendar (2026)
Date  |  Time | Moonrise | Moonset |    oK |    Q | Notes
------|------:|---------:|--------:|------:|-----:|-----------------------------
 1–3  |  2:03 |    17:29 |    8:00 |  0:45 | 4:23 | **p** –15 H moonrise (visible)
 2–1  | 19:09 |    17:33 |    7:17 |  0:25 |    — | **s**
 3–3  |  3:38 |    19:39 |    6:42 |  1:11 | 3:57 | **p** –16 H moonrise (visible)
 4–1  | 19:12 |    19:33 |    6:32 |  1:03 |    — | **s**   0 H moonrise (invisible)
 5–1  | 10:24 |    20:29 |    5:51 |  1:10 | 3:31 | **s** –10 H moonrise (invisible)
 5–31 |  1:46 |    21:20 |    5:37 |  1:29 | 3:33 | **p** –20 H moonrise (visible)
 6–29 | 16:57 |    20:55 |    5:13 |  1:04 |    — | **s**  –3 H moonrise (invisible)
 7–29 |  7:35 |    20:42 |    6:06 |  1:24 | 3:45 | **s** –13 H moonrise (invisible)
 8–27 | 21:18 |    19:37 |    6:01 |  0:49 |    — | **s**
 9–26 |  9:48 |    19:52 |    7:01 |  1:27 | 4:14 | **s** –10 H moonrise (invisible)
10–25 | 21:11 |    17:48 |    6:59 |  0:24 |    — | **s**
11–24 |  6:53 |    16:46 |    7:19 |  0:03 | 3:41 | **s** –10 H moonrise (visible)
12–23 | 17:28 |    16:32 |    7:16 | 23:54 |    — | **s**

- **s**: Post on same day
- **p**: Post on previous day

🌓 Half Moon (First Quarter)
--------------------------------------------------------------------------------
**Post on the day of the phase event.**

### Attributes
- Moonrise around noon.
- Moonset around midnight.

### Event Calendar (2026)
Date  |  Time | Moonrise | Moonset |   uK | Notes
------|------:|---------:|--------:|-----:|---------------
 1–25 | 20:47 |    10:47 |   23:59 |    — |
 2–24 |  4:28 |    10:46 |    1:25 | 6:06 | –6 H moonrise
 3–25 | 12:18 |    11:40 |    2:33 |    — |
 4–23 | 19:32 |    11:54 |    2:13 |    — |
 5–23 |  4:11 |    13:12 |    1:54 | 7:33 | –9 H moonrise
 6–21 | 19:56 |    13:10 |    0:45 |    — |
 7–21 |  4:06 |    14:06 |   23:59 | 7:03 | –10 H moonrise
 8–19 | 19:46 |    13:58 |   23:31 |    — |
 9–18 | 13:43 |    14:39 |   23:43 | 7:11 | –1 H moonrise
10–18 |  9:12 |    14:39 |   23:59 | 7:19 | –5 H moonrise
11–17 |  3:48 |    13:04 |   23:59 | 6:32 | –10 H moonrise
12–16 | 21:43 |    11:52 |   23:59 |    — |

🌗 Half Moon (Last Quarter)
--------------------------------------------------------------------------------
**Post on the moon phase event calendar date if the event time is before the
lower culmination (*uK*). Otherwise, post on the next calendar date.**

The **lower culmination** (**uK**) is the polar opposite of the upper
culmination used in the Full Moon rule above. It is when the moon is at its
lowest point below the horizon. Because the moonrise time can cross the midnight
boundary, the calculation below must account for it.

```text
duration = (moonset - moonrise) % 24h
transit  = (moonrise + duration / 2) % 24h
uK       = (transit + 12h) % 24h
```

### Attributes
- Moonrise around midnight.
- Moonset around noon.

### Event Calendar (2026)
Date  |  Time | Moonrise | Moonset |    uK | Notes
------|------:|---------:|--------:|------:|--------------
 1–10 |  7:49 |     0:15 |   11:27 | 17:51 | Same day post
 2–9  |  4:44 |     1:05 |   10:50 | 17:58 | Same day post
 3–11 |  2:40 |     2:50 |   11:51 | 19:21 |  s
 4–9  | 21:53 |     2:21 |   11:33 | 18:57 |  n
 5–9  | 14:11 |     2:06 |   12:30 | 19:18 |  s
 6–8  |  3:01 |     1:25 |   13:29 | 19:27 | Same day post
 7–7  | 12:30 |     0:16 |   13:30 | 18:53 | Same day post
 8–5  | 19:22 |    23:48 |   13:41 | 18:45 |  n
 9–4  |  0:51 |     0:00 |   15:06 | 19:33 | Same day post
10–3  |  6:25 |     0:00 |   14:56 | 19:28 | Same day post
11–1  | 12:29 |    23:43 |   13:18 | 18:31 | Same day post
11–30 | 22:09 |    23:52 |   12:20 | 18:06 |  n
12–30 | 11:00 |     0:00 |   11:38 | 17:49 | Same day post

- **s**: Post same day
- **n**: Post next day
