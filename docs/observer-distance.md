Observer Distance
================================================================================
**This document measures how far from Oakland the posts stay accurate.** The
observer is a boulder on the shore of Lake Merritt (see
[`src/observer.ts`](../src/observer.ts)).

In short, rise and set times drift by **about 8 minutes per 100 miles** in the
worst direction. SunCalc itself is 0.5 to 2 minutes off JPL Horizons at Oakland,
so moving the observer adds no meaningful error until roughly 15 to 25 miles
out.

What Depends on Location
--------------------------------------------------------------------------------
- **Phase dates do not.** A phase event is a geocentric instant, and the post
  day is chosen by local clock time (see [posting
  algorithm](posting-algorithm.md)). Anywhere on Pacific time gets the same
  post day and the same "Next phases" list.
- **Moonrise and moonset times do.** These are the printed clock times.
- **Rise and set wording barely does.** Words like "around" and "shortly
  before" compare the moon to the sun at the same place. Moving shifts both, so
  most of the error cancels. The wording only changes when a delta sits near a
  bucket boundary in [`src/post.liquid`](../src/post.liquid).

Rule of Thumb
--------------------------------------------------------------------------------
Direction   | Shift per mile                 | 1 minute off at
------------|--------------------------------|----------------
East–west   | 4.6 s, constant                | ~13 miles
North–south | 2.0 s average, 3.6 s maximum   | ~17 miles at worst

East–west error comes from the Earth's rotation, so it is the same every day.
North–south error depends on the moon's declination.

Measurements
--------------------------------------------------------------------------------
Every principal phase post from 2025 through 2027 (148 posts) was regenerated
with the observer moved due north, south, east, and west, then compared against
Oakland's. Error is the absolute shift in moonrise and moonset. Rise and set
errors come out equal because latitude moves them symmetrically around transit
and longitude moves them together.

### By distance
| Distance | Typical error (min) | Worst error (min) | Posts with changed wording |
|---------:|--------------------:|------------------:|----------------------------|
|     1 mi |             0.0–0.1 |               0.1 | 0–1%                       |
|     5 mi |             0.2–0.4 |               0.4 | 0–1%                       |
|    10 mi |             0.3–0.8 |               0.8 | 0–1%                       |
|    25 mi |             0.8–1.9 |               1.9 | 0–1%                       |
|    50 mi |             1.6–3.8 |               3.9 | 1–2%                       |
|   100 mi |             3.2–7.6 |               7.7 | 1–3%                       |
|   250 mi |                8–19 |                19 | 1–10%                      |
|   500 mi |               15–38 |                39 | 3–11%                      |

The lower end of each range is north–south and the upper end is east–west.

The printed minute changes much sooner than the error suggests. Times are
truncated to the minute, so even a few seconds can tick one over. By 25 miles east
or west, every post that prints times prints different ones, though only by a
minute.

### By city
City          | Distance | Typical error (min) | Worst error (min) | Posts with changed wording
--------------|---------:|--------------------:|------------------:|--------------------------:
Berkeley      |     5 mi |                 0.2 |               0.3 |   0
San Francisco |     9 mi |                 0.7 |               0.8 |   0
San Jose      |    38 mi |                 1.6 |               3.4 |   2
Sacramento    |    68 mi |                 3.2 |               6.3 |   4
Fresno        |   154 mi |                  10 |                15 |   5
Los Angeles   |   340 mi |                  17 |                31 |  12
Las Vegas     |   405 mi |                  30 |                36 |  12
San Diego     |   449 mi |                  21 |                40 |  17
Portland      |   534 mi |                  20 |                38 |  12
Seattle       |   678 mi |                  27 |                49 |  24

Caveats
--------------------------------------------------------------------------------
- **Last quarter moonrise can land on a different day.** It rises near
  midnight, so a small move pushes it across into the neighboring civil day and
  `calculateDayEvents` picks a different rise. The last quarter template prints
  no times, so the post is unchanged. These cases are left out of the error
  figures above.
- **SunCalc can miss a moonset at its window edge.** SunCalc 2.1.1 searches one
  local solar day, nadir to nadir, per call. A first quarter moonset falls near
  local midnight, and when it lands right on the window edge SunCalc drops it,
  so `calculateDayEvents` throws. This happened on 2027-12-05 at 155 miles north
  and on 2027-06-10 in Los Angeles. Oakland's own coordinates have no failures
  from 2020 through 2045, but changing the observer would need a recheck.
- **Only Pacific time was tested.** Outside it, the post day and every printed
  time change with the time zone, which is a different problem.

Measured 2026-10-17 against commit `20b315c`.
