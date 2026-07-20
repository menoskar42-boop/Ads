import "./polyfills";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initUserDataSync } from "./lib/user-data-sync";

// Register service worker for offline caching (push notifications handled inside sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {
      // Silent — SW is an enhancement, not required
    });
  });
}

// مزامنة بيانات المستخدم بصمت في الخلفية (لا تعطّل العرض)
try { initUserDataSync(); } catch { /* اختياري تماماً */ }

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ textAlign: "center", padding: "40px", fontFamily: "Arial, sans-serif", direction: "rtl" }}>
          <h2 style={{ color: "#8B5E3C" }}>الكتاب المقدس رفيقي</h2>
          <p>عذراً، حدث خطأ في تحميل الصفحة.</p>
          <p>يرجى تحديث الصفحة أو استخدام متصفح أحدث.</p>
          <details style={{ marginTop: "12px", fontSize: "11px", color: "#666", textAlign: "left", direction: "ltr", background: "#f5f5f5", padding: "8px", borderRadius: "4px" }}>
            <summary style={{ cursor: "pointer" }}>Error details</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{err && (err.message + "\n" + err.stack)}</pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "16px", padding: "8px 24px", background: "#8B5E3C", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px" }}
          >
            تحديث الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  }
} catch (e) {
  console.log("App initialization error:", e);
  document.body.innerHTML =
    '<div style="text-align:center;padding:40px;font-family:Arial;direction:rtl"><h2>الكتاب المقدس رفيقي</h2><p>يرجى تحديث الصفحة أو استخدام متصفح أحدث.</p></div>';
}
