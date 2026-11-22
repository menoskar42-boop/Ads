// Make async route handlers fail like synchronous ones.
//
// Express 4 does not understand promises. When an `async (req, res) => {}`
// handler rejects, Express never learns about it: `res` is never written and
// the request hangs until the browser gives up. The visitor sees a spinner
// forever — no error page, no 500, nothing. Verified against this app's own
// express version, with server.js's unhandledRejection handler in place: the
// rejection is logged to the console and the client gets no response at all.
//
// Roughly 120 handlers across the app await something outside a try block, so
// any of them meeting a dropped connection or a bad row hangs that request.
// Wrapping them one by one would be 120 chances to miss one, and every handler
// written later would be a new chance. So the fix is applied once, to the
// prototype: from here on a rejected handler calls next(err) and lands in the
// error middleware exactly like a thrown one.
//
// MUST be called before any route module is required — route files call
// router.get(...) at load time, and only handlers registered after the patch
// are wrapped.
'use strict';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

// An express handler is (req,res,next) or (err,req,res,next); anything else is
// a path, an array, or a sub-router and must be passed through untouched.
function wrap(fn) {
  if (typeof fn !== 'function') return fn;
  // Already wrapped, or a Router/app (which is a function with a .handle).
  if (fn.__asyncWrapped || fn.handle || fn.stack) return fn;

  if (fn.length === 4) {
    const wrapped = function (err, req, res, next) {
      try {
        const out = fn.call(this, err, req, res, next);
        if (out && typeof out.then === 'function') out.catch(next);
        return out;
      } catch (e) { return next(e); }
    };
    wrapped.__asyncWrapped = true;
    return wrapped;
  }

  const wrapped = function (req, res, next) {
    try {
      const out = fn.call(this, req, res, next);
      // next may be undefined for a handler used outside the router stack.
      if (out && typeof out.then === 'function' && typeof next === 'function') {
        out.catch(next);
      }
      return out;
    } catch (e) {
      if (typeof next === 'function') return next(e);
      throw e;
    }
  };
  // Express reads fn.length to tell error handlers apart, so the arity of the
  // wrapper has to match what it replaced — it does, both branches above.
  wrapped.__asyncWrapped = true;
  return wrapped;
}

function patch(target, label) {
  if (!target || target.__asyncPatched) return;
  for (const m of METHODS) {
    const original = target[m];
    if (typeof original !== 'function') continue;
    target[m] = function (...args) {
      return original.apply(this, args.map(wrap));
    };
  }
  Object.defineProperty(target, '__asyncPatched', { value: true, enumerable: false });
  if (label && process.env.NODE_ENV !== 'production') {
    console.log('[async-routes] patched ' + label);
  }
}

/**
 * Patch express so every handler registered afterwards forwards a rejected
 * promise to next(). Call once, at the top of server.js.
 */
module.exports = function applyAsyncRoutes(express) {
  patch(express.Router, 'Router');
  patch(express.application, 'application');
};

module.exports.wrap = wrap;
