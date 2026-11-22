import { useSignUp } from "@clerk/expo";
import { type Href, Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Brand } from "../../components/Brand";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { safeReturnPath } from "../../lib/format";
import { colors } from "../../lib/theme";

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeReturnPath(params.returnTo);
  const { signUp, errors, fetchStatus } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const busy = fetchStatus === "fetching";
  const verifying =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  const beginSignUp = async () => {
    setMessage("");
    const { error } = await signUp.password({
      emailAddress: email.trim(),
      password,
    });
    if (error) {
      setMessage("تعذر إنشاء الحساب. راجع البريد وكلمة المرور وحاول مرة أخرى.");
      return;
    }
    if (signUp.status === "complete") {
      await finish();
      return;
    }
    if (signUp.status === "missing_requirements") {
      const unsupported = signUp.missingFields.filter((field) => field !== "email_address");
      if (unsupported.length) {
        setMessage("الحساب يحتاج بيانات إضافية؛ تواصل مع مسؤول Oscar Messaging.");
        return;
      }
      await signUp.verifications.sendEmailCode();
    }
  };

  const verifyEmail = async () => {
    setMessage("");
    await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (signUp.status === "complete") await finish();
    else setMessage("لم يتم قبول الرمز. راجعه وحاول مرة أخرى.");
  };

  const finish = async () => {
    await signUp.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setMessage("أكمل خطوة التحقق المطلوبة لحسابك.");
          return;
        }
        router.replace(returnTo as Href);
      },
    });
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Brand />
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>إنشاء حساب جديد</Text>
        <Text style={styles.copy}>أنشئ حسابًا لتبدأ محادثاتك في Oscar Messaging.</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.form}>
          {verifying ? (
            <>
              <Notice>
                <Text style={styles.copy}>أرسلنا رمز تحقق إلى بريدك. أدخله لإكمال إنشاء الحساب.</Text>
              </Notice>
              <Field label="رمز التحقق">
                <TextField
                  value={code}
                  onChangeText={setCode}
                  placeholder="أدخل الرمز"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={8}
                />
              </Field>
              {errors.fields.code?.message && <ErrorText>{errors.fields.code.message}</ErrorText>}
              <PrimaryButton title="تأكيد البريد وإنشاء الحساب" onPress={verifyEmail} busy={busy} disabled={!code} />
              <PrimaryButton title="أرسل رمزًا جديدًا" onPress={() => signUp.verifications.sendEmailCode()} secondary />
            </>
          ) : (
            <>
              <Field label="البريد الإلكتروني">
                <TextField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </Field>
              {errors.fields.emailAddress?.message && <ErrorText>{errors.fields.emailAddress.message}</ErrorText>}
              <Field label="كلمة المرور">
                <TextField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="٨ أحرف على الأقل"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </Field>
              {errors.fields.password?.message && <ErrorText>{errors.fields.password.message}</ErrorText>}
              <PrimaryButton
                title="إنشاء الحساب"
                onPress={beginSignUp}
                busy={busy}
                disabled={!email.trim() || password.length < 8}
              />
            </>
          )}
          {!!message && <ErrorText>{message}</ErrorText>}
          <View nativeID="clerk-captcha" />
          <View style={styles.signinRow}>
            <Text style={styles.copy}>لديك حساب؟ </Text>
            <Link href={{ pathname: "/sign-in", params: { returnTo } }} style={styles.link}>تسجيل الدخول</Link>
          </View>
          <Text style={styles.privacy}>ستظهر أسماء المستخدمين واسم العرض للمستخدمين المسجلين فقط. لا نرفع قائمة الهاتف أو أرقامها.</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22, maxWidth: 520, width: "100%", alignSelf: "center", gap: 22 },
  headingBlock: { gap: 8 },
  heading: { color: colors.text, fontSize: 27, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, textAlign: "right", fontSize: 15, lineHeight: 23 },
  form: { gap: 16 },
  signinRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  link: { color: colors.blue, fontWeight: "800", fontSize: 15 },
  privacy: { color: colors.muted, textAlign: "center", fontSize: 12, lineHeight: 19 },
});
