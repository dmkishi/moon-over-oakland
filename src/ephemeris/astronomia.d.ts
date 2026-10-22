/**
 * astronomia ships no types and its `exports` map has no `types` condition, so
 * subpath imports are `any` under `noImplicitAny`. Declare only what is used;
 * all named exports below are present in the installed 4.2.0 source.
 */
declare module 'astronomia/moonphase' {
  /** JDE of the phase of this kind nearest `year`, within ~14.8 days. */
  export function newMoon(year: number): number;
  export function first(year: number): number;
  export function full(year: number): number;
  export function last(year: number): number;
}

declare module 'astronomia/julian' {
  /** Converts a Julian Ephemeris Day (TT) to a UT `Date`, applying ΔT. */
  export function JDEToDate(jde: number): Date;
  /** Converts a UT `Date` to a Julian Ephemeris Day (TT), applying ΔT. */
  export function DateToJDE(date: Date): number;
}

declare module 'astronomia/base' {
  export function JDEToJulianYear(jde: number): number;
  /** Ecliptic or equatorial coordinates in radians; `range` in the source's unit. */
  export class Coord {
    constructor(ra: number, dec: number, range?: number);
    ra: number;
    dec: number;
    lon: number;
    lat: number;
    range: number | undefined;
  }
  /** Illuminated fraction of a disc from its phase angle in radians (Meeus 48.1). */
  export function illuminated(i: number): number;
  /** Position angle of the bright limb's midpoint, 0–2π (Meeus 48.5). */
  export function limb(equ: Coord, appSun: Coord): number;
}

declare module 'astronomia/planetposition' {
  /** A VSOP87 planet, built from one of the `astronomia/data/vsop87B*` series. */
  export class Planet {
    constructor(series: object);
    readonly name: string;
  }
}

declare module 'astronomia/data/vsop87Bearth' {
  const series: object;
  export default series;
}

declare module 'astronomia/moonposition' {
  /** Geocentric ecliptic λ, β (mean equinox of date, no nutation) and range in km. */
  export function position(jde: number): { lon: number; lat: number; range: number };
}

declare module 'astronomia/moon' {
  import type { Coord } from 'astronomia/base';
  import type { Planet } from 'astronomia/planetposition';
  /**
   * Meeus ch. 53, geocentric: the sub-Earth point (libration l, b), the axis
   * position angle P, and the subsolar point (l₀, b₀), all in radians.
   */
  export function physical(jde: number, earth: Planet): [cMoon: Coord, P: number, cSun: Coord];
}

declare module 'astronomia/solar' {
  import type { Coord } from 'astronomia/base';
  import type { Planet } from 'astronomia/planetposition';
  /** Apparent RA and Dec of the Sun in radians, and its range in AU. */
  export function apparentEquatorialVSOP87(earth: Planet, jde: number): Coord & { range: number };
}

declare module 'astronomia/nutation' {
  /** Nutation in longitude Δψ and in obliquity Δε, in radians. */
  export function nutation(jde: number): [Δψ: number, Δε: number];
  export function meanObliquity(jde: number): number;
}

declare module 'astronomia/coord' {
  export class Ecliptic {
    constructor(lon: number, lat: number);
    toEquatorial(ε: number): { ra: number; dec: number };
  }
}

declare module 'astronomia/moonillum' {
  import type { Coord } from 'astronomia/base';
  /** Phase angle in radians from equatorial coordinates and ranges in one unit. */
  export function phaseAngleEquatorial(cMoon: Coord, cSun: Coord): number;
}
