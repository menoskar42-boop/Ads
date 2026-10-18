import { createHmac } from "node:crypto";

export type CoverageGrantActor = { id: string; role: string; techName?: string };
export type CoverageGrant = {
  id: number;
  granteeTechName: string;
  coveredTechName: string;
  createdBy: string | null;
  createdAt: Date;
};

type Options = {
  baseUrl: string;
  serviceToken: string;
  contextSecret: string;
  audience: string;
};

export function techCoverageGrantsUseD1(): boolean {
  return process.env.SF_TECH_COVERAGE_STORAGE === "d1";
}

export function createTechCoverageGrantsD1FromEnv(): ServiceFlowTechCoverageD1Storage {
  const options = {
    baseUrl: process.env.SF_D1_WORKER_URL || "",
    serviceToken: process.env.SF_D1_SERVICE_TOKEN || "",
    contextSecret: process.env.SF_D1_CONTEXT_SECRET || "",
    audience: process.env.SF_D1_CONTEXT_AUDIENCE || "",
  };
  if (Object.values(options).some((value) => !value)) {
    throw new Error("SF_TECH_COVERAGE_STORAGE=d1 requires the SF_D1_WORKER_URL, SF_D1_SERVICE_TOKEN, SF_D1_CONTEXT_SECRET, and SF_D1_CONTEXT_AUDIENCE settings");
  }
  return new ServiceFlowTechCoverageD1Storage(options);
}

export class ServiceFlowTechCoverageD1Storage {
  constructor(private readonly options: Options) {}

  private async request<T>(
    path: string,
    actor: CoverageGrantActor,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    if (!actor.id || !actor.role) throw new Error("Authenticated Service Flow actor is required");
    const iat = Math.floor(Date.now() / 1000);
    const raw = Buffer.from(JSON.stringify({
      sub: actor.id,
      role: actor.role,
      ...(actor.techName ? { techName: actor.techName } : {}),
      aud: this.options.audience,
      iat,
      exp: iat + 30,
    })).toString("base64url");
    const signature = createHmac("sha256", this.options.contextSecret).update(raw).digest("base64url");
    const response = await fetch(new URL(path, this.options.baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${this.options.serviceToken}`,
        "x-sf-cfm-context": raw,
        "x-sf-cfm-signature": signature,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error(`D1 coverage-grant ${method} failed (${response.status}): ${
        result && typeof result === "object" && "error" in result ? result.error : "request failed"
      }`);
    }
    return result as T;
  }

  private dated(grant: CoverageGrant): CoverageGrant {
    return { ...grant, createdAt: new Date(grant.createdAt) };
  }

  async listForGrantee(name: string, actor: CoverageGrantActor): Promise<CoverageGrant[]> {
    const rows = await this.request<CoverageGrant[]>(
      `/api/serviceflow/tech-coverage-grants?granteeTechName=${encodeURIComponent(name)}`, actor,
    );
    return rows.map((row) => this.dated(row));
  }

  async listAll(actor: CoverageGrantActor): Promise<CoverageGrant[]> {
    const rows = await this.request<CoverageGrant[]>("/api/serviceflow/tech-coverage-grants", actor);
    return rows.map((row) => this.dated(row));
  }

  async create(
    granteeTechName: string,
    coveredTechName: string,
    createdBy: string | null,
    actor: CoverageGrantActor,
  ): Promise<CoverageGrant> {
    const row = await this.request<CoverageGrant>("/api/serviceflow/tech-coverage-grants", actor, "POST", {
      granteeTechName, coveredTechName, createdBy,
    });
    return this.dated(row);
  }

  async delete(id: number, actor: CoverageGrantActor): Promise<void> {
    await this.request(`/api/serviceflow/tech-coverage-grants/${encodeURIComponent(String(id))}`, actor, "DELETE");
  }
}
