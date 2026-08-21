Posting Algorithm
================================================================================
**This document describes the timing rules for publishing the moon phase posts.**
The goal is to announce each phase on the day it is most prominent to a typical,
diurnal audience.

**Posting on the day of the phase event is not necessarily ideal.** This is
because, while each phase, e.g. full moon, half moon, etc., has a characteristic
relationship between its rise and set times and the sun's, the phase event — the
precise moment a full moon becomes "full" — falls at arbitrary clock times.

For instance, during the full moon phase, it always rises near sunset and sets
near sunrise — it is observable all night long. However, the *moment* of its
phase event can occur at any time, including during the day when it is not
visible.

So if a full moon event takes place shortly after midnight, it would be more
beneficial to announce it the day before — when on that evening, the moon phase
is most pronounced, despite being *the day before* the phase event.

Therefore **posts are published if a phase event occurs at or after 4:00 AM the
day of and before 4:00 AM the next day**.

### Notes
- Avoid boundary times between 1:00 AM and 3:00 AM due to daylight saving time,
  which can make wall-clock times either nonexistent ("spring forward") or
  ambiguous ("fall back").
- All tabulated data below are for 2026 in local time (America/Los_Angeles) and
  sourced from JPL Horizons via `pnpm horizons`.

🌑 New Moon
--------------------------------------------------------------------------------
The moon **rises near sunrise** and **sets near sunset**.

Date   |   Time | Moonrise |  Moonset | Sunrise | Sunset | Post    |
-------|-------:|---------:|---------:|--------:|-------:|---------|
 1-18  |  11:51 |     7:36 |    17:18 |    7:22 |  17:19 | Day-of  |
 2-17  |   4:01 |     7:09 |    18:23 |    6:56 |  17:52 | Day-of  |
 3-18  |  18:23 |     7:00 |    19:20 |    7:15 |  19:20 | Day-of  |
 4-17  |   4:51 |     6:20 |    20:36 |    6:31 |  19:48 | Day-of  |
 5-16  |  13:01 |     5:26 |    20:46 |    5:58 |  20:14 | Day-of  |
 6-14  |  19:54 |     4:54 |    20:49 |    5:46 |  20:34 | Day-of  |
 7-14  |   2:43 |     6:04 |    21:15 |    5:58 |  20:32 | Prev.   |
 8-12  |  10:36 |     6:12 |    20:18 |    6:22 |  20:07 | Day-of  |
 9-10  |  20:26 |     6:16 |    19:12 |    6:47 |  19:26 | Day-of  |
10-10  |   8:50 |     7:19 |    18:28 |    7:13 |  18:40 | Day-of  |
11-8   |  23:02 |     6:16 |    16:27 |    6:42 |  17:04 | Day-of  |
12-8   |  16:51 |     7:12 |    16:24 |    7:12 |  16:51 | Day-of  |

🌓 First Quarter (Half Moon)
--------------------------------------------------------------------------------
The moon **rises around noon** and **sets around midnight**.

Date   |   Time | Moonrise |  Moonset | Post    |
-------|-------:|---------:|---------:|---------|
 1-25  |  20:47 |    10:47 |   1:07 † | Day-of  |
 2-24  |   4:27 |    10:46 |   1:26 † | Day-of  |
 3-25  |  12:17 |    11:41 |   2:34 † | Day-of  |
 4-23  |  19:31 |    11:54 |   2:14 † | Day-of  |
 5-23  |   4:10 |    13:12 |   1:55 † | Day-of  |
 6-21  |  14:55 |    13:10 |   0:46 † | Day-of  |
 7-21  |   4:05 |    14:06 |   0:27 † | Day-of  |
 8-19  |  19:46 |    13:59 |  23:32   | Day-of  |
 9-18  |  13:43 |    14:39 |  23:44   | Day-of  |
10-18  |   9:12 |    14:39 |   0:30 † | Day-of  |
11-17  |   3:47 |    13:04 |   0:22 † | Prev.   |
12-16  |  21:42 |    11:53 |   0:13 † | Day-of  |

† Next day

🌕 Full Moon
--------------------------------------------------------------------------------
The moon **rises near sunset** and **sets near sunrise** the next day.

Date   |   Time | Moonrise |  Moonset | Post    |
-------|-------:|---------:|---------:|---------|
 1-3   |   2:02 |    17:29 |   8:02 † | Prev.   |
 2-1   |  14:09 |    17:34 |   7:18 † | Day-of  |
 3-3   |   3:37 |    18:40 |   6:44 † | Prev.   |
 4-1   |  19:11 |    19:33 |   6:33 † | Day-of  |
 5-1   |  10:23 |    20:29 |   5:52 † | Day-of  |
 5-31  |   1:45 |    21:20 |   5:39 † | Prev.   |
 6-29  |  16:56 |    20:55 |   5:14 † | Day-of  |
 7-29  |   7:35 |    20:42 |   6:07 † | Day-of  |
 8-27  |  21:18 |    19:37 |   6:02 † | Day-of  |
 9-26  |   9:49 |    18:53 |   7:02 † | Day-of  |
10-25  |  21:11 |    17:49 |   7:00 † | Day-of  |
11-24  |   6:53 |    16:46 |   7:29 † | Day-of  |
12-23  |  17:28 |    16:32 |   7:17 † | Day-of  |

† Next day

🌗 Last Quarter (Half Moon)
--------------------------------------------------------------------------------
The moon **rises around midnight** and **sets around noon**.

Date   |   Time | Moonrise | Moonset | Post    |
-------|-------:|---------:|--------:|---------|
 1-10  |   7:48 |   0:15   | 11:28 † | Day-of  |
 2-9   |   4:43 |   1:05   | 10:51 † | Day-of  |
 3-11  |   2:38 |   2:50   | 11:52 † | Prev.   |
 4-9   |  21:51 |   2:21   | 11:34 † | Day-of  |
 5-9   |  14:10 |   2:06   | 12:30 † | Day-of  |
 6-8   |   3:00 |   1:25   | 13:30 † | Prev.   |
 7-7   |  12:28 |   0:16   | 13:31 † | Day-of  |
 8-5   |  19:21 |  23:48   | 13:41 † | Day-of  |
 9-4   |   0:51 |  23:16 ‡ | 15:07   | Prev.   |
10-3   |   6:25 |  23:14 ‡ | 14:57   | Day-of  |
11-1   |  12:28 |  23:43   | 13:50 † | Day-of  |
11-30  |  22:08 |  23:52   | 12:21 † | Day-of  |
12-30  |  10:59 |  23:53   | 11:38 † | Day-of  |

‡ Previous day
† Next day
