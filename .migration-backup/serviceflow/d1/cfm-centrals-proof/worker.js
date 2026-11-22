const PATH = "/api/cfm/master-data/centrals";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== PATH) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // The production Express route still owns user-session authorization.
    // This isolated proof requires a local-only service token and is not wired
    // into the app or suitable for deployment.
    const expected = env.PROOF_TOKEN;
    if (!expected) {
      return Response.json({ error: "Proof token is not configured" }, { status: 503 });
    }
    if (request.headers.get("authorization") !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { results } = await env.DB
        .prepare("SELECT id, name, code, created_at AS createdAt FROM centrals")
        .all();
      return Response.json(results);
    } catch {
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
};
