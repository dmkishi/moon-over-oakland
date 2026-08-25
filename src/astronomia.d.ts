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
}
