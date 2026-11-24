import { Platform } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

export type SchedulePickerMode = "date" | "time";

export function ScheduleDateTimePicker({
  mode,
  value,
  onChange,
}: {
  mode: SchedulePickerMode;
  value: Date;
  onChange: (event: Pick<DateTimePickerEvent, "type">, date?: Date) => void;
}) {
  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="default"
        is24Hour={false}
        onChange={onChange}
      />
    );
  }

  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display="spinner"
      themeVariant="dark"
      onChange={onChange}
    />
  );
}
