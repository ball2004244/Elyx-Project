/**
 * @file Tunable scheduler parameters. Centralized so workload/spacing policy is
 * one edit, and so tests can import the same constants they assert against.
 */

/** Max resource/venue-bound EVENTS placed on a single day (routines exempt). */
export const MAX_EVENTS_PER_DAY = 6;

/** Minimum gap (minutes) required between two consecutive events. */
export const EVENT_BUFFER_MIN = 30;

/** Active day window for placing activities (minutes from midnight). */
export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 21 * 60; // 21:00

/** Candidate-slot granularity (minutes). */
export const GRID_MIN = 30;
