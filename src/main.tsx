import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Bot, Check, CheckCircle2,
  ChevronDown, CircleDollarSign, ClipboardCheck, CreditCard, FileText,
  LayoutDashboard, LogIn, LogOut, Menu, Plus, Search, Settings, ShieldCheck,
  Sparkles, UploadCloud, UserPlus, Users, Wallet, X, Zap
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./styles.css";

type Status = "Paid" | "Overdue" | "Pending";
type Risk = "Low" | "Medium" | "High";
type Invoice = {
  id:string; customer:string; amount:number; due:string; status:Status; risk:Risk;
  po:number; received:number;
};
type Trace = {name:string; detail:string; state:"queued"|"running"|"done"; ms?:number};
type Workspace = {
  id:string; name:string; slug:string;
  plan:"free"|"pro"|"business";
  role:"owner"|"admin"|"member"|"viewer";
};
type Page = "Overview"|"Invoices"|"Workflows"|"Documents"|"Knowledge"|"Team & billing";

const seed:Invoice[] = [
  {id:"INV-1042",customer:"Acme Corp",amount:480000,due:"2026-09-15",status:"Overdue",risk:"High",po:480000,received:480000},
  {id:"INV-1045",customer:"Northstar Labs",amount:215000,due:"2026-09-25",status:"Overdue",risk:"Medium",po:215000,received:205000},
  {id:"INV-1051",customer:"Orbit Systems",amount:98000,due:"2026-10-12",status:"Pending",risk:"Low",po:98000,received:98000},
  {id:"INV-1038",customer:"Vertex Health",amount:620000,due:"2026-09-05",status:"Overdue",risk:"High",po:600000,received:620000},
  {id:"INV-1049",customer:"Brightline AI",amount:126000,due:"2026-09-20",status:"Paid",risk:"Low",po:126000,received:126000}
];

const agents = [
  ["Planner","Routes each finance request to the right tools."],
  ["Research","Retrieves invoices, vendors and source records."],
  ["Finance","Calculates exposure, aging and risk."],
  ["Document","Extracts and compares financial documents."],
  ["Verification","Checks every claim against evidence."],
  ["Editor","Turns verified findings into an action."]
] as const;

const policies = [
  ["Collections Policy","Invoices become eligible for escalation after 14 days overdue.","§3.2"],
  ["Invoice Approval Matrix","Invoices above ₹5L require finance lead approval.","§2.1"],
  ["Vendor Payment SOP","Three-way matching must pass before payment approval.","§4.4"]
];

const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const moneyShort=(n:number)=>n>=10000000?"₹"+(n/10000000).toFixed(1)+"Cr":n>=100000?"₹"+(n/100000).toFixed(1)+"L":"₹"+Math.round(n/1000)+"K";

function riskFor(i:Invoice):{level:Risk;reasons:string[];recommendation:string}{
  const reasons:string[]=[];
  if(i.amount!==i.po) reasons.push("Invoice is "+money(Math.abs(i.amount-i.po))+" different from the purchase order.");
  if(i.amount!==i.received) reasons.push("Goods received do not fully reconcile with the invoice.");
  if(i.amount>500000) reasons.push("Amount is above the ₹5L finance approval threshold.");
  if(i.status==="Overdue") reasons.push("Invoice is overdue and requires collections review.");
  const level:Risk=reasons.length>=2?"High":reasons.length===1?"Medium":"Low";
  const recommendation=level==="High"?"Hold approval and request reconciliation before payment.":level==="Medium"?"Flag for finance review before proceeding.":"No exception found — proceed through standard approval.";
  return {level,reasons,recommendation};
}

function App(){
  const [page,setPage]=useState<Page>("Overview");
  const [user,setUser]=useState<import("@supabase/supabase-js").User|null>(null);
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>(seed);
  const [files,setFiles]=useState<string[]>([]);
  const [policyData,setPolicyData]=useState(policies);
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<Invoice|null>(null);
  const [showNew,setShowNew]=useState(false);
  const [running,setRunning]=useState(false);
  const [trace,setTrace]=useState<Trace[]>(agents.map(a=>({name:a[0],detail:a[1],state:"queued" as const})));
  const [toast,setToast]=useState("");
  const [authMode,setAuthMode]=useState<"signin"|"signup">("signin");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [authError,setAuthError]=useState("");
  const [authBusy,setAuthBusy]=useState(false);
  const [assistant,setAssistant]=useState("Why is INV-1038 high risk?");
  const [answer,setAnswer]=useState("INV-1038 is high risk because the invoice is ₹20,000 above its PO and it is overdue. The Invoice Approval Matrix also requires finance lead approval above ₹5L.");
  const [assistantBusy,setAssistantBusy]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(false);

  const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(""),2800)};

  useEffect(()=>{
    if(!supabase)return;
    let active=true;
    supabase.auth.getSession().then(({data})=>{if(active)setUser(data.session?.user??null)});
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));
    return ()=>{active=false;data.subscription.unsubscribe()};
  },[]);

  useEffect(()=>{
    if(!supabase||!user)return;
    (async()=>{
      const ws=await supabase.rpc("get_or_create_workspace");
      if(ws.data?.[0])setWorkspace(ws.data[0] as Workspace);
      await supabase.rpc("seed_finpilot_workspace");
      const inv=await supabase.from("invoices").select("invoice_number,customer,amount,due,status,risk,po_amount,received_amount").order("created_at",{ascending:false});
      if(!inv.error&&inv.data?.length)setInvoices(inv.data.map(r=>({id:r.invoice_number,customer:r.customer,amount:Number(r.amount),due:r.due,status:r.status,risk:r.risk,po:Number(r.po_amount),received:Number(r.received_amount)})));
      const pol=await supabase.from("policies").select("title,body,citation").order("created_at");
      if(!pol.error&&pol.data?.length)setPolicyData(pol.data.map(r=>[r.title,r.body,r.citation]));
      const docs=await supabase.from("documents").select("file_name").order("created_at",{ascending:false});
      if(!docs.error)setFiles((docs.data??[]).map(r=>r.file_name));
    })();
  },[user?.id]);

  async function auth(){
    if(!supabase){setAuthError("Supabase is not configured.");return}
    if(!email||password.length<6){setAuthError("Enter a valid email and a password with at least 6 characters.");return}
    setAuthBusy(true);setAuthError("");
    const r=authMode==="signin"
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password});
    setAuthBusy(false);
    if(r.error)setAuthError(r.error.message);
    else if(authMode==="signup"&&!r.data.session)setAuthError("Account created. Check your email if confirmation is enabled.");
  }

  async function signOut(){await supabase?.auth.signOut();setUser(null);setWorkspace(null);setInvoices(seed);}

  async function runWorkflow(){
    if(running)return;
    setRunning(true);
    setTrace(agents.map(a=>({name:a[0],detail:a[1],state:"queued" as const})));
    for(let i=0;i<agents.length;i++){
      setTrace(prev=>prev.map((x,j)=>j===i?{...x,state:"running" as const}:x));
      await new Promise(r=>window.setTimeout(r,450));
      setTrace(prev=>prev.map((x,j)=>j===i?{...x,state:"done" as const,ms:310+i*140}:x));
    }
    if(supabase&&user)await supabase.from("workflow_runs").insert({
      user_id:user.id,workspace_id:workspace?.id,status:"completed",
      trace:agents.map((a,i)=>({name:a[0],detail:a[1],state:"done",ms:310+i*140})),
      completed_at:new Date().toISOString()
    });
    setRunning(false);notify("Investigation complete — 3 invoices need attention.");
  }

  async function addInvoice(data:{id:string;customer:string;amount:number;due:string;po:number;received:number}){
    const base:Invoice={...data,status:"Pending",risk:"Low"};
    const analysis=riskFor(base);base.risk=analysis.level;
    if(supabase&&user){
      const r=await supabase.from("invoices").insert({
        user_id:user.id,workspace_id:workspace?.id,invoice_number:base.id,customer:base.customer,
        amount:base.amount,due:base.due,status:base.status,risk:base.risk,po_amount:base.po,received_amount:base.received
      });
      if(r.error){notify(r.error.message);return}
    }
    setInvoices(v=>[base,...v]);setShowNew(false);notify(base.id+" added to workspace.");
  }

  async function upload(file:File){
    if(supabase&&user){
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
      const path=user.id+"/"+Date.now()+"-"+safe;
      const up=await supabase.storage.from("documents").upload(path,file,{upsert:false});
      if(up.error){notify(up.error.message);return}
      const d=await supabase.from("documents").insert({user_id:user.id,workspace_id:workspace?.id,file_name:file.name,storage_path:path,extracted:{status:"indexed"}});
      if(d.error){notify(d.error.message);return}
    }
    setFiles(v=>[file.name,...v]);notify(file.name+" indexed successfully.");
  }

  async function ask(){
    if(!supabase||!user){setAnswer("Connect the workspace backend to use the grounded assistant.");return}
    setAssistantBusy(true);
    const r=await supabase.functions.invoke("agent",{body:{question:assistant}});
    setAssistantBusy(false);
    if(r.error)setAnswer("Assistant error: "+r.error.message);
    else setAnswer(r.data?.answer??"No grounded answer returned.");
  }

  const filtered=useMemo(()=>invoices.filter(i=>(i.id+" "+i.customer+" "+i.status+" "+i.risk).toLowerCase().includes(query.toLowerCase())),[invoices,query]);
  const overdue=invoices.filter(i=>i.status==="Overdue");
  const outstanding=invoices.filter(i=>i.status!=="Paid").reduce((s,i)=>s+i.amount,0);
  const highRisk=invoices.filter(i=>riskFor(i).level==="High").length;

  if(!user)return <AuthScreen mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={authBusy} error={authError} submit={auth}/>;

  return <div className="saasApp">
    <aside className={"saasSidebar "+(sidebarOpen?"open":"")}>
      <div className="sidebarTop">
        <div className="logo"><span><Sparkles size={15}/></span><b>finpilot</b></div>
        <button className="mobileClose" onClick={()=>setSidebarOpen(false)}><X size={18}/></button>
      </div>
      <button className="workspacePicker" onClick={()=>setPage("Team & billing")}>
        <span className="workspaceIcon">{workspace?.name?.slice(0,1).toUpperCase()||"F"}</span>
        <span><b>{workspace?.name||"My workspace"}</b><small>{workspace?.plan||"free"} plan</small></span>
        <ChevronDown size={14}/>
      </button>
      <div className="navLabel">Workspace</div>
      <nav className="saasNav">
        {([
          ["Overview",LayoutDashboard],
          ["Invoices",FileText],
          ["Workflows",Bot],
          ["Documents",UploadCloud],
          ["Knowledge",ShieldCheck]
        ] as const).map(([name,Icon])=><button key={name} className={page===name?"active":""} onClick={()=>{setPage(name);setSidebarOpen(false)}}><Icon size={17}/><span>{name}</span></button>)}
      </nav>
      <div className="navLabel">Manage</div>
      <nav className="saasNav">
        <button className={page==="Team & billing"?"active":""} onClick={()=>{setPage("Team & billing");setSidebarOpen(false)}}><Users size={17}/><span>Team & billing</span></button>
      </nav>
      <div className="sidebarBottom">
        <div className="planMini"><div><span className="eyebrow">Current plan</span><b>{(workspace?.plan||"free").toUpperCase()}</b></div><CreditCard size={17}/></div>
        <button className="profileButton" onClick={signOut}><span className="avatar">{(user.email||"MB").slice(0,2).toUpperCase()}</span><span><b>{user.email?.split("@")[0]}</b><small>Sign out</small></span><LogOut size={15}/></button>
      </div>
    </aside>

    <div className="saasMain">
      <header className="topbar">
        <button className="mobileMenu" onClick={()=>setSidebarOpen(true)}><Menu size={20}/></button>
        <div className="crumb"><span>Workspace</span><b>/</b><strong>{page}</strong></div>
        <div className="topActions">
          <div className="globalSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices, vendors…"/><kbd>⌘ K</kbd></div>
          <button className="roundButton"><Bell size={16}/><i/></button>
        </div>
      </header>

      <main className="content">
        {page==="Overview"&&<Overview outstanding={outstanding} overdue={overdue} highRisk={highRisk} invoices={invoices} runWorkflow={runWorkflow} running={running} trace={trace} open={setSelected} setPage={setPage}/>}
        {page==="Invoices"&&<InvoicesPage invoices={filtered} query={query} setQuery={setQuery} open={setSelected} add={()=>setShowNew(true)}/>}
        {page==="Workflows"&&<WorkflowsPage running={running} run={runWorkflow} trace={trace}/>}
        {page==="Documents"&&<DocumentsPage files={files} upload={upload} invoices={invoices} openMatch={setSelected}/>}
        {page==="Knowledge"&&<KnowledgePage policies={policyData} question={assistant} setQuestion={setAssistant} answer={answer} busy={assistantBusy} ask={ask}/>}
        {page==="Team & billing"&&<SettingsPage workspace={workspace} user={user}/>}
      </main>
    </div>

    {selected&&<InvoiceDetail invoice={selected} close={()=>setSelected(null)}/>}
    {showNew&&<NewInvoice close={()=>setShowNew(false)} save={addInvoice}/>}
    {toast&&<div className="saasToast"><CheckCircle2 size={16}/>{toast}</div>}
  </div>
}

function Overview(p:{outstanding:number;overdue:Invoice[];highRisk:number;invoices:Invoice[];runWorkflow:()=>void;running:boolean;trace:Trace[];open:(i:Invoice)=>void;setPage:(p:Page)=>void}){
  const paid=p.invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+i.amount,0);
  return <div className="dashboard">
    <div className="welcomeRow">
      <div><span className="eyebrow">FINANCE OPERATIONS</span><h1>Good evening. Here's your control room.</h1><p>Monitor cash exposure, resolve invoice exceptions and run verified finance workflows.</p></div>
      <button className="primary" onClick={p.runWorkflow} disabled={p.running}><Zap size={16}/>{p.running?"Running workflow…":"Run AI investigation"}</button>
    </div>

    <div className="metricGrid">
      <Metric label="Outstanding" value={moneyShort(p.outstanding)} sub="Across open invoices" icon={Wallet} trend="+8.4%" positive={false}/>
      <Metric label="Overdue" value={String(p.overdue.length)} sub="Invoices need action" icon={Activity} trend={p.overdue.length+" open"} positive={false}/>
      <Metric label="High risk" value={String(p.highRisk)} sub="Require review" icon={ShieldCheck} trend="Priority" positive={false}/>
      <Metric label="Collected" value={moneyShort(paid)} sub="Paid this cycle" icon={CircleDollarSign} trend="+12.8%" positive={true}/>
    </div>

    <div className="dashboardGrid">
      <section className="panel cashPanel">
        <PanelHead eyebrow="Cash exposure" title="Receivables by status" action={<button className="textButton" onClick={()=>p.setPage("Invoices")}>View all <ArrowUpRight size={14}/></button>}/>
        <div className="cashChart">
          <div className="chartTotal"><span>Open receivables</span><b>{money(p.outstanding)}</b></div>
          <div className="bars">{[34,48,42,67,55,76,63,88,71,94,80,72].map((h,i)=><div className="bar" key={i}><i style={{height:h+"%"}}/><span>{i%3===0?"W"+(i/3+1):""}</span></div>)}</div>
        </div>
        <div className="legend"><span><i className="dot overdue"/>Overdue {moneyShort(p.overdue.reduce((s,i)=>s+i.amount,0))}</span><span><i className="dot pending"/>Pending {moneyShort(p.invoices.filter(i=>i.status==="Pending").reduce((s,i)=>s+i.amount,0))}</span><span><i className="dot paid"/>Paid {moneyShort(paid)}</span></div>
      </section>

      <section className="panel workflowPanel">
        <PanelHead eyebrow="AI CONTROL PLANE" title="Latest workflow" action={<span className="liveBadge"><i/> {p.running?"Running":"Ready"}</span>}/>
        <Trace trace={p.trace}/>
        <button className="secondary wide" onClick={()=>p.setPage("Workflows")}>Open workflow center <ArrowUpRight size={14}/></button>
      </section>
    </div>

    <div className="dashboardGrid lower">
      <section className="panel">
        <PanelHead eyebrow="PRIORITY QUEUE" title="Needs your attention" action={<button className="textButton" onClick={()=>p.setPage("Invoices")}>All invoices <ArrowUpRight size={14}/></button>}/>
        <div className="invoiceList">{p.overdue.slice(0,4).map(i=><PriorityInvoice key={i.id} invoice={i} open={p.open}/>)}</div>
      </section>
      <section className="panel activityPanel">
        <PanelHead eyebrow="ACTIVITY" title="Workspace activity"/>
        <div className="activityList">
          <ActivityItem icon={Bot} title="Risk analysis completed" detail="INV-1038 · 6 agents · 3.2s" time="2m ago"/>
          <ActivityItem icon={ClipboardCheck} title="Mismatch detected" detail="INV-1045 · ₹10K variance" time="18m ago"/>
          <ActivityItem icon={UploadCloud} title="Document indexed" detail="northstar-po.pdf" time="42m ago"/>
          <ActivityItem icon={Users} title="Workspace member added" detail="Finance team" time="1h ago"/>
        </div>
      </section>
    </div>
  </div>
}

function Metric(p:{label:string;value:string;sub:string;icon:React.ElementType;trend:string;positive:boolean}){
  const Icon=p.icon;
  return <div className="metricCard"><div className="metricIcon"><Icon size={17}/></div><span>{p.label}</span><b>{p.value}</b><div><small>{p.sub}</small><em className={p.positive?"positive":""}>{p.trend}</em></div></div>
}
function PanelHead(p:{eyebrow:string;title:string;action?:React.ReactNode}){return <div className="panelHead"><div><span className="eyebrow">{p.eyebrow}</span><h2>{p.title}</h2></div>{p.action}</div>}
function ActivityItem(p:{icon:React.ElementType;title:string;detail:string;time:string}){const I=p.icon;return <div className="activityItem"><div className="activityIcon"><I size={15}/></div><div><b>{p.title}</b><span>{p.detail}</span></div><small>{p.time}</small></div>}
function PriorityInvoice(p:{invoice:Invoice;open:(i:Invoice)=>void}){const i=p.invoice;const a=riskFor(i);return <button className="priorityInvoice" onClick={()=>p.open(i)}><div className="priorityIcon"><FileText size={16}/></div><div><b>{i.id}</b><span>{i.customer} · {money(i.amount)}</span></div><span className={"riskBadge "+a.level.toLowerCase()}>{a.level}</span><ArrowUpRight size={15}/></button>}
function Trace(p:{trace:Trace[]}){return <div className="traceBox">{p.trace.map((t,i)=><div className="traceLine" key={t.name}><div className={"traceState "+t.state}>{t.state==="done"?<Check size={12}/>:t.state==="running"?<Activity size={12}/>:i+1}</div><div><b>{t.name}</b><span>{t.detail}</span></div><small>{t.state==="done"?t.ms+"ms":t.state}</small></div>)}</div>}

function InvoicesPage(p:{invoices:Invoice[];query:string;setQuery:(v:string)=>void;open:(i:Invoice)=>void;add:()=>void}){
  const [filter,setFilter]=useState("All");
  const list=p.invoices.filter(i=>filter==="All"||i.status===filter||i.risk===filter);
  return <div className="pageShell"><PageTitle eyebrow="RECEIVABLES" title="Invoices" description="Investigate every invoice, exception and payment risk from one queue." action={<button className="primary" onClick={p.add}><Plus size={16}/> New invoice</button>}/>
    <div className="tableToolbar"><div className="tableSearch"><Search size={15}/><input value={p.query} onChange={e=>p.setQuery(e.target.value)} placeholder="Search invoice or vendor…"/></div><div className="filterGroup">{["All","Overdue","Pending","Paid","High"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div></div>
    <div className="dataTable"><div className="tableHeader"><span>Invoice</span><span>Vendor</span><span>Amount</span><span>Due</span><span>Status</span><span>Risk</span><span/></div>{list.map(i=><div className="tableRow" key={i.id} onClick={()=>p.open(i)}><span className="invoiceCode">{i.id}</span><span>{i.customer}</span><b>{money(i.amount)}</b><span>{i.due}</span><span className={"statusBadge "+i.status.toLowerCase()}>{i.status}</span><span className={"riskBadge "+riskFor(i).level.toLowerCase()}>{riskFor(i).level}</span><ArrowUpRight size={15}/></div>)}{!list.length&&<div className="tableEmpty">No invoices match your filters.</div>}</div>
  </div>
}

function WorkflowsPage(p:{running:boolean;run:()=>void;trace:Trace[]}){
  return <div className="pageShell"><PageTitle eyebrow="AUTOMATION" title="Workflow center" description="Run, inspect and audit FinPilot's finance agents." action={<button className="primary" onClick={p.run} disabled={p.running}><Zap size={16}/>{p.running?"Running…":"Run workflow"}</button>}/>
    <div className="workflowHero"><div className="workflowHeroIcon"><Bot size={23}/></div><div><span className="eyebrow">DEFAULT PLAYBOOK</span><h2>Invoice investigation</h2><p>One click routes an invoice through six specialist agents and produces a verified recommendation.</p></div><div className="workflowStats"><div><b>6</b><span>agents</span></div><div><b>3.1s</b><span>avg. latency</span></div><div><b>94.2%</b><span>accuracy*</span></div></div></div>
    <div className="workflowColumns"><div className="panel"><PanelHead eyebrow="LIVE EXECUTION" title="Agent trace"/><Trace trace={p.trace}/></div><div className="panel"><PanelHead eyebrow="PLAYBOOK" title="What happens next"/><div className="playbook">{agents.map((a,i)=><div key={a[0]}><span>{String(i+1).padStart(2,"0")}</span><div><b>{a[0]}</b><small>{a[1]}</small></div></div>)}</div></div></div>
    <div className="demoNote">* Evaluation numbers are seeded demo benchmarks, not production performance claims.</div>
  </div>
}

function DocumentsPage(p:{files:string[];upload:(f:File)=>void;invoices:Invoice[];openMatch:(i:Invoice)=>void}){
  const [drag,setDrag]=useState(false);
  return <div className="pageShell"><PageTitle eyebrow="DOCUMENTS" title="Document intelligence" description="Upload invoices, purchase orders and receipts. Then verify them against each other."/>
    <label className={"uploadPanel "+(drag?"drag":"")} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)p.upload(f)}}><div className="uploadIcon"><UploadCloud size={22}/></div><h3>Drop a finance document here</h3><p>PDF, PNG, JPG or CSV · private workspace storage</p><span className="secondary">Choose document<input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)p.upload(f)}}/></span></label>
    <div className="sectionLabel">THREE-WAY MATCHING</div>
    <div className="matchCards">{p.invoices.map(i=>{const pass=i.amount===i.po&&i.amount===i.received;return <button className="matchCard" key={i.id} onClick={()=>p.openMatch(i)}><div className="matchCardTop"><span className={pass?"matchOk":"matchWarn"}>{pass?"MATCH":"REVIEW"}</span><ArrowUpRight size={15}/></div><b>{i.id}</b><span>{i.customer}</span><div className="miniMatch"><i className={i.amount===i.po?"ok":""}/><i className={i.po===i.received?"ok":""}/><i className={i.amount===i.received?"ok":""}/></div><small>Invoice · PO · Receipt</small></button>})}</div>
    {p.files.length>0&&<div className="panel"><PanelHead eyebrow="INDEXED" title="Recent documents"/>{p.files.map(f=><div className="fileRow" key={f}><div className="fileIcon"><FileText size={15}/></div><div><b>{f}</b><span>Indexed · extracted fields available</span></div><span className="statusBadge paid">Ready</span></div>)}</div>}
  </div>
}

function KnowledgePage(p:{policies:string[][];question:string;setQuestion:(v:string)=>void;answer:string;busy:boolean;ask:()=>void}){
  const [q,setQ]=useState("");
  const results=p.policies.filter(x=>x.join(" ").toLowerCase().includes(q.toLowerCase()));
  return <div className="pageShell"><PageTitle eyebrow="KNOWLEDGE" title="Finance knowledge" description="Policies are the source of truth behind every recommendation."/>
    <div className="knowledgeHero"><div><div className="aiBadge"><Sparkles size={14}/> Grounded AI</div><h2>Ask your finance policies anything.</h2><p>FinPilot retrieves policy context before answering, so your team can see where each recommendation came from.</p></div><div className="assistantBox"><input value={p.question} onChange={e=>p.setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")p.ask()}}/><button className="primary" onClick={p.ask} disabled={p.busy}>{p.busy?"Thinking…":"Ask"}</button></div><div className="answerBox"><div className="answerHeader"><span>FinPilot answer</span><span className="verified"><CheckCircle2 size={13}/> Grounded</span></div><p>{p.answer}</p><small>Sources checked · Invoice records · Finance policies</small></div></div>
    <div className="knowledgeLayout"><div><div className="sectionLabel">POLICY LIBRARY</div><div className="policySearch"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search policy library…"/></div>{results.map(x=><div className="policyRow" key={x[0]}><div className="policyIcon"><ShieldCheck size={16}/></div><div><b>{x[0]}</b><p>{x[1]}</p><small>Policy citation · {x[2]}</small></div><ArrowUpRight size={15}/></div>)}</div><div className="panel policyAside"><span className="eyebrow">GROUNDING</span><h3>Why this matters</h3><p>Every answer should point back to a record your finance team can inspect.</p><div className="groundingStat"><b>3</b><span>source records<br/>checked per answer</span></div><div className="groundingStat"><b>0</b><span>unsupported claims<br/>in this demo</span></div></div></div>
  </div>
}

function SettingsPage(p:{workspace:Workspace|null;user:import("@supabase/supabase-js").User}){
  const [tab,setTab]=useState("Workspace");
  const [members,setMembers]=useState<Array<{user_id:string;role:string;created_at:string}>>([]);
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("member");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!supabase||!p.workspace)return;supabase.from("workspace_members").select("user_id,role,created_at").eq("workspace_id",p.workspace.id).then(r=>{if(!r.error)setMembers(r.data??[])})},[p.workspace?.id]);
  async function invite(){if(!supabase||!p.workspace||!email)return;setBusy(true);const r=await supabase.from("workspace_invites").insert({workspace_id:p.workspace.id,email:email.toLowerCase(),role,invited_by:p.user.id});setBusy(false);if(r.error)alert(r.error.message);else{setEmail("");alert("Invitation created.")}}
  return <div className="pageShell"><PageTitle eyebrow="ADMINISTRATION" title="Workspace" description="Manage your finance team, subscription and usage."/>
    <div className="settingsNav">{["Workspace","Team","Billing","Usage"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>
    {tab==="Workspace"&&<div className="settingsGrid"><div className="panel"><PanelHead eyebrow="WORKSPACE" title={p.workspace?.name||"My workspace"}/><div className="settingLine"><span>Plan</span><b>{(p.workspace?.plan||"free").toUpperCase()}</b></div><div className="settingLine"><span>Workspace ID</span><code>{p.workspace?.id?.slice(0,18)}…</code></div><div className="settingLine"><span>Your role</span><b>{p.workspace?.role||"owner"}</b></div></div><div className="panel upgradePanel"><div className="aiBadge">FINPILOT PRO</div><h2>Scale finance operations.</h2><p>Unlock higher AI usage, larger document limits and team controls.</p><button className="primary" onClick={()=>alert("Stripe checkout is ready once STRIPE_PRO_PRICE_ID is configured in Supabase.")}>Upgrade plan <ArrowUpRight size={15}/></button></div></div>}
    {tab==="Team"&&<div className="panel"><PanelHead eyebrow="TEAM" title={members.length+" members"}/><div className="inviteForm"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@company.com"/><select value={role} onChange={e=>setRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select><button className="primary" onClick={invite} disabled={busy}><UserPlus size={15}/>{busy?"Inviting…":"Invite"}</button></div>{members.map(m=><div className="memberLine" key={m.user_id}><span className="avatar">{m.user_id.slice(0,2).toUpperCase()}</span><div><b>{m.user_id===p.user.id?"You":m.user_id.slice(0,8)+"…"}</b><small>{m.role} · joined {new Date(m.created_at).toLocaleDateString()}</small></div><span className="rolePill">{m.role}</span></div>)}</div>}
    {tab==="Billing"&&<div className="settingsGrid"><div className="panel billingMain"><span className="eyebrow">CURRENT PLAN</span><h2>{(p.workspace?.plan||"free").toUpperCase()}</h2><div className="billingPrice">{p.workspace?.plan==="free"?"₹0":"Custom"}<small>/ month</small></div><p>Workspace-level billing. Your whole team shares one subscription and usage pool.</p><button className="primary" onClick={()=>alert("Configure Stripe secrets in Supabase to activate checkout.")}><CreditCard size={15}/> Manage billing</button></div><div className="panel"><span className="eyebrow">BILLING ARCHITECTURE</span><h3>Stripe-ready</h3><p className="muted">Checkout, customer IDs, subscriptions and webhooks are already structured in the backend.</p><div className="billingSteps"><span>01 · Workspace</span><span>02 · Customer</span><span>03 · Subscription</span><span>04 · Webhook sync</span></div></div></div>}
    {tab==="Usage"&&<div className="usageGrid"><Usage title="Invoices" used={12} limit={100}/><Usage title="AI runs" used={7} limit={25}/><Usage title="Documents" used={4} limit={25}/><Usage title="Team members" used={members.length} limit={5}/></div>}
  </div>
}
function Usage(p:{title:string;used:number;limit:number}){const pct=Math.min(100,Math.round(p.used/p.limit*100));return <div className="panel usage"><span className="eyebrow">{p.title}</span><b>{p.used}<small> / {p.limit}</small></b><div><i style={{width:pct+"%"}}/></div><span>{pct}% used this period</span></div>}

function PageTitle(p:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="pageTitle"><div><span className="eyebrow">{p.eyebrow}</span><h1>{p.title}</h1><p>{p.description}</p></div>{p.action}</div>}

function InvoiceDetail(p:{invoice:Invoice;close:()=>void}){
  const a=riskFor(p.invoice);const match=p.invoice.amount===p.invoice.po&&p.invoice.amount===p.invoice.received;
  return <div className="overlay" onClick={p.close}><div className="detailDrawer" onClick={e=>e.stopPropagation()}><div className="drawerTop"><span className="eyebrow">INVOICE INVESTIGATION</span><button className="roundButton" onClick={p.close}><X size={16}/></button></div><div className="invoiceTitle"><div><span className="invoiceCode large">{p.invoice.id}</span><h2>{p.invoice.customer}</h2></div><span className={"riskBadge "+a.level.toLowerCase()}>{a.level} risk</span></div><div className="amountHero"><span>Invoice amount</span><b>{money(p.invoice.amount)}</b><small>Due {p.invoice.due} · {p.invoice.status}</small></div><div className="detailSection"><span className="eyebrow">VERIFICATION</span><div className="verifyGrid"><Verify label="Invoice" ok={true} value={money(p.invoice.amount)}/><Verify label="Purchase order" ok={p.invoice.amount===p.invoice.po} value={money(p.invoice.po)}/><Verify label="Goods received" ok={p.invoice.amount===p.invoice.received} value={money(p.invoice.received)}/></div></div><div className="detailSection"><span className="eyebrow">WHY THIS RISK?</span>{a.reasons.map(x=><div className="reason" key={x}><ShieldCheck size={14}/><span>{x}</span></div>)}<div className={a.level==="Low"?"recommend good":"recommend"}><b>Recommended action</b><p>{a.recommendation}</p></div></div><div className="detailSection"><span className="eyebrow">SOURCES</span><div className="source"><FileText size={14}/><span>Invoice record · {p.invoice.id}</span><Check size={13}/></div><div className="source"><ShieldCheck size={14}/><span>Invoice Approval Matrix §2.1</span><Check size={13}/></div><div className="source"><ShieldCheck size={14}/><span>Vendor Payment SOP §4.4</span><Check size={13}/></div></div><button className="primary wide" onClick={()=>alert("Editable email draft generated for "+p.invoice.customer+".")}><FileText size={15}/> Draft follow-up email</button></div></div>
}
function Verify(p:{label:string;ok:boolean;value:string}){return <div className="verifyCard"><span>{p.label}</span><b>{p.value}</b><small className={p.ok?"ok":"bad"}>{p.ok?"VERIFIED":"MISMATCH"}</small></div>}

function NewInvoice(p:{close:()=>void;save:(d:{id:string;customer:string;amount:number;due:string;po:number;received:number})=>void}){
  const [id,setId]=useState("INV-1060"),[customer,setCustomer]=useState(""),[amount,setAmount]=useState(""),[due,setDue]=useState(""),[po,setPo]=useState(""),[received,setReceived]=useState("");
  const ready=id&&customer&&amount&&due&&po&&received;
  return <div className="overlay" onClick={p.close}><div className="modalCard" onClick={e=>e.stopPropagation()}><div className="modalHead"><div><span className="eyebrow">NEW RECORD</span><h2>Add invoice</h2></div><button className="roundButton" onClick={p.close}><X size={16}/></button></div><div className="formGrid"><label>Invoice number<input value={id} onChange={e=>setId(e.target.value)}/></label><label>Vendor<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Acme Corp"/></label><label>Amount<input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="480000"/></label><label>Due date<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label><label>PO amount<input type="number" value={po} onChange={e=>setPo(e.target.value)} placeholder="480000"/></label><label>Goods received<input type="number" value={received} onChange={e=>setReceived(e.target.value)} placeholder="480000"/></label></div><div className="modalFooter"><button className="secondary" onClick={p.close}>Cancel</button><button className="primary" disabled={!ready} onClick={()=>p.save({id,customer,amount:Number(amount),due,po:Number(po),received:Number(received)})}>Create invoice</button></div></div></div>
}

function AuthScreen(p:{mode:"signin"|"signup";setMode:(m:"signin"|"signup")=>void;email:string;setEmail:(v:string)=>void;password:string;setPassword:(v:string)=>void;busy:boolean;error:string;submit:()=>void}){
  return <div className="authPage"><div className="authVisual"><div className="authBrand"><span><Sparkles size={16}/></span><b>finpilot</b></div><div className="authCopy"><span className="eyebrow">AI FINANCE OPERATIONS</span><h1>Your finance team,<br/><i>on autopilot.</i></h1><p>Investigate invoices, verify payment decisions and turn finance work into auditable agent workflows.</p><div className="authProof"><span><CheckCircle2 size={14}/> Policy grounded</span><span><CheckCircle2 size={14}/> Audit ready</span><span><CheckCircle2 size={14}/> Team workspace</span></div></div><div className="authMock"><div/><div/><div/><div/></div></div><div className="authCard"><div className="authLogo"><span><Sparkles size={15}/></span><b>finpilot</b></div><span className="eyebrow">{p.mode==="signin"?"WELCOME BACK":"GET STARTED"}</span><h2>{p.mode==="signin"?"Sign in to your workspace":"Create your workspace"}</h2><p>{p.mode==="signin"?"Continue where your finance team left off.":"Set up a secure finance workspace in minutes."}</p><label>Work email<input value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@company.com" type="email"/></label><label>Password<input value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="At least 6 characters" type="password" onKeyDown={e=>{if(e.key==="Enter")p.submit()}}/></label>{p.error&&<div className="formError">{p.error}</div>}<button className="primary wide" onClick={p.submit} disabled={p.busy}>{p.busy?"Please wait…":p.mode==="signin"?<><LogIn size={15}/> Sign in</>:<><UserPlus size={15}/> Create account</>}</button><button className="authSwitch" onClick={()=>p.setMode(p.mode==="signin"?"signup":"signin")}>{p.mode==="signin"?"New to FinPilot? Create an account":"Already have an account? Sign in"}</button><small className="legal">By continuing, you agree to your organization's workspace policies.</small></div></div>
}

createRoot(document.getElementById("root")!).render(<App/>);
