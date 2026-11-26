const MAIN_ENTRY_NAMES = new Set(["index", "index-legacy"]);

export const MAIN_BUNDLE_BUDGET_BYTES = 1024 * 1024;

type ClientOutputFile = {
  type: string;
  name?: string;
  isEntry?: boolean;
  code?: string;
};

export function mainBundleBudgetError(
  bundle: Record<string, ClientOutputFile>,
  maxBytes = MAIN_BUNDLE_BUDGET_BYTES,
): string | null {
  const mainEntries = Object.values(bundle).filter(
    (file) =>
      file.type === "chunk" &&
      file.isEntry &&
      file.name &&
      MAIN_ENTRY_NAMES.has(file.name),
  );

  if (mainEntries.length === 0) {
    return "The client build did not emit its expected main entry chunk.";
  }

  const oversized = mainEntries.find(
    (file) => Buffer.byteLength(file.code ?? "", "utf8") > maxBytes,
  );
  if (!oversized) return null;

  const sizeBytes = Buffer.byteLength(oversized.code ?? "", "utf8");
  return `Main client bundle ${oversized.name} is ${sizeBytes} bytes; the limit is ${maxBytes} bytes.`;
}
