'use strict';
/**
 * The five steps a new shop has to finish before it can take a single order —
 * and, more importantly, an honest answer about which of them are done.
 *
 * Every competitor sells "start in five minutes", and we had all five screens
 * already: the profile, the products, the shipping zones, the payment methods,
 * the storefront link. What we did not have was anything telling a merchant
 * which one they had skipped. A shop with products, a theme colour and no way
 * to receive money looks finished from the inside and takes nothing.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 *
 * NOTHING here is stored. There is no `setup_progress` table, no
 * `step_3_done` column. Every step's state is COMPUTED from the same data the
 * shop actually runs on, every time the page is opened.
 *
 * A stored flag is a lie waiting to happen: the merchant adds a product, the
 * flag flips to done, they delete it a week later — and the wizard still says
 * "أول منتج ✓" over an empty shop. The same story for a payment method that
 * gets cleared, or a shipping zone that gets deleted. Deriving costs one cheap
 * query and can never drift from the truth.
 *
 * ── Three states, not two ───────────────────────────────────────────────────
 *
 * `done` · `todo` · `unknown`. A failed read is `unknown` and is never painted
 * green and never painted red — telling a merchant who HAS configured payments
 * that they have not is its own kind of damage. Same rule as the payment chip.
 *
 * `note` is a fourth state that means "done, and here is a consequence you may
 * not have intended" — a shop with no shipping zones is finished and working;
 * it just delivers free to the whole country, and it should be told so plainly
 * rather than nagged at.
 */

/** The five steps, in the order a merchant meets them. */
const STEPS = [
  // Blocks the launch: a shop with no name is not a shop.
  { key: 'identity', href: '/company/profile',            blocks: true  },
  // Blocks the launch: an empty catalogue can be opened and sells nothing.
  { key: 'product',  href: '/company/products/add',       blocks: true  },
  // Does NOT block: no zones is a legitimate shop that does not charge for
  // delivery — the checkout already treats it that way.
  { key: 'shipping', href: '/company/shipping',           blocks: false },
  // Blocks the launch: this is the whole point of the shop.
  { key: 'payment',  href: '/accounting/payments',        blocks: true  },
  // Not an action — a verdict. See `launch` below.
  { key: 'launch',   href: null,                          blocks: false },
];

const KEYS = STEPS.map((s) => s.key);

/** Done for the purposes of counting and of unblocking the launch. */
function isDone(step) {
  return !!step && (step.state === 'done' || step.state === 'note');
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** A count that came back from a failed read is null, not zero. */
function count(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The state of one step from the shop's real data.
 *
 * @param {string} key
 * @param {object} facts
 * @param {object} [pre] states already computed (the launch step reads them)
 */
function stepState(key, facts, pre) {
  const f = facts || {};
  switch (key) {
    case 'identity': {
      if (!nonEmpty(f.name)) return { state: 'todo', why: 'name' };
      // A shop with a name but no logo is open for business; say what is
      // missing without calling the step unfinished.
      if (!nonEmpty(f.logo)) return { state: 'note', why: 'logo' };
      return { state: 'done', why: 'ok' };
    }
    case 'product': {
      const n = count(f.products);
      if (n === null) return { state: 'unknown', why: 'read' };
      if (n === 0) return { state: 'todo', why: 'none' };
      const withImage = count(f.productsWithImage);
      // A product page with no photograph sells badly. It still sells.
      if (withImage === 0) return { state: 'note', why: 'image' };
      return { state: 'done', why: 'ok' };
    }
    case 'shipping': {
      const n = count(f.zones);
      if (n === null) return { state: 'unknown', why: 'read' };
      // The consequence, stated: every order ships for zero.
      if (n === 0) return { state: 'note', why: 'free' };
      return { state: 'done', why: 'ok' };
    }
    case 'payment': {
      if (f.payReady === null || f.payReady === undefined) return { state: 'unknown', why: 'read' };
      return f.payReady ? { state: 'done', why: 'ok' } : { state: 'todo', why: 'none' };
    }
    case 'launch': {
      // The launch step is deliberately NOT a switch.
      //
      // There is no "published" flag on a company and this file does not add
      // one: the only column that hides a store is `companies.is_active`, and
      // that same column is what the login query checks — flipping it off to
      // "unpublish" would lock the merchant out of the panel they were
      // standing in. So the store is live from the moment it exists, and the
      // honest job of this step is to SAY so, and to say whether what the
      // visitor finds there can actually take an order.
      const blockers = STEPS.filter((s) => s.blocks).map((s) => s.key);
      const missing = blockers.filter((k) => pre[k] && pre[k].state === 'todo');
      const unsure = blockers.filter((k) => pre[k] && pre[k].state === 'unknown');
      if (missing.length) return { state: 'todo', why: 'blocked', missing };
      if (unsure.length) return { state: 'unknown', why: 'read', missing: unsure };
      return { state: 'done', why: 'live' };
    }
    default:
      return { state: 'unknown', why: 'read' };
  }
}

/**
 * The whole wizard for one shop.
 * @returns {{steps: Array, done: number, total: number, percent: number, next: string|null, ready: boolean}}
 */
function review(facts) {
  const byKey = {};
  const steps = [];
  for (const def of STEPS) {
    const s = Object.assign({}, def, stepState(def.key, facts, byKey));
    byKey[def.key] = s;
    steps.push(s);
  }
  const done = steps.filter(isDone).length;
  // The first step that still wants something — where the banner's button
  // goes. The launch step is never "next": it has nowhere to send anybody.
  const next = (steps.find((s) => !isDone(s) && s.key !== 'launch') || {}).key || null;
  return {
    steps,
    byKey,
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
    next,
    ready: isDone(byKey.launch),
  };
}

module.exports = { STEPS, KEYS, isDone, stepState, review };
