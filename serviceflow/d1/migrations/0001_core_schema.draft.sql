-- DRAFT ONLY: generated from Drizzle declarations; not a complete Service Flow migration.
-- Runtime-only tables, maintenance schema, source DDL checks, and PostgreSQL behavior remain to be reconciled.
-- Review types/defaults/indexes/foreign keys before using. No production data or configuration is touched.
PRAGMA foreign_keys = ON;

CREATE TABLE "app_settings" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT
);

CREATE TABLE "app_state" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "box_fault_tickets" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source" TEXT NOT NULL,
  "ref_key" TEXT NOT NULL,
  "central_name" TEXT,
  "cabin_number" TEXT,
  "box_number" TEXT,
  "tech_name" TEXT,
  "responded_at" TEXT,
  "ticket_id" TEXT,
  "ticket_number" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "repair_confirm" TEXT,
  "repair_confirm_by" TEXT,
  "repair_confirm_at" TEXT,
  "repair_confirm_note" TEXT,
  "reopened_ticket_number" TEXT,
  "reopened_by" TEXT,
  "reopened_at" TEXT,
  UNIQUE ("source", "ref_key")
);

 -- primary-key mapping reviewed
CREATE TABLE "cabinet_capacity" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT,
  "exch_code" TEXT,
  "exch_name" TEXT,
  "cabin_number" TEXT,
  "cabinet_type" TEXT,
  "primary_capacity" INTEGER,
  "secondary_capacity" INTEGER,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "cabinet_tech_changes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "batch" TEXT NOT NULL,
  "central_name" TEXT NOT NULL,
  "cabin_number" TEXT NOT NULL,
  "new_tech_name" TEXT NOT NULL,
  "effective_at" TEXT NOT NULL,
  "effective_date" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "old_worker_code" TEXT,
  "new_worker_code" TEXT,
  "rows_changed" INTEGER,
  "note" TEXT,
  "applied_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("batch", "central_name", "cabin_number")
);

 -- primary-key mapping reviewed
CREATE TABLE "cabinet_tech_history" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "change_id" INTEGER,
  "central_name" TEXT NOT NULL,
  "cabin_number" TEXT NOT NULL,
  "cabin_code" TEXT,
  "old_worker_code" TEXT,
  "new_worker_code" TEXT,
  "effective_date" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("change_id") REFERENCES "cabinet_tech_changes" ("id")
);

CREATE INDEX "cabinet_tech_history_date_idx" ON "cabinet_tech_history" ("effective_date");
 -- primary-key mapping reviewed
CREATE TABLE "cabinet_technicians" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT,
  "cabin_number" TEXT,
  "worker_code" TEXT,
  "haya_karima" TEXT,
  "region_name" TEXT,
  "active" TEXT,
  "central_finish" TEXT,
  "village_code" TEXT,
  "cabin_code" TEXT,
  "idu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "cable_entries" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_local" TEXT NOT NULL,
  "phone_full" TEXT NOT NULL,
  "work_order_type" TEXT NOT NULL,
  "cable_quantity" TEXT NOT NULL,
  "created_by_id" INTEGER,
  "created_by_name" TEXT NOT NULL,
  "printed_at" TEXT,
  "edit_unlocked_at" TEXT,
  "stock_tech_name" TEXT,
  "stock_date" TEXT,
  "wo_ref" INTEGER,
  "pending_after_wo" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("phone_local", "work_order_type"),
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "case_138" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT,
  "phone_short" TEXT,
  "complain_no" TEXT,
  "score" INTEGER,
  "current_speed" TEXT,
  "max_speed" TEXT,
  "full_phone" TEXT,
  "account_no" TEXT,
  "status_code" TEXT,
  "cabinet_no" TEXT,
  "box_no" TEXT,
  "complain_type_name" TEXT,
  "complain_time" TEXT,
  "customer_name" TEXT,
  "dispatch_time" TEXT,
  "tech_code" TEXT,
  "close_date" TEXT,
  "onu" TEXT,
  "fault_type" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  "measured_by" TEXT,
  "po_status" TEXT,
  "source" TEXT,
  "measured_at" TEXT,
  "measure_mode" TEXT,
  "loop_length" TEXT,
  "hist_label" TEXT,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "complaint_details" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "msan_id" TEXT,
  "cabinet_no" TEXT,
  "complain_time" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "status_code" TEXT,
  "complain_side_name" TEXT,
  "complain_type_name" TEXT,
  "close_by" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "complaint_details_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "phone_number" TEXT,
  "msan_id" TEXT,
  "cabinet_no" TEXT,
  "complain_time" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "status_code" TEXT,
  "complain_side_name" TEXT,
  "complain_type_name" TEXT,
  "close_by" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "complaint_details_sod" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "phone_number" TEXT,
  "msan_id" TEXT,
  "cabinet_no" TEXT,
  "complain_time" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "status_code" TEXT,
  "complain_side_name" TEXT,
  "complain_type_name" TEXT,
  "close_by" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "customer_contact_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "full_phone" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "notes" TEXT,
  "contacted_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contacted_by_id" INTEGER,
  "contacted_by_name" TEXT,
  FOREIGN KEY ("contacted_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "customer_sms_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "full_phone" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "sent_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_by_id" INTEGER,
  "sent_by_name" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'sms',
  "wa_message_id" TEXT,
  FOREIGN KEY ("sent_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "dp_inventory" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central" TEXT NOT NULL,
  "mdf_code" TEXT,
  "cabinet_no" TEXT NOT NULL,
  "dp_no" TEXT NOT NULL,
  "dp_type" TEXT,
  "capacity" INTEGER,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("central", "cabinet_no", "dp_no"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "exec_followups" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "note" TEXT,
  "requested_by" TEXT,
  "source_job_id" INTEGER,
  "run_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enqueued_at" TEXT,
  "job_id" INTEGER
);

 -- primary-key mapping reviewed
CREATE TABLE "exec_jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL,
  "accounts" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requested_by" TEXT,
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TEXT,
  "done_at" TEXT,
  "result" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "batch_id" TEXT,
  "queue_order" INTEGER NOT NULL DEFAULT 0,
  "paused_at" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "site" TEXT NOT NULL DEFAULT '10.42.187.101',
  "params" TEXT,
  "retry_round" INTEGER NOT NULL DEFAULT 0,
  "retried_at" TEXT,
  "auto_restarts" INTEGER NOT NULL DEFAULT 0,
  "executed_by" TEXT,
  "requested_from" TEXT
);

 -- primary-key mapping reviewed
CREATE TABLE "ftth_orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "service_order_id" TEXT NOT NULL,
  "customer_order_id" TEXT,
  "product" TEXT,
  "service_number" TEXT,
  "customer_name" TEXT,
  "order_status" TEXT,
  "order_create_time" TEXT,
  "exchange_name" TEXT,
  "service_type" TEXT,
  "msan_code" TEXT,
  "area_code" TEXT,
  "customer_mobile" TEXT,
  "current_activity" TEXT,
  "error_name" TEXT,
  "governorate" TEXT,
  "line_type" TEXT,
  "fcc_exchange" TEXT,
  "serial_number" TEXT,
  "service_name" TEXT,
  "install_address" TEXT,
  "raw" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("service_order_id"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ftth_orders_archive" (
  "archived_year" INTEGER,
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "service_order_id" TEXT NOT NULL,
  "customer_order_id" TEXT,
  "product" TEXT,
  "service_number" TEXT,
  "customer_name" TEXT,
  "order_status" TEXT,
  "order_create_time" TEXT,
  "exchange_name" TEXT,
  "service_type" TEXT,
  "msan_code" TEXT,
  "area_code" TEXT,
  "customer_mobile" TEXT,
  "current_activity" TEXT,
  "error_name" TEXT,
  "governorate" TEXT,
  "line_type" TEXT,
  "fcc_exchange" TEXT,
  "serial_number" TEXT,
  "service_name" TEXT,
  "install_address" TEXT,
  "raw" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ftth_orders_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "service_order_id" TEXT NOT NULL,
  "customer_order_id" TEXT,
  "product" TEXT,
  "service_number" TEXT,
  "customer_name" TEXT,
  "order_status" TEXT,
  "order_create_time" TEXT,
  "exchange_name" TEXT,
  "service_type" TEXT,
  "msan_code" TEXT,
  "area_code" TEXT,
  "customer_mobile" TEXT,
  "current_activity" TEXT,
  "error_name" TEXT,
  "governorate" TEXT,
  "line_type" TEXT,
  "fcc_exchange" TEXT,
  "serial_number" TEXT,
  "service_name" TEXT,
  "install_address" TEXT,
  "raw" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ftth_orders_soy" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "service_order_id" TEXT NOT NULL,
  "customer_order_id" TEXT,
  "product" TEXT,
  "service_number" TEXT,
  "customer_name" TEXT,
  "order_status" TEXT,
  "order_create_time" TEXT,
  "exchange_name" TEXT,
  "service_type" TEXT,
  "msan_code" TEXT,
  "area_code" TEXT,
  "customer_mobile" TEXT,
  "current_activity" TEXT,
  "error_name" TEXT,
  "governorate" TEXT,
  "line_type" TEXT,
  "fcc_exchange" TEXT,
  "serial_number" TEXT,
  "service_name" TEXT,
  "install_address" TEXT,
  "raw" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ftth_subscribers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "sector" TEXT,
  "region" TEXT,
  "main_ex" TEXT,
  "sub_ex" TEXT,
  "fcc_code" TEXT,
  "type" TEXT,
  "msan_gpon_code" TEXT,
  "fbb_subs" INTEGER,
  "fv_subs" INTEGER,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "line_account_edits" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "full_phone" TEXT NOT NULL,
  "old_account_no" TEXT,
  "new_account_no" TEXT NOT NULL,
  "edited_by_id" INTEGER,
  "edited_by_name" TEXT,
  "edited_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("edited_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "line_accounts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "full_phone" TEXT NOT NULL UNIQUE,
  "account_no" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "updated_by_id" INTEGER,
  "updated_by_name" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "line_data_corrections" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_local" TEXT NOT NULL,
  "phone_full" TEXT NOT NULL,
  "central" TEXT,
  "cabin_number" TEXT,
  "box_number" TEXT,
  "dp_terminal" TEXT,
  "submitted_by_id" INTEGER,
  "submitted_by_name" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requested_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TEXT,
  "resolved_by_id" INTEGER,
  "resolved_by_name" TEXT,
  FOREIGN KEY ("submitted_by_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("resolved_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "line_deactivations" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "phone_number" TEXT,
  "work_order_type" TEXT,
  "close_reason" TEXT,
  "close_category" TEXT,
  "close_date" TEXT,
  "creation_date" TEXT,
  "tech_name" TEXT,
  "msan_code" TEXT,
  "raw_data" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("central_name", "work_order_id"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

CREATE TABLE "line_mobile_checked" (
  "full_phone" TEXT PRIMARY KEY,
  "note" TEXT,
  "checked_by_id" INTEGER,
  "checked_by_name" TEXT,
  "checked_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("checked_by_id") REFERENCES "users" ("id")
);

CREATE TABLE "line_mobiles" (
  "full_phone" TEXT PRIMARY KEY,
  "mobile" TEXT NOT NULL,
  "updated_by_id" INTEGER,
  "updated_by_name" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id")
);

CREATE TABLE "lines_no_account" (
  "full_phone" TEXT PRIMARY KEY,
  "marked_by_id" INTEGER,
  "marked_by_name" TEXT,
  "marked_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("marked_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "local_store_moves" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "kind" TEXT NOT NULL,
  "cable_type" TEXT NOT NULL,
  "qty" NUMERIC NOT NULL,
  "move_date" TEXT NOT NULL,
  "ref_no" TEXT,
  "tech_name" TEXT,
  "note" TEXT,
  "created_by_id" INTEGER,
  "created_by_name" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TEXT,
  "deleted_by_name" TEXT,
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "maintenance_orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "phone_number" TEXT NOT NULL,
  "work_order_type" TEXT,
  "stage" TEXT,
  "status" TEXT,
  "priority" TEXT,
  "current_workspec" TEXT,
  "notes" TEXT,
  "description" TEXT,
  "creation_date" TEXT,
  "mobile" TEXT,
  "customer_name" TEXT,
  "address" TEXT,
  "reference_no" TEXT,
  "exch_cabinet" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("central_name", "work_order_id"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "manual_close_by" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "tech_name" TEXT NOT NULL,
  "assigned_by_id" INTEGER,
  "assigned_by_name" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "manual_faults" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "full_phone" TEXT,
  "phone_short" TEXT,
  "account_no" TEXT,
  "central" TEXT,
  "cabin_number" TEXT,
  "box_number" TEXT,
  "msan_code" TEXT,
  "tech_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "flagged_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "flagged_by" TEXT,
  "regularized_at" TEXT,
  "regularized_by" TEXT,
  "close_code" TEXT,
  "report_source" TEXT,
  "reporter_mobile" TEXT,
  "report_note" TEXT,
  "reporter_ip" TEXT
);

 -- primary-key mapping reviewed
CREATE TABLE "msan_tech_overrides" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "cabin_code" TEXT NOT NULL UNIQUE,
  "tech_name" TEXT NOT NULL,
  "assigned_by_id" INTEGER,
  "assigned_by_name" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "notifications" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "order_id" INTEGER,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "is_read" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("order_id") REFERENCES "orders" ("id")
);

CREATE TABLE "om_order_matches" (
  "order_id" INTEGER NOT NULL UNIQUE,
  "om_serial" TEXT NOT NULL UNIQUE,
  "score" REAL,
  "confirmed_by_id" INTEGER,
  "confirmed_by_name" TEXT,
  "confirmed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undo_data" TEXT,
  FOREIGN KEY ("order_id") REFERENCES "orders" ("id"),
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users" ("id")
);

CREATE TABLE "om_responses" (
  "serial_number" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "is_feasible" INTEGER,
  "rejection_reason" TEXT,
  "central_name" TEXT,
  "cabin_number" TEXT,
  "box_number" TEXT,
  "nearest_box_distance" TEXT,
  "additional_notes" TEXT,
  "tech_id" INTEGER,
  "tech_name" TEXT,
  "responded_at" TEXT,
  "external_id" INTEGER,
  "external_name" TEXT,
  "is_feasible_external" INTEGER,
  "external_rejection_reason" TEXT,
  "external_response_at" TEXT,
  "box_working_at_response" INTEGER,
  "box_working_key" TEXT,
  "box_working_recorded_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "customer_address" TEXT NOT NULL,
  "national_id" TEXT,
  "serial_number" TEXT,
  "sales_id" INTEGER NOT NULL,
  "sales_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "is_feasible" INTEGER,
  "rejection_reason" TEXT,
  "cabin_number" TEXT,
  "box_number" TEXT,
  "nearest_box_distance" TEXT,
  "additional_notes" TEXT,
  "central_name" TEXT,
  "tech_id" INTEGER,
  "tech_name" TEXT,
  "tech_response_at" TEXT,
  "assigned_tech_id" INTEGER,
  "assigned_tech_name" TEXT,
  "external_id" INTEGER,
  "external_name" TEXT,
  "external_response_at" TEXT,
  "is_feasible_external" INTEGER,
  "external_rejection_reason" TEXT,
  "external_cabin_number" TEXT,
  "external_box_number" TEXT,
  "external_nearest_box_distance" TEXT,
  "external_additional_notes" TEXT,
  "external_central_name" TEXT,
  "contract_status" TEXT NOT NULL DEFAULT 'لم يتم التعاقد',
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sales_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("tech_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("assigned_tech_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("external_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "oss_reexecs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "key_value" TEXT NOT NULL,
  "search_by" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "message" TEXT,
  "requested_by" TEXT,
  "reported_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "phone_line_edits" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_line_id" INTEGER NOT NULL,
  "full_phone" TEXT NOT NULL,
  "central" TEXT NOT NULL,
  "old_cabin_number" TEXT,
  "new_cabin_number" TEXT,
  "old_box_number" TEXT,
  "new_box_number" TEXT,
  "old_dp_terminal" TEXT,
  "new_dp_terminal" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "edited_by_id" INTEGER NOT NULL,
  "edited_by_name" TEXT NOT NULL,
  "edited_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_by_id" INTEGER,
  "confirmed_by_name" TEXT,
  "confirmed_at" TEXT,
  "rolled_back_by_id" INTEGER,
  "rolled_back_by_name" TEXT,
  "rolled_back_at" TEXT,
  FOREIGN KEY ("phone_line_id") REFERENCES "phone_lines" ("id"),
  FOREIGN KEY ("edited_by_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("rolled_back_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "phone_lines" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "tel_no" TEXT NOT NULL,
  "central" TEXT NOT NULL,
  "idu_no" TEXT,
  "odu_no" TEXT,
  "cabin_number" TEXT,
  "primary_block_no" TEXT,
  "cabinet_in" TEXT,
  "sec_block_no" TEXT,
  "cabinet_out" TEXT,
  "box_number" TEXT,
  "dp_terminal" TEXT,
  "port" TEXT,
  "len" TEXT,
  "fiber_block" TEXT,
  "fiber_out" TEXT,
  "tel_num_txt" TEXT,
  "full_phone" TEXT NOT NULL UNIQUE,
  "raw_data" TEXT
);

 -- primary-key mapping reviewed
CREATE TABLE "phone_ports" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_number" TEXT NOT NULL UNIQUE,
  "area_code" TEXT,
  "msan_code" TEXT,
  "frame" TEXT,
  "row_no" TEXT,
  "column_no" TEXT,
  "shelf" TEXT,
  "slot" TEXT,
  "port_number" TEXT,
  "port_type" TEXT,
  "voice_status" TEXT,
  "data_status" TEXT,
  "operator" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "regularized_daily" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "snapshot_date" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "item_key" TEXT NOT NULL,
  "central_name" TEXT,
  "data" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("category", "item_key")
);

 -- primary-key mapping reviewed
CREATE TABLE "remaining_complaints" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "phone_number" TEXT,
  "complain_time" TEXT,
  "dispatch_time" TEXT,
  "dispatch_user" TEXT,
  "msan_id" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "close_by" TEXT,
  "status_code" TEXT,
  "cabinet_no" TEXT,
  "complain_type" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "remaining_complaints_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "phone_number" TEXT,
  "complain_time" TEXT,
  "dispatch_time" TEXT,
  "dispatch_user" TEXT,
  "msan_id" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "close_by" TEXT,
  "status_code" TEXT,
  "cabinet_no" TEXT,
  "complain_type" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "remaining_complaints_sod" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "complain_no" TEXT NOT NULL UNIQUE,
  "sector" TEXT,
  "region" TEXT,
  "exchange_name" TEXT,
  "phone_number" TEXT,
  "complain_time" TEXT,
  "dispatch_time" TEXT,
  "dispatch_user" TEXT,
  "msan_id" TEXT,
  "close_time" TEXT,
  "close_code" TEXT,
  "close_by" TEXT,
  "status_code" TEXT,
  "cabinet_no" TEXT,
  "complain_type" TEXT,
  "time_till_now" REAL,
  "time_till_now_full" REAL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "removed_phone_ports" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_number" TEXT NOT NULL UNIQUE,
  "area_code" TEXT,
  "msan_code" TEXT,
  "frame" TEXT,
  "shelf" TEXT,
  "slot" TEXT,
  "port_number" TEXT,
  "port_type" TEXT,
  "voice_status" TEXT,
  "data_status" TEXT,
  "operator" TEXT,
  "onu" TEXT,
  "row_no" TEXT,
  "column_no" TEXT,
  "last_uploaded_at" TEXT,
  "removed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_source" TEXT
);

 -- primary-key mapping reviewed
CREATE TABLE "repeat_review_comments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "review_id" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "created_by" TEXT,
  "created_by_id" INTEGER,
  "notified_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("review_id") REFERENCES "repeat_reviews" ("id"),
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "repeat_reviews" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_short" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "line_status" TEXT,
  "line_central" TEXT,
  "line_cabin" TEXT,
  "line_box" TEXT,
  "line_terminal" TEXT,
  "line_correction_id" INTEGER,
  "line_before_central" TEXT,
  "line_before_cabin" TEXT,
  "line_before_box" TEXT,
  "line_before_terminal" TEXT,
  "line_checked_by" TEXT,
  "line_checked_at" TEXT,
  "inspection_id" INTEGER,
  "inspection_date" TEXT,
  "inspection_by" TEXT,
  "inspection_bad_items" INTEGER,
  "inspection_linked_by" TEXT,
  "inspection_linked_at" TEXT,
  "customer_statement" TEXT,
  "tech_statement" TEXT,
  "statements_by" TEXT,
  "statements_at" TEXT,
  "cause" TEXT,
  "has_fault" INTEGER,
  "at_fault_name" TEXT,
  "at_fault_kind" TEXT,
  "at_faults" TEXT,
  "at_fault_edited_by" TEXT,
  "at_fault_edited_at" TEXT,
  "assessed_by" TEXT,
  "assessed_at" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_by" TEXT,
  "completed_at" TEXT,
  UNIQUE ("phone_short", "month")
);

CREATE TABLE "sf_session" (
  "sid" TEXT PRIMARY KEY,
  "sess" TEXT NOT NULL,
  "expire" TEXT NOT NULL
);

CREATE INDEX "IDX_sf_session_expire" ON "sf_session" ("expire");
 -- primary-key mapping reviewed
CREATE TABLE "shift_schedules" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "week_start" TEXT NOT NULL,
  "tech_name" TEXT NOT NULL,
  "days" TEXT NOT NULL DEFAULT '[]',
  "covers" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,
  UNIQUE ("week_start", "tech_name")
);

 -- primary-key mapping reviewed
CREATE TABLE "tech_coverage_grants" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "grantee_tech_name" TEXT NOT NULL,
  "covered_tech_name" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,
  UNIQUE ("grantee_tech_name", "covered_tech_name")
);

 -- primary-key mapping reviewed
CREATE TABLE "technician_names" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "worker_code" TEXT NOT NULL,
  "tech_name" TEXT NOT NULL,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_dsl_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_dsl_sod" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("ticket_id", "status_code"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_ftth" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("ticket_id", "status_code"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_ftth_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_ftth_sod" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT,
  "central_name" TEXT,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("ticket_id", "status_code"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "ticket_queue" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ticket_id" TEXT NOT NULL,
  "central_code" TEXT NOT NULL,
  "central_name" TEXT NOT NULL,
  "phone_number" TEXT,
  "complaint_time" TEXT,
  "tech_code" TEXT,
  "line_type_code" TEXT,
  "cabinet_no" TEXT,
  "priority_code" TEXT,
  "close_date" TEXT,
  "operation_type" TEXT,
  "complain_type_name" TEXT,
  "status_code" TEXT,
  "onu" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("ticket_id", "status_code"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "worker_code" TEXT,
  "full_name" TEXT,
  "password_plain" TEXT,
  "cfm_user_id" TEXT,
  "mobile" TEXT,
  "suspended" INTEGER NOT NULL DEFAULT 0,
  "can_upload_files" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "wfm_current" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "phone_number" TEXT NOT NULL,
  "work_order_type" TEXT,
  "stage" TEXT,
  "status" TEXT,
  "priority" TEXT,
  "current_workspec" TEXT,
  "notes" TEXT,
  "description" TEXT,
  "creation_date" TEXT,
  "mobile" TEXT,
  "customer_name" TEXT,
  "address" TEXT,
  "reference_no" TEXT,
  "exch_cabinet" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "wfm_customer_mobiles" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_number" TEXT NOT NULL,
  "mobile" TEXT,
  "alt_mobile" TEXT,
  "work_order_id" TEXT,
  "result" TEXT NOT NULL,
  "message" TEXT,
  "requested_by" TEXT,
  "reported_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "wfm_sod" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "phone_number" TEXT NOT NULL,
  "work_order_type" TEXT,
  "stage" TEXT,
  "status" TEXT,
  "priority" TEXT,
  "current_workspec" TEXT,
  "notes" TEXT,
  "description" TEXT,
  "creation_date" TEXT,
  "mobile" TEXT,
  "customer_name" TEXT,
  "address" TEXT,
  "reference_no" TEXT,
  "exch_cabinet" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("central_name", "work_order_id"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "wfm_task_accepts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_number" TEXT NOT NULL,
  "work_order_id" TEXT,
  "work_id" TEXT,
  "result" TEXT NOT NULL,
  "message" TEXT,
  "requested_by" TEXT,
  "reported_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "wfm_task_cancels" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "phone_number" TEXT NOT NULL,
  "work_order_id" TEXT,
  "assignment_status" TEXT,
  "requested_by" TEXT,
  "canceled_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

 -- primary-key mapping reviewed
CREATE TABLE "work_order_tech_overrides" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "tech_name" TEXT NOT NULL,
  "updated_by_id" INTEGER,
  "updated_by_name" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("central_name", "work_order_id"),
  FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id")
);

 -- primary-key mapping reviewed
CREATE TABLE "work_orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "central_name" TEXT NOT NULL,
  "work_order_id" INTEGER NOT NULL,
  "phone_number" TEXT NOT NULL,
  "service_type" TEXT NOT NULL,
  "close_date" TEXT NOT NULL,
  "item_name" TEXT,
  "cable_quantity" TEXT,
  "tech_name" TEXT NOT NULL,
  "close_category" TEXT,
  "creation_date" TEXT,
  "msan_code" TEXT,
  "work_order_type_raw" TEXT,
  "worker_code" TEXT,
  "raw_data" TEXT,
  "uploaded_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_id" INTEGER,
  UNIQUE ("central_name", "work_order_id"),
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id")
);
