import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, language = "en", history = [] } = await req.json();
    if (!message || typeof message !== "string" || message.length > 1000) {
      return new Response(JSON.stringify({ message: "Invalid message", cartItems: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all available menu items with restaurant info
    const { data: menuItems } = await supabase
      .from("menu_items")
      .select("id, name, description, price, image_url, restaurant_id, is_available, restaurants(id, name, rating, is_approved, is_active, delivery_time_min, delivery_fee)")
      .eq("is_available", true);

    const menuContext = (menuItems || [])
      .filter((item: any) => item.restaurants?.is_approved && item.restaurants?.is_active)
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        image_url: item.image_url,
        restaurant_id: item.restaurant_id,
        restaurant_name: item.restaurants?.name,
        restaurant_rating: item.restaurants?.rating,
        delivery_time_min: item.restaurants?.delivery_time_min,
        delivery_fee: item.restaurants?.delivery_fee,
      }));

    const isAr = language === "ar";
    const systemPrompt = `You are a friendly food ordering assistant for FoodHub. ${isAr ? "ALWAYS respond in Arabic (العربية)." : "Always respond in English."}

Your job:
1. Understand what food/drinks/groceries the user wants from natural language (in any language).
2. Match items to the available menu (fuzzy matching across English/Arabic names is fine).
3. Detect quantities (e.g. "2 burgers", "ثلاث بيتزا").
4. When multiple restaurants offer the same item, prefer the one with: highest rating, then fastest delivery time, then lowest delivery fee.
5. Try to keep all items from the SAME restaurant when possible (single-restaurant cart is best UX).
6. If the user asks for something not on the menu, politely say so and suggest similar available items.
7. If the user is just chatting or asking questions (not ordering), reply helpfully WITHOUT calling the tool.
8. Always be concise and warm.

Available menu items (JSON):
${JSON.stringify(menuContext, null, 2)}

You MUST use the add_to_cart tool whenever you identify concrete food items the user wants to order. Include a friendly confirmation message alongside the tool call.`;

    // Build conversation: system + prior history (trim to last 8) + current user message
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-8).filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      : [];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedHistory.map((m: any) => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "add_to_cart",
              description: "Add food items to the customer's cart. Always include all required fields per item.",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Menu item ID from the list above" },
                        name: { type: "string" },
                        price: { type: "number" },
                        quantity: { type: "number", minimum: 1 },
                        restaurant_id: { type: "string" },
                        restaurant_name: { type: "string" },
                        image_url: { type: "string" },
                      },
                      required: ["id", "name", "price", "quantity", "restaurant_id", "restaurant_name"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ message: isAr ? "أنا مشغول قليلاً الآن، حاول بعد لحظات." : "I'm a bit busy right now. Please try again in a moment.", cartItems: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ message: isAr ? "نفدت أرصدة المساعد الذكي. يرجى التواصل مع الإدارة." : "AI credits exhausted. Please contact admin.", cartItems: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    let assistantMessage = choice?.message?.content || "";
    let cartItems: any[] = [];

    if (choice?.message?.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function?.name === "add_to_cart") {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            cartItems = args.items || [];
          } catch (e) {
            console.error("Failed to parse tool call args:", e);
          }
        }
      }

      if (!assistantMessage && cartItems.length > 0) {
        const itemList = cartItems.map((i: any) => `${i.quantity}× ${i.name}`).join("، ");
        const total = cartItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
        assistantMessage = isAr
          ? `تمام! أضفت ${itemList} من ${cartItems[0].restaurant_name}. الإجمالي: ${total.toFixed(2)} 🛒`
          : `Done! Added ${itemList} from ${cartItems[0].restaurant_name}. Total: $${total.toFixed(2)} 🛒`;
      }
    }

    if (!assistantMessage && cartItems.length === 0) {
      assistantMessage = isAr
        ? "لم أجد أصنافاً مطابقة. هل يمكنك وصف ما تريد بطريقة أخرى؟"
        : "I couldn't find matching items. Could you describe what you'd like differently?";
    }

    return new Response(JSON.stringify({ message: assistantMessage, cartItems }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ message: "Sorry, something went wrong. Please try again.", cartItems: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
