import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } }
    );

    const userResult = await supabase.auth.getUser();
    if (userResult.error || !userResult.data.user) throw new Error("Invalid session");

    const [invoiceResult, policyResult] = await Promise.all([
      supabase.from("invoices").select("invoice_number,customer,amount,due,status,risk,po_amount,received_amount").order("created_at",{ascending:false}),
      supabase.from("policies").select("title,body,citation").order("created_at",{ascending:true}),
    ]);

    if (invoiceResult.error) throw invoiceResult.error;
    if (policyResult.error) throw policyResult.error;

    const context = {
      invoices: invoiceResult.data ?? [],
      policies: policyResult.data ?? [],
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!apiKey) {
      const match = question.match(/INV-\d+/i);
      const invoice = match ? context.invoices.find((item) => item.invoice_number.toLowerCase() === match[0].toLowerCase()) : null;
      const answer = invoice
        ? `${invoice.invoice_number} is ${invoice.risk.toLowerCase()} risk with status ${invoice.status.toLowerCase()} and an amount of ₹${Number(invoice.amount).toLocaleString("en-IN")}. The answer is based on the current invoice record; configure OPENAI_API_KEY for natural-language reasoning.`
        : "The grounded workspace data is available, but OPENAI_API_KEY is not configured for natural-language reasoning yet.";
      return new Response(JSON.stringify({ answer, mode: "deterministic" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "You are FinPilot, a finance operations copilot.",
      "Answer only from the supplied workspace context.",
      "If the context does not support a claim, say that the evidence is insufficient.",
      "Be concise and cite the relevant invoice number or policy title/citation when available.",
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
          { role: "user", content: "Workspace context:\n" + JSON.stringify(context) + "\n\nQuestion:\n" + question },
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
