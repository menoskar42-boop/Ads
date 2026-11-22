'use strict';
/**
 * Codes that are worth money.
 *
 * A gift card code WAS the money — `Math.random()` picked eight characters out
 * of thirty-two and that was the whole secret. `Math.random` is not a random
 * number generator in the sense anybody needs here: V8 seeds it from values an
 * attacker can often narrow down, and its entire future output is recoverable
 * from a handful of observed samples. A merchant who issues a hundred cards
 * publishes a hundred samples. Guessing the next one is not a brute force, it
 * is arithmetic.
 *
 * `crypto.randomBytes` costs the same and is not guessable.
 *
 * Two details that are not decoration:
 *
 *  · **The alphabet drops O/0, I/1 and S/5.** These codes get read down a phone
 *    line and typed by hand. A code nobody can dictate is a support call.
 *
 *  · **Rejection sampling, not `% length`.** 256 does not divide 31, so the
 *    first eight letters of the alphabet would come up ~3% more often than the
 *    rest. On its own that is not a break, but it is free to avoid and it is
 *    the kind of shortcut that ends up in something that does matter.
 */
const crypto = require('crypto');

/** Unambiguous when spoken: no O/0, no I/1, no S/5. */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

function randomCode(length, alphabet = ALPHABET) {
  const n = alphabet.length;
  const limit = Math.floor(256 / n) * n;      // the unbiased part of a byte
  let out = '';
  while (out.length < length) {
    for (const b of crypto.randomBytes((length - out.length) * 2)) {
      if (b >= limit) continue;               // would skew the distribution
      out += alphabet[b % n];
      if (out.length === length) break;
    }
  }
  return out;
}

/** A gift card: prefixed so a merchant can tell it apart at a glance. */
const giftCode = () => 'GIFT' + randomCode(10);

/** A referral code: short, because a human repeats it. */
const referralCode = () => randomCode(6);

module.exports = { ALPHABET, randomCode, giftCode, referralCode };
