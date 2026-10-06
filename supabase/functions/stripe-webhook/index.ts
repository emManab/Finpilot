import Stripe from "npm:stripe@17.7.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const body=await req.text();
    const signature=req.headers.get("stripe-signature");
    const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2024-12-18.acacia"});
    if(!signature) throw new Error("Missing Stripe signature");
    const event=stripe.webhooks.constructEvent(body,signature,Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
    const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if(event.type==="checkout.session.completed"){
      const session=event.data.object as Stripe.Checkout.Session;
      const workspaceId=session.metadata?.workspace_id;
      if(workspaceId){
        const subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
        await service.from("subscriptions").upsert({workspace_id:workspaceId,provider:"stripe",provider_customer_id:String(session.customer),provider_subscription_id:subscriptionId,status:"active",plan:"pro",updated_at:new Date().toISOString()});
        await service.from("workspaces").update({plan:"pro"}).eq("id",workspaceId);
      }
    }

    if(event.type==="customer.subscription.updated" || event.type==="customer.subscription.created" || event.type==="customer.subscription.deleted"){
      const subscription=event.data.object as Stripe.Subscription;
      const workspaceId=subscription.metadata?.workspace_id;
      if(workspaceId){
        const active=subscription.status==="active" || subscription.status==="trialing";
        await service.from("subscriptions").upsert({workspace_id:workspaceId,provider:"stripe",provider_customer_id:String(subscription.customer),provider_subscription_id:subscription.id,status:subscription.status,plan:active?"pro":"free",current_period_end:new Date(subscription.current_period_end*1000).toISOString(),updated_at:new Date().toISOString()});
        await service.from("workspaces").update({plan:active?"pro":"free"}).eq("id",workspaceId);
      }
    }

    return new Response("ok",{status:200});
  } catch(error) {
    return new Response(error instanceof Error?error.message:"Webhook error",{status:400});
  }
});
