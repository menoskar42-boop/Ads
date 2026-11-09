type WorkOrderSortFields = {
  techName?: string | null;
  closeDate?: string | null;
  workOrderId?: number | null;
};

const technicianCollator = new Intl.Collator("ar", {
  sensitivity: "base",
  numeric: true,
});

/** PDF ordering: Arabic technician name, then oldest closing date first. */
export function sortWorkOrdersForPdf<T extends WorkOrderSortFields>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const techA = String(a.techName ?? "").trim();
    const techB = String(b.techName ?? "").trim();
    if (!techA && techB) return 1;
    if (techA && !techB) return -1;

    const byTech = technicianCollator.compare(techA, techB);
    if (byTech !== 0) return byTech;

    const dateA = a.closeDate ? Date.parse(a.closeDate) : Number.NaN;
    const dateB = b.closeDate ? Date.parse(b.closeDate) : Number.NaN;
    const hasDateA = Number.isFinite(dateA);
    const hasDateB = Number.isFinite(dateB);
    if (hasDateA && !hasDateB) return -1;
    if (!hasDateA && hasDateB) return 1;
    if (hasDateA && hasDateB && dateA !== dateB) return dateA - dateB;

    return Number(a.workOrderId ?? 0) - Number(b.workOrderId ?? 0);
  });
}
