var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var PATH = "/api/cfm/master-data/centrals";
var CONTEXT_HEADER = "x-sf-cfm-context";
var SIGNATURE_HEADER = "x-sf-cfm-signature";
var encoder = new TextEncoder();
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
__name(unauthorized, "unauthorized");
async function verifyContext(request, env) {
  const rawContext = request.headers.get(CONTEXT_HEADER);
  const encodedSignature = request.headers.get(SIGNATURE_HEADER);
  if (!rawContext || !encodedSignature || !env.CONTEXT_SECRET || !env.CONTEXT_AUDIENCE) {
    return null;
  }
  let signature;
  let claims;
  try {
    signature = decodeBase64Url(encodedSignature);
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(rawContext)));
  } catch {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.CONTEXT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(rawContext)
  );
  if (!validSignature) return null;
  const now = Math.floor(Date.now() / 1e3);
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.role !== "string" || !claims.role || claims.aud !== env.CONTEXT_AUDIENCE || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > now + 30 || claims.exp <= now || claims.exp - claims.iat > 60) {
    return null;
  }
  return claims;
}
__name(verifyContext, "verifyContext");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userBasePath = "/api/cfm/auth/users";
    const userByUsername = url.pathname === `${userBasePath}/by-username`;
    const userMatch = url.pathname.match(/^\/api\/cfm\/auth\/users\/([^/]+)$/);
    const centralId = url.pathname.startsWith(`${PATH}/`) ? url.pathname.slice(PATH.length + 1) : null;
    const centralRoute = url.pathname === PATH || Boolean(centralId);
    if (!userByUsername && !userMatch && !centralRoute) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.method !== "GET" && (userByUsername || userMatch)) {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const expectedServiceToken = env.SERVICE_TOKEN;
    if (!expectedServiceToken || request.headers.get("authorization") !== `Bearer ${expectedServiceToken}`) {
      return unauthorized();
    }
    if (userByUsername) {
      try {
        const username = url.searchParams.get("username");
        if (!username) return Response.json({ error: "Username required" }, { status: 400 });
        const row = await env.DB.prepare(
          `SELECT id, username, password, name, role, avatar,
                  is_initial_password AS isInitialPassword, created_at AS createdAt, suspended
             FROM cfm_users WHERE username = ?`
        ).bind(username).first();
        return row ? Response.json(row) : Response.json({ error: "User not found" }, { status: 404 });
      } catch {
        return Response.json({ error: "D1 operation failed" }, { status: 500 });
      }
    }
    const claims = await verifyContext(request, env);
    if (!claims) return unauthorized();
    try {
      if (userMatch) {
        const row = await env.DB.prepare(
          `SELECT id, username, password, name, role, avatar,
                  is_initial_password AS isInitialPassword, created_at AS createdAt, suspended
             FROM cfm_users WHERE id = ?`
        ).bind(decodeURIComponent(userMatch[1])).first();
        return row ? Response.json(row) : Response.json({ error: "User not found" }, { status: 404 });
      }
      if (request.method === "GET" && url.pathname === PATH) {
        const { results } = await env.DB.prepare("SELECT id, name, code, created_at AS createdAt FROM centrals ORDER BY name, id").all();
        return Response.json(results);
      }
      if (request.method === "POST" && url.pathname === PATH) {
        const body = await request.json();
        if (typeof body.name !== "string" || typeof body.code !== "string") {
          return Response.json({ error: "Invalid central data" }, { status: 400 });
        }
        const row = await env.DB.prepare(
          `INSERT INTO centrals (id, name, code, created_at)
           VALUES (?, ?, ?, ?) RETURNING id, name, code, created_at AS createdAt`
        ).bind(crypto.randomUUID(), body.name, body.code, (/* @__PURE__ */ new Date()).toISOString()).first();
        return Response.json(row, { status: 201 });
      }
      if (request.method === "PATCH" && centralId) {
        const body = await request.json();
        const fields = ["name", "code"].filter((key) => Object.hasOwn(body, key));
        if (!fields.length || fields.some((key) => typeof body[key] !== "string")) {
          return Response.json({ error: "Invalid central data" }, { status: 400 });
        }
        const assignments = fields.map((key) => `${key} = ?`).join(", ");
        const values = fields.map((key) => body[key]);
        const row = await env.DB.prepare(
          `UPDATE centrals SET ${assignments} WHERE id = ? RETURNING id, name, code, created_at AS createdAt`
        ).bind(...values, centralId).first();
        return row ? Response.json(row) : Response.json({ error: "Central not found" }, { status: 404 });
      }
      if (request.method === "DELETE" && centralId) {
        await env.DB.prepare("DELETE FROM centrals WHERE id = ?").bind(centralId).run();
        return Response.json({ success: true });
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch {
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  }
};

// ../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-dvaIrn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-dvaIrn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
