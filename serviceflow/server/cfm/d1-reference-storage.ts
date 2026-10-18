import { createHmac } from "node:crypto";
import type {
  CfmUser as User,
  InsertCfmUser as InsertUser,
  Central,
  InsertCentral,
  Cable,
  InsertCable,
  FaultType,
  InsertFaultType,
  WorkType,
  InsertWorkType,
  TaskType,
  InsertTaskType,
  Contractor,
  InsertContractor,
  ExcavationWorker,
  InsertExcavationWorker,
  Ticket,
} from "@shared/cfm-schema";
import type { IStorage } from "./storage";

type D1Slice = Pick<IStorage,
  | "getUser" | "getUserByUsername" | "createUser" | "updateUser" | "deleteUser" | "getAllUsers" | "updateUserPassword"
  | "getAllCentrals" | "createCentral" | "updateCentral" | "deleteCentral"
  | "getAllCables" | "createCable" | "updateCable" | "deleteCable"
  | "getAllFaultTypes" | "createFaultType" | "updateFaultType" | "deleteFaultType"
  | "getAllWorkTypes" | "createWorkType" | "updateWorkType" | "deleteWorkType"
  | "getAllTaskTypes" | "createTaskType" | "updateTaskType" | "deleteTaskType"
  | "getAllContractors" | "createContractor" | "updateContractor" | "deleteContractor"
  | "getAllExcavationWorkers" | "createExcavationWorker" | "updateExcavationWorker" | "deleteExcavationWorker"
   | "getAllTickets" | "getTicketById"
>;

type Actor = { id: string; role: string };
type Options = {
  baseUrl: string;
  serviceToken: string;
  contextSecret: string;
  audience: string;
  actor: () => Actor | null;
};

export class CfmD1ReferenceStorage implements D1Slice {
  constructor(private readonly options: Options) {}

  private dated<T>(value: T): T {
    if (!value || typeof value !== "object" || !("createdAt" in value)) return value;
    const row = value as T & { createdAt: unknown };
    return {
      ...row,
      createdAt: typeof row.createdAt === "string" ? new Date(row.createdAt) : row.createdAt,
    } as T;
  }

  private async request<T>(path: string, method = "GET", body?: unknown, preAuth = false): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.options.serviceToken}` };
    if (!preAuth) {
      const actor = this.options.actor();
      if (!actor?.id || !actor.role) throw new Error("CFM actor context is required for D1 access");
      const iat = Math.floor(Date.now() / 1000);
      const raw = Buffer.from(JSON.stringify({
        sub: actor.id, role: actor.role, aud: this.options.audience, iat, exp: iat + 30,
      })).toString("base64url");
      headers["x-sf-cfm-context"] = raw;
      headers["x-sf-cfm-signature"] = createHmac("sha256", this.options.contextSecret)
        .update(raw).digest("base64url");
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(new URL(path, this.options.baseUrl), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => null) as T | { error?: string } | null;
    if (response.status === 404) return undefined as T;
    if (!response.ok) {
      throw new Error(`CFM D1 ${method} ${path} failed (${response.status}): ${
        result && typeof result === "object" && "error" in result ? result.error : "request failed"
      }`);
    }
    return result as T;
  }

  private user(row: Record<string, unknown> | undefined): User | undefined {
    if (!row) return undefined;
    return {
      ...row,
      isInitialPassword: Boolean(row.isInitialPassword),
      suspended: Boolean(row.suspended),
      createdAt: new Date(String(row.createdAt)),
    } as User;
  }

  private ticket(row: Record<string, any> | undefined): Ticket | undefined {
    if (!row) return undefined;
    const asDate = (value: unknown) => value == null ? value : new Date(String(value));
    const mapChild = (child: Record<string, any>) => ({
      ...child,
      recordedAt: asDate(child.recordedAt),
      createdAt: asDate(child.createdAt),
    });
    return {
      ...row,
      finalRepairRepairedAt: asDate(row.finalRepairRepairedAt),
      closedAt: asDate(row.closedAt),
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt),
      createdByUser: this.user(row.createdByUser),
      central: this.dated(row.central),
      cable: this.dated(row.cable),
      faultType: this.dated(row.faultType),
      works: (row.works ?? []).map((work: Record<string, any>) => ({
        ...mapChild(work),
        contractor: this.dated(work.contractor),
      })),
      usedTasks: (row.usedTasks ?? []).map(mapChild),
      measurements: (row.measurements ?? []).map(mapChild),
    } as unknown as Ticket;
  }

  private async collection<T>(name: string): Promise<T[]> {
    const rows = await this.request<T[]>(`/api/cfm/master-data/${name}`);
    return rows.map((row) => this.dated(row));
  }
  private async create<T>(name: string, value: unknown): Promise<T> {
    return this.dated(await this.request<T>(`/api/cfm/master-data/${name}`, "POST", value));
  }
  private async update<T>(name: string, id: string, value: unknown): Promise<T | undefined> {
    const row = await this.request<T | undefined>(`/api/cfm/master-data/${name}/${encodeURIComponent(id)}`, "PATCH", value);
    return row ? this.dated(row) : undefined;
  }
  private async remove(name: string, id: string): Promise<void> {
    await this.request(`/api/cfm/master-data/${name}/${encodeURIComponent(id)}`, "DELETE");
  }

  async getUser(id: string): Promise<User | undefined> {
    const row = await this.request<Record<string, unknown>>(`/api/cfm/auth/users/${encodeURIComponent(id)}`);
    return this.user(row);
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const row = await this.request<Record<string, unknown>>(
      `/api/cfm/auth/users/by-username?username=${encodeURIComponent(username)}`, "GET", undefined, true,
    );
    return this.user(row);
  }
  async getAllUsers(): Promise<User[]> {
    const rows = await this.request<Record<string, unknown>[]>("/api/cfm/auth/users");
    return rows.map((row) => this.user(row)!);
  }
  async createUser(value: InsertUser): Promise<User> {
    return this.user(await this.request<Record<string, unknown>>("/api/cfm/auth/users", "POST", value))!;
  }
  async updateUser(id: string, value: Partial<InsertUser>): Promise<User | undefined> {
    return this.user(await this.request<Record<string, unknown>>(
      `/api/cfm/auth/users/${encodeURIComponent(id)}`, "PATCH", value,
    ));
  }
  async deleteUser(id: string): Promise<void> {
    await this.request(`/api/cfm/auth/users/${encodeURIComponent(id)}`, "DELETE");
  }
  async updateUserPassword(id: string, password: string): Promise<User | undefined> {
    return this.user(await this.request<Record<string, unknown>>(
      `/api/cfm/auth/users/${encodeURIComponent(id)}/password`, "PATCH", { password },
    ));
  }

  async getAllTickets(): Promise<Ticket[]> {
    const rows = await this.request<Record<string, any>[]>("/api/cfm/tickets");
    return rows.map((row) => this.ticket(row)!);
  }

  async getTicketById(id: string): Promise<Ticket | undefined> {
    const row = await this.request<Record<string, any>>(`/api/cfm/tickets/${encodeURIComponent(id)}`);
    return this.ticket(row);
  }

  getAllCentrals(): Promise<Central[]> { return this.collection("centrals"); }
  createCentral(value: InsertCentral): Promise<Central> { return this.create("centrals", value); }
  updateCentral(id: string, value: Partial<InsertCentral>): Promise<Central | undefined> { return this.update("centrals", id, value); }
  deleteCentral(id: string): Promise<void> { return this.remove("centrals", id); }

  getAllCables(): Promise<Cable[]> { return this.collection("cables"); }
  createCable(value: InsertCable): Promise<Cable> { return this.create("cables", value); }
  updateCable(id: string, value: Partial<InsertCable>): Promise<Cable | undefined> { return this.update("cables", id, value); }
  deleteCable(id: string): Promise<void> { return this.remove("cables", id); }

  getAllFaultTypes(): Promise<FaultType[]> { return this.collection("fault-types"); }
  createFaultType(value: InsertFaultType): Promise<FaultType> { return this.create("fault-types", value); }
  updateFaultType(id: string, value: Partial<InsertFaultType>): Promise<FaultType | undefined> { return this.update("fault-types", id, value); }
  deleteFaultType(id: string): Promise<void> { return this.remove("fault-types", id); }

  getAllWorkTypes(): Promise<WorkType[]> { return this.collection("work-types"); }
  createWorkType(value: InsertWorkType): Promise<WorkType> { return this.create("work-types", value); }
  updateWorkType(id: string, value: Partial<InsertWorkType>): Promise<WorkType | undefined> { return this.update("work-types", id, value); }
  deleteWorkType(id: string): Promise<void> { return this.remove("work-types", id); }

  getAllTaskTypes(): Promise<TaskType[]> { return this.collection("task-types"); }
  createTaskType(value: InsertTaskType): Promise<TaskType> { return this.create("task-types", value); }
  updateTaskType(id: string, value: Partial<InsertTaskType>): Promise<TaskType | undefined> { return this.update("task-types", id, value); }
  deleteTaskType(id: string): Promise<void> { return this.remove("task-types", id); }

  getAllContractors(): Promise<Contractor[]> { return this.collection("contractors"); }
  createContractor(value: InsertContractor): Promise<Contractor> { return this.create("contractors", value); }
  updateContractor(id: string, value: Partial<InsertContractor>): Promise<Contractor | undefined> { return this.update("contractors", id, value); }
  deleteContractor(id: string): Promise<void> { return this.remove("contractors", id); }

  getAllExcavationWorkers(): Promise<ExcavationWorker[]> { return this.collection("excavation-workers"); }
  createExcavationWorker(value: InsertExcavationWorker): Promise<ExcavationWorker> { return this.create("excavation-workers", value); }
  updateExcavationWorker(id: string, value: Partial<InsertExcavationWorker>): Promise<ExcavationWorker | undefined> { return this.update("excavation-workers", id, value); }
  deleteExcavationWorker(id: string): Promise<void> { return this.remove("excavation-workers", id); }
}
