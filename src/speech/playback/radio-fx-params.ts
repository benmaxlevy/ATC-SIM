/**
 * Named radio-FX constants (README §7.2). v1 should sound like a radio,
 * not a calibrated transceiver. Tune here — do not scatter magic numbers.
 */

/** High-pass cutoff (Hz). Typical ATC radio / telephone low edge. */
export const RADIO_HIGHPASS_HZ = 300;

/** Low-pass cutoff (Hz). Typical ATC radio / telephone high edge. */
export const RADIO_LOWPASS_HZ = 3000;

/** Butterworth Q for the highpass + lowpass pair (~−3 dB at each cutoff). */
export const RADIO_FILTER_Q = 0.7071;

/** Voice path gain after the band-limit filters. */
export const RADIO_VOICE_GAIN = 1;

/**
 * Looping noise mix versus voice. Ticket range ~0.02–0.05 so hiss does not
 * drown the readback.
 */
export const RADIO_NOISE_GAIN = 0.03;

/** White-noise buffer length (seconds). Looped only while a clip plays. */
export const RADIO_NOISE_DURATION_SEC = 1;

/** Compressor threshold (dB). Gentle peak taming after the filter. */
export const RADIO_COMPRESSOR_THRESHOLD_DB = -24;

/** Compressor knee (dB). */
export const RADIO_COMPRESSOR_KNEE_DB = 12;

/** Compressor ratio. Keep this mild — not a slam limiter. */
export const RADIO_COMPRESSOR_RATIO = 4;

/** Compressor attack (seconds). */
export const RADIO_COMPRESSOR_ATTACK_SEC = 0.003;

/**
 * Compressor release (seconds). Matches the T03-06 50 ms playback tail
 * so release is not clipped into the next PTT.
 */
export const RADIO_COMPRESSOR_RELEASE_SEC = 0.05;

/** Master gain after the compressor. */
export const RADIO_MASTER_GAIN = 1;

/** Default: PCM clips go through the FX graph. T03-10 may toggle this. */
export const DEFAULT_RADIO_FX_ENABLED = true;
