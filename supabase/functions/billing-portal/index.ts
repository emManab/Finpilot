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

    const {data:workspace}=await supabase.from("workspaces").select("id,owner_id").eq("id",workspaceId).single();
    if(!workspace || workspace.owner_id!==user.id) throw new Error("Only the workspace owner can manage billing.");

    const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:sub}=await service.from("subscriptions").select("provider_customer_id").eq("workspace_id",workspaceId).single();
    if(!sub?.provider_customer_id) throw new Error("No Stripe customer exists for this workspace.");

    const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2024-12-18.acacia"});
    const origin=req.headers.get("origin") || Deno.env.get("APP_URL") || "";
    const session=await stripe.billingPortal.sessions.create({customer:sub.provider_customer_id,return_url:origin});
    return new Response(JSON.stringify({url:session.url}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(error) {
    return new Response(JSON.stringify({error:error instanceof Error?error.message:"Billing error"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
  }
});
