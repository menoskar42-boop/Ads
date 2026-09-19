import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { BASE, withBase } from "./lib/base-path";

// ⚠️ لازم قبل أى نداء: التطبيق فيه ٢٤٤ نداء مكتوب فيهم "/api/..." بمسار مطلق،
// وتعديلهم واحد واحد مخاطرة بلا داعى. اللفّة دى بتحطّ مسار الجذر على أى مسار
// مطلق مرة واحدة، فالنداءات تفضل زى ما هى فى الكود.
if (BASE) {
  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: any, init?: any) => {
    if (typeof input === "string") return origFetch(withBase(input), init);
    // Request له خصائص كتير (method/headers/body/credentials…) — إعادة بنائه
    // بتضيّع حاجة منها، فبنسيبه زى ما هو. الكود كله بيبعت نص.
    return origFetch(input, init);
  }) as typeof window.fetch;
}

createRoot(document.getElementById("root")!).render(<App />);
