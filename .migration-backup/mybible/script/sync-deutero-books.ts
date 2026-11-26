import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APPROVED_DEUTERO_BOOK_NAMES = [
  "طوبيا",
  "يهوديت",
  "الحكمة",
  "يشوع بن سيراخ",
  "باروخ",
  "المكابيين الأول",
  "المكابيين الثاني",
] as const;

const DEUTERO_SOURCE_INDEX =
  "https://st-takla.org/pub_Deuterocanon/Deuterocanon-Apocrypha_El-Asfar_El-Kanoneya_El-Tanya__0-index_.html";
const DATA_DIRECTORY = path.resolve(process.cwd(), "data", "deutero");

type SnapshotChapter = {
  chapter: number;
  verses: unknown[];
};

type SnapshotBook = {
  name: string;
  chapters: SnapshotChapter[];
};

type ApprovedSnapshot = {
  source: string;
  books: SnapshotBook[];
};

export function buildPerBookFiles(snapshot: ApprovedSnapshot): Map<string, string> {
  const names = snapshot.books.map((book) => book.name);
  if (JSON.stringify(names) !== JSON.stringify(APPROVED_DEUTERO_BOOK_NAMES)) {
    throw new Error("The approved snapshot must contain the seven books in their approved order.");
  }
  if (!snapshot.source?.trim()) {
    throw new Error("The approved snapshot is missing its source attribution.");
  }

  return new Map(
    snapshot.books.map((book) => {
      const contents = {
        book: book.name,
        source: snapshot.source,
        sourceUrl: DEUTERO_SOURCE_INDEX,
        chapters: book.chapters.map(({ chapter, verses }) => ({ chapter, verses })),
      };
      return [`${book.name}.json`, `${JSON.stringify(contents, null, 2)}\n`];
    }),
  );
}

async function regeneratePerBookFiles() {
  const snapshot = JSON.parse(
    await readFile(path.join(DATA_DIRECTORY, "sttakla-1877.json"), "utf8"),
  ) as ApprovedSnapshot;
  const generatedFiles = buildPerBookFiles(snapshot);

  for (const [fileName, contents] of generatedFiles) {
    await writeFile(path.join(DATA_DIRECTORY, fileName), contents, "utf8");
    console.log(`Rebuilt ${fileName}`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  regeneratePerBookFiles().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
