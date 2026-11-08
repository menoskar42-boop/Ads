export function wfmReportWorkerCode(
  role: unknown,
  workerCode: unknown,
  technicianRole: string,
  techniciansSeeAll = false,
): string {
  if (role !== technicianRole || techniciansSeeAll) return "";
  return String(workerCode ?? "").trim() || "__none__";
}
