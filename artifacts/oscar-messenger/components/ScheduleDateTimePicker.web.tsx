export type SchedulePickerMode = "date" | "time";

export function ScheduleDateTimePicker({
  mode,
  value,
  onChange,
}: {
  mode: SchedulePickerMode;
  value: Date;
  onChange: (event: { type: string }, date?: Date) => void;
}) {
  void mode;
  void value;
  void onChange;
  return null;
}
