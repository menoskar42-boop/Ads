export function buildOscarCallGreeting(userName: string, date = new Date()): string {
  const hour = date.getHours();
  const salutation = hour >= 5 && hour < 12 ? "صباح الخير" : "مساء الخير";
  const name = userName.trim() || "صاحب الحساب";
  const titledName = /^(?:مستر|mr\.?)(?:\s|$)/i.test(name) ? name : `مستر ${name}`;
  return `${salutation}، أنا مساعد ${titledName}. سعيد بالتواصل مع حضرتك. أقدر أساعد حضرتك في إيه؟`;
}
