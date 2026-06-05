import { Router } from "express";
import { db, restaurantsTable, menuItemsTable } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";

const router = Router();

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Build system prompt with live restaurant data
async function buildSystemPrompt(language: string): Promise<string> {
  const isAr = language === "ar";

  // Fetch active restaurants from DB for context
  let restaurantContext = "";
  try {
    const restaurants = await db
      .select({ id: restaurantsTable.id, name: restaurantsTable.name, description: restaurantsTable.description, vertical: restaurantsTable.vertical })
      .from(restaurantsTable)
      .where(and(eq(restaurantsTable.is_active, true), eq(restaurantsTable.is_approved, true)))
      .limit(20);

    restaurantContext = restaurants
      .map((r) => `- ${r.name}${r.description ? ` (${r.description})` : ""} [${r.vertical}] [id:${r.id}]`)
      .join("\n");
  } catch {
    restaurantContext = "No restaurant data available.";
  }

  if (isAr) {
    return `أنت مساعد طلب طعام ذكي لتطبيق FoodHub. مهمتك مساعدة المستخدمين في:
1. اختيار الطعام والمطاعم
2. تقديم توصيات مناسبة
3. اقتراح أصناف من القائمة

المطاعم المتاحة حالياً:
${restaurantContext}

قواعد مهمة:
- رد دائماً بالعربية بأسلوب ودي وموجز
- اقترح مطاعم حقيقية من القائمة أعلاه
- لو المستخدم عاوز يطلب، قوله "اضغط على اسم المطعم عشان تشوف القائمة وتضيف للسلة"
- لو سأل عن أكل مش في القائمة، اعتذر وقترح بديل مناسب
- لا تخترع مطاعم أو أسعار وهمية`;
  }

  return `You are a smart food ordering assistant for FoodHub app. Your job is to help users:
1. Choose food and restaurants
2. Get personalized recommendations
3. Discover menu items

Currently available restaurants:
${restaurantContext}

Important rules:
- Be friendly, concise and helpful
- Only suggest restaurants from the list above
- If user wants to order, say "Tap on the restaurant name to view the menu and add items to cart"
- If asked about food not available, apologize and suggest alternatives
- Never make up restaurants or prices`;
}

// Main AI endpoint
router.post("/functions/ai-order-assistant", async (req, res) => {
  const { message, language, history = [] } = req.body as {
    message: string;
    language?: string;
    history?: Array<{ role: string; content: string }>;
  };

  const lang = language || "en";
  const isArabic = lang === "ar";
  const groqKey = process.env["GROQ_API_KEY"];

  if (groqKey) {
    try {
      const systemPrompt = await buildSystemPrompt(lang);

      // Build conversation history (last 6 messages max for context window)
      const recentHistory = history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 512,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            ...recentHistory,
            { role: "user", content: message },
          ],
        }),
      });

      if (response.ok) {
        const json = await response.json() as { choices: Array<{ message: { content: string } }> };
        const reply = json.choices[0]?.message?.content ?? "";

        // Try to detect if user wants to order a specific item and add to cart
        const cartItems = await detectAndBuildCartItems(message, lang);

        return res.json({ message: reply, cartItems });
      } else {
        const errText = await response.text();
        console.error("Groq API error:", response.status, errText);
      }
    } catch (err) {
      console.error("Groq fetch error:", err);
    }
  }

  // Heuristic fallback — when Groq key is missing
  const lower = message.toLowerCase();
  let reply: string;

  if (isArabic) {
    if (lower.includes("burger") || lower.includes("برغر")) {
      reply = "أنصحك بتجربة برغر كودو أو ماكدونالدز! اضغط على اسم المطعم لترى القائمة الكاملة وتضيف للسلة.";
    } else if (lower.includes("pizza") || lower.includes("بيتزا")) {
      reply = "بيتزا هت متاحة مع خيارات متعددة! اضغط على المطعم لترى القائمة.";
    } else if (lower.includes("chicken") || lower.includes("دجاج")) {
      reply = "البيك هو الخيار المثالي للدجاج المقرمش! اضغط عليه لترى الوجبات.";
    } else if (lower.includes("shawarma") || lower.includes("شاورما")) {
      reply = "شاورما هاوس تقدم شاورما أصيلة! اضغط على المطعم للطلب.";
    } else {
      reply = "مرحباً! أنا هنا لمساعدتك. ما الذي تشتهي اليوم؟ برغر؟ بيتزا؟ شاورما؟";
    }
  } else {
    if (lower.includes("burger")) {
      reply = "I recommend Kudu for great burgers! Tap on the restaurant to view the menu.";
    } else if (lower.includes("pizza")) {
      reply = "Pizza Hut has great options! Tap on it to see the full menu.";
    } else if (lower.includes("chicken")) {
      reply = "Al Baik is perfect for crispy chicken! Tap to order.";
    } else {
      reply = "Hello! What are you craving today? I can help you find the perfect meal!";
    }
  }

  res.json({ message: reply, cartItems: [] });
});

// Detect order intent and return real menu items from DB
async function detectAndBuildCartItems(message: string, language: string): Promise<unknown[]> {
  const lower = message.toLowerCase();
  const isAr = language === "ar";

  const orderKeywords = isAr
    ? ["اطلب", "ضيف", "عايز", "عاوز", "أريد", "اريد", "احجز", "اضيف للسله", "اضف للسله"]
    : ["order", "add to cart", "i want", "i'd like", "add", "get me"];

  const hasOrderIntent = orderKeywords.some((kw) => lower.includes(kw));
  if (!hasOrderIntent) return [];

  // Food type detection
  const foodMap: Record<string, string[]> = {
    burger:   ["burger", "برغر"],
    pizza:    ["pizza", "بيتزا"],
    chicken:  ["chicken", "دجاج", "البيك"],
    shawarma: ["shawarma", "شاورما"],
    fries:    ["fries", "بطاطس", "بطاطا"],
    salad:    ["salad", "سلطة"],
  };

  let detectedType: string | null = null;
  for (const [type, keywords] of Object.entries(foodMap)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      detectedType = type;
      break;
    }
  }

  if (!detectedType) return [];

  try {
    const items = await db
      .select({
        id: menuItemsTable.id,
        name: menuItemsTable.name,
        price: menuItemsTable.price,
        restaurant_id: menuItemsTable.restaurant_id,
        image_url: menuItemsTable.image_url,
      })
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.is_available, true),
          or(
            ilike(menuItemsTable.name, `%${detectedType}%`),
            ilike(menuItemsTable.description ?? menuItemsTable.name, `%${detectedType}%`)
          )
        )
      )
      .limit(1);

    if (items.length === 0) return [];

    // Get restaurant name
    const restaurant = await db
      .select({ name: restaurantsTable.name })
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, items[0].restaurant_id))
      .limit(1);

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: 1,
      restaurant_id: item.restaurant_id,
      restaurant_name: restaurant[0]?.name ?? "",
      image_url: item.image_url ?? "",
    }));
  } catch {
    return [];
  }
}

export default router;
