"use strict";

export const LONG_MSG_BITS = 112;
export const SHORT_MSG_BITS = 56;

// Given the Downlink Format (DF) of the message, return the message length in
// bits.
//
// All known DF's 16 or greater are long. All known DF's 15 or less are short.
// There are lots of unused codes in both category, so we can assume ICAO will
// stick to these rules, meaning that the most significant bit of the DF
// indicates the length.
export function msgLen(type) {
  return type & 0x10 ? LONG_MSG_BITS : SHORT_MSG_BITS;
}
