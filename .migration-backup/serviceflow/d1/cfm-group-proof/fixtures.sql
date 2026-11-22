INSERT INTO cfm_users (id, username, password, name, role, suspended)
VALUES ('u-synthetic', 'cfm-proof', 'not-a-real-password', 'Synthetic CFM User', 'admin', 0);
INSERT INTO centrals (id, name, code) VALUES ('central-a', 'سنترال تجريبي', 'C-001');
INSERT INTO cables (id, central_id, number, cable_number, type)
VALUES ('cable-a', 'central-a', 'CAB-01', '1/1', 'fiber');
INSERT INTO fault_types (id, name, category) VALUES ('fault-a', 'Synthetic fault', 'cable');
INSERT INTO work_types (id, name, associated_materials)
VALUES ('work-type-a', 'Synthetic work', '[{"taskTypeId":"task-type-a","defaultQuantity":2}]');
INSERT INTO task_types (id, name) VALUES ('task-type-a', 'Synthetic task');
INSERT INTO contractors (id, name) VALUES ('contractor-a', 'Synthetic contractor');
INSERT INTO excavation_workers (id, name, national_id) VALUES ('worker-a', 'Synthetic worker', 'SYNTHETIC-001');
INSERT INTO tickets (id, ticket_number, central_department, central_id, cable_id, cabinet, box, fault_type_id, status, created_by)
VALUES ('ticket-a', 'TKT-2026-001', 'سنترال تجريبي', 'central-a', 'cable-a', '1/1', '7', 'fault-a', 'open', 'u-synthetic');
INSERT INTO measurement_entries (id, ticket_id, reading, created_by)
VALUES ('measurement-a', 'ticket-a', 'synthetic reading', 'u-synthetic');
INSERT INTO work_entries (id, ticket_id, measurement_id, items, performed_by, contractor_id, created_by)
VALUES ('work-a', 'ticket-a', 'measurement-a', '[{"id":"item-a","workTypeId":"work-type-a","quantity":1}]', 'Synthetic technician', 'contractor-a', 'u-synthetic');
INSERT INTO used_task_entries (id, ticket_id, measurement_id, items, performed_by, created_by)
VALUES ('used-task-a', 'ticket-a', 'measurement-a', '[{"id":"item-b","taskTypeId":"task-type-a","quantity":2}]', 'Synthetic technician', 'u-synthetic');
INSERT INTO inventory_transactions (id, type, task_type_id, quantity, date, ticket_id)
VALUES ('inventory-a', 'outgoing', 'task-type-a', 2, '2026-10-18T00:00:00.000Z', 'ticket-a');
INSERT INTO box_fault_tickets (source, ref_key, central_name, cabin_number, box_number, ticket_id, ticket_number)
VALUES ('OM', 'synthetic-ref', 'سنترال تجريبي', '1/1', '7', 'ticket-a', 'TKT-2026-001');
