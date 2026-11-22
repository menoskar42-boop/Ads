import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { colors } from "../lib/theme";

export function TextField(props: TextInputProps) {
  const { style, ...inputProps } = props;
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.blue}
      textAlign="right"
      style={[styles.input, props.multiline && styles.multiline, style]}
      {...inputProps}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
    textAlignVertical: "center",
    writingDirection: "rtl",
  },
  multiline: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },
});
