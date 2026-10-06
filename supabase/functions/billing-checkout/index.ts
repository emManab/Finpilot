import Stripe from "npm:stripe@17.7.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};

Deno.serve(async (req) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const auth=req.headers.get("Authorization");
    if(!auth) throw new Error("Authentication required");
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user) throw new Error("Invalid session");

    const {workspaceId}=await req.json();
    const {data:workspace,error:workspaceError}=await supabase.from("workspaces").select("id,name,owner_id").eq("id",workspaceId).single();
    if(workspaceError||!workspace||workspace.owner_id!==user.id) throw new Error("Only the workspace owner can start billing.");

    const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:sub}=await service.from("subscriptions").select("*").eq("workspace_id",workspaceId).maybeSingle();

    const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2024-12-18.acacia"});
    let customerId=sub?.provider_customer_id;
    if(!customerId){
      const customer=await stripe.customers.create({email:user.email,metadata:{workspace_id:workspaceId}});
      customerId=customer.id;
      await service.from("subscriptions").upsert({workspace_id:workspaceId,provider:"stripe",provider_customer_id:customerId,plan:"free",status:"inactive"});
    }

    const priceId=Deno.env.get("STRIPE_PRO_PRICE_ID");
    if(!priceId) throw new Error("STRIPE_PRO_PRICE_ID is not configured.");
    const origin=req.headers.get("origin") || Deno.env.get("APP_URL") || "";
    const session=await stripe.checkout.sessions.create({
      mode:"subscription",
      customer:customerId,
      line_items:[{price:priceId,quantity:1}],
      success_url:origin+"?billing=success",
      cancel_url:origin+"?billing=cancelled",
      metadata:{workspace_id:workspaceId},
      subscription_data:{metadata:{workspace_id:workspaceId}}
    });

    return new Response(JSON.stringify({url:session.url}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(error) {
    return new Response(JSON.stringify({error:error instanceof Error?error.message:"Billing error"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
  }
});
