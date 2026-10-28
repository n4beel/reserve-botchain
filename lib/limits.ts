/**
 * Reserve protocol limits and bounds (mirrors contracts/src/Reserve.sol).
 */
export const MIN_SLOT_SECS = 900; // 15 minutes
export const MAX_SLOT_SECS = 86400; // 24 hours
export const MAX_CUTOFF_SECS = 604800; // 7 days
export const HORIZON_SECS = 5184000; // 60 days
export const MAX_NAME = 40; // 40 bytes
export const MAX_SLOTS_WINDOW = 96; // 96 slots per window query
export const MAX_LATEST = 50; // 50 resources per page
