import assert from "node:assert/strict";
import test from "node:test";
import { sortWorkOrdersForPdf } from "../client/src/lib/work-order-pdf-sort.ts";

test("PDF sorts technician names alphabetically and each technician by closing date", () => {
  const orders = [
    { techName: "محمد", closeDate: "2026-11-03T09:00:00Z", workOrderId: 4 },
    { techName: "أحمد", closeDate: "2026-11-02T09:00:00Z", workOrderId: 3 },
    { techName: "محمد", closeDate: "2026-11-01T09:00:00Z", workOrderId: 2 },
    { techName: "أحمد", closeDate: "2026-11-01T09:00:00Z", workOrderId: 1 },
  ];

  const sorted = sortWorkOrdersForPdf(orders);
  assert.deepEqual(sorted.map((row) => row.workOrderId), [1, 3, 2, 4]);
  assert.deepEqual(orders.map((row) => row.workOrderId), [4, 3, 2, 1], "does not mutate source rows");
});

test("PDF places missing technician names and invalid dates after known values", () => {
  const orders = [
    { techName: "", closeDate: "2026-11-01T09:00:00Z", workOrderId: 3 },
    { techName: "أحمد", closeDate: "invalid", workOrderId: 2 },
    { techName: "أحمد", closeDate: "2026-11-01T09:00:00Z", workOrderId: 1 },
  ];

  assert.deepEqual(
    sortWorkOrdersForPdf(orders).map((row) => row.workOrderId),
    [1, 2, 3],
  );
});
