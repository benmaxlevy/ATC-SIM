/** Fixed physics rate. Render loops must not use display refresh as `dt`. */
export const PHYSICS_HZ = 20;

/** Fixed sim step in seconds (`1 / 20`). */
export const SIM_DT_S = 1 / PHYSICS_HZ;

/**
 * Cap `advanceWorld` iterations per call so a backgrounded tab cannot spiral
 * (remainder is held, not discarded).
 */
export const MAX_PHYSICS_STEPS_PER_FRAME = 8;
