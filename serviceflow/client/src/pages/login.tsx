import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Command } from "lucide-react";
import { useLocation } from "wouter";
import { ROLES } from "@shared/schema";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // «فاكرنى» (٢٠٢٦-١١-١٧): الجلسة ٣٠ يوم بدل أسبوع — لجهاز التنفيذ مثلاً، عشان الريفريش وقفل التاب مايطلبوش دخول
  const [remember, setRemember] = useState(false);
  // جهاز التنفيذ كان شغّال على المتصفح ده والجلسة انتهت ⇒ نقول كده بدل ما يقف من غير رسالة.
  // بعد الدخول بيرجع يشتغل لوحده (العلامة sf_exec_active لسه فى localStorage).
  const executorWasOn = (() => { try { return localStorage.getItem("sf_exec_active") === "1"; } catch { return false; } })();
  const { login, isLoggingIn, user } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    // فنى الصيانة يدخل مباشرة على برنامج الصيانة (تنقّل صفحة كاملة لتفعيل SSO السيرفر).
    if ((user as any)?.role === ROLES.MAINTENANCE_TECH) {
      window.location.href = "/maintenance";
      return null;
    }
    setLocation("/");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ username, password, remember });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Command className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-gray-900">نظام إدارة الطلبات</h1>
          <p className="text-muted-foreground mt-2">يرجى تسجيل الدخول للمتابعة</p>
        </div>

        <Card className="border-0 shadow-xl ring-1 ring-black/5">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1 text-right">
              <CardTitle className="text-xl">تسجيل الدخول</CardTitle>
              <CardDescription>أدخل بيانات الحساب الخاص بك</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-right">
              {executorWasOn && (
                <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  ⚠️ جهاز التنفيذ كان شغّال على المتصفح ده والجلسة انتهت — سجّل دخول وهيرجع يشتغل لوحده.
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="text-right"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-right"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
                فاكرنى على الجهاز ده (٣٠ يوم)
              </label>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full h-11 text-base" disabled={isLoggingIn}>
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                دخول
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <p className="mt-8 text-center text-sm text-muted-foreground">
          &copy; 2024 جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
