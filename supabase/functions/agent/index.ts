const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { question, context } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!apiKey) {
      return new Response(JSON.stringify({
        answer: "AI is not configured yet. FinPilot can still use its deterministic policy engine. Add OPENAI_API_KEY to this Edge Function to enable grounded LLM answers.",
        mode: "fallback",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "You are FinPilot, a finance operations copilot.",
      "Answer only from the supplied workspace context.",
      "If the context does not support a claim, say that the evidence is insufficient.",
      "Be concise and cite the relevant invoice or policy title/citation when available.",
      "Never invent financial records, approvals, dates, or policy rules.",
    ].join(" ");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Workspace context:\n" + JSON.stringify(context ?? {}) + "\n\nQuestion:\n" + question },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI request failed");

    return new Response(JSON.stringify({
      answer: payload.choices?.[0]?.message?.content || "No answer returned.",
      mode: "llm",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Agent request failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
