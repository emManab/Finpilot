import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowUpRight, Bot, Check, CheckCircle2, CircleDollarSign, ClipboardCheck, FileText, LayoutDashboard, Mail, Menu, Plus, Search, ShieldCheck, Sparkles, UploadCloud, X, Zap } from "lucide-react";
import "./styles.css";

type Status = "Paid" | "Overdue" | "Pending";
type Risk = "Low" | "Medium" | "High";
type Invoice = { id:string; customer:string; amount:number; due:string; status:Status; risk:Risk; po:number; received:number };
type Trace = { name:string; detail:string; state:"queued"|"running"|"done"; ms?:number };

const seed:Invoice[] = [
  {id:"INV-1042",customer:"Acme Corp",amount:480000,due:"2026-09-15",status:"Overdue",risk:"High",po:480000,received:480000},
  {id:"INV-1045",customer:"Northstar Labs",amount:215000,due:"2026-09-25",status:"Overdue",risk:"Medium",po:215000,received:205000},
  {id:"INV-1051",customer:"Orbit Systems",amount:98000,due:"2026-10-12",status:"Pending",risk:"Low",po:98000,received:98000},
  {id:"INV-1038",customer:"Vertex Health",amount:620000,due:"2026-09-05",status:"Overdue",risk:"High",po:600000,received:620000},
  {id:"INV-1049",customer:"Brightline AI",amount:126000,due:"2026-09-20",status:"Paid",risk:"Low",po:126000,received:126000}
];

const agentDefs = [
  ["Planner","Routes the request to specialist agents"],
  ["Research Agent","Retrieves invoices, customers and source records"],
  ["Finance Agent","Calculates aging, exposure and risk"],
  ["Document Agent","Extracts invoice and PO fields"],
  ["Verification Agent","Checks claims against source evidence"],
  ["Editor Agent","Produces the final report and action"]
] as const;

const policies = [
  ["Collections Policy","Invoices become eligible for escalation after 14 days overdue.","§3.2"],
  ["Invoice Approval Matrix","Invoices above ₹5L require finance lead approval.","§2.1"],
  ["Vendor Payment SOP","Three-way matching must pass before payment approval.","§4.4"]
];

const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);

function App(){
  const [section,setSection] = useState("Dashboard");
  const [invoices,setInvoices] = useState<Invoice[]>(seed);
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<Invoice|null>(null);
  const [running,setRunning] = useState(false);
  const [trace,setTrace] = useState<Trace[]>(agentDefs.map(function(a){return {name:a[0],detail:a[1],state:"queued"}}));
  const [toast,setToast] = useState("");
  const [mail,setMail] = useState(false);
  const [policyQuery,setPolicyQuery] = useState("");
  const [files,setFiles] = useState<string[]>([]);
  const [match,setMatch] = useState<Invoice|null>(null);

  const filtered = useMemo(function(){ return invoices.filter(function(i){ return (i.id+" "+i.customer+" "+i.status).toLowerCase().includes(query.toLowerCase()); }); },[invoices,query]);
  const policyResults = useMemo(function(){ return policies.filter(function(p){ return p.join(" ").toLowerCase().includes(policyQuery.toLowerCase()); }); },[policyQuery]);
  const overdue = invoices.filter(function(i){return i.status==="Overdue"});
  const outstanding = invoices.filter(function(i){return i.status!=="Paid"}).reduce(function(s,i){return s+i.amount},0);

  function notify(text:string){ setToast(text); window.setTimeout(function(){setToast("")},2600); }
  async function runWorkflow(){
    if(running) return;
    setRunning(true);
    setTrace(agentDefs.map(function(a){return {name:a[0],detail:a[1],state:"queued"}}));
    for(let i=0;i<agentDefs.length;i++){
      setTrace(function(prev){return prev.map(function(t,j){return j===i?{...t,state:"running"}:t})});
      await new Promise(function(r){window.setTimeout(r,420)});
      setTrace(function(prev){return prev.map(function(t,j){return j===i?{...t,state:"done",ms:220+i*170}:t})});
    }
    setRunning(false);
    notify("Workflow complete — 3 invoices require immediate attention.");
  }
  function addInvoice(){
    const invoice:Invoice={id:"INV-1060",customer:"Demo Industries",amount:175000,due:"2026-10-18",status:"Pending",risk:"Low",po:175000,received:175000};
    setInvoices(function(v){return [invoice,...v]});
    notify("INV-1060 added to the workspace.");
  }
  function upload(file:File){setFiles(function(v){return [file.name,...v]});notify(file.name+" indexed in Demo Knowledge Base.");}

  const nav = [
    ["Dashboard",LayoutDashboard],["Invoices",FileText],["Agents",Bot],["Documents",UploadCloud],["Knowledge",Search],["Evaluations",ShieldCheck]
  ] as const;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark"><Sparkles size={18}/></div><div><b>FinPilot</b><span>Agentic finance</span></div></div>
      <nav>{nav.map(function(item){const N=item[0],Icon=item[1];return <button key={N} className={section===N?"active":""} onClick={function(){setSection(N)}}><Icon size={18}/>{N}</button>})}</nav>
      <div className="sidecard"><div className="pill"><CircleDollarSign size={15}/> Demo mode</div><p>Deterministic finance data. No API key required.</p><button onClick={runWorkflow} disabled={running}>{running?"Agents running…":"Run agent demo"} <ArrowUpRight size={15}/></button></div>
    </aside>

    <main className="main">
      <header><div className="mobilebrand"><Menu size={20}/><b>FinPilot</b></div><div className="search"><Search size={16}/><input value={query} onChange={function(e){setQuery(e.target.value)}} placeholder="Search invoices, customers…"/></div><div className="headerRight"><span className="env"><i/> DEMO</span><div className="avatar">MB</div></div></header>

      {section==="Dashboard" && <Dashboard runWorkflow={runWorkflow} running={running} trace={trace} overdue={overdue} outstanding={outstanding} setSection={setSection} openInvoice={function(i){setSelected(i);setMail(false)}}/>}

      {section==="Invoices" && <Section title="Invoices" eyebrow="Receivables workspace" action={<button className="secondary" onClick={addInvoice}><Plus size={15}/> Add demo invoice</button>}>
        <div className="toolbar"><span>{filtered.length} records</span><b>{query?"Results for “"+query+"”":"All invoices"}</b></div>
        <div className="table big">{filtered.length ? filtered.map(function(i){return <InvoiceRow key={i.id} invoice={i} onClick={function(){setSelected(i);setMail(false)}}/>}) : <Empty title="No invoices found" text="Try a different search term."/>}</div>
      </Section>}

      {section==="Agents" && <Section title="Agents" eyebrow="Orchestration">
        <div className="workflowCard"><div className="workflowTop"><div><span className="eyebrow">End-to-end execution</span><h2>Agentic invoice investigation</h2><p>Planner → research → finance → documents → verification → editor.</p></div><button className="primary" onClick={runWorkflow} disabled={running}><Zap size={16}/>{running?"Running…":"Run workflow"}</button></div><TraceList trace={trace}/></div>
        <div className="agentgrid">{agentDefs.map(function(a,idx){return <div className="agentcard" key={a[0]}><div className="agenttop"><div className="agenticon"><Bot size={17}/></div><span className="verified"><CheckCircle2 size={14}/> active</span></div><h3>{a[0]}</h3><p>{a[1]}</p><div className="meter"><i style={{width:(76+idx*3)+"%"}}/></div><small>Structured output · audit trail</small></div>})}</div>
      </Section>}

      {section==="Documents" && <Documents files={files} upload={upload} invoices={invoices} setMatch={setMatch}/>}

      {section==="Knowledge" && <Section title="Knowledge base" eyebrow="RAG + citations">
        <div className="knowledgeSearch"><Search size={16}/><input value={policyQuery} onChange={function(e){setPolicyQuery(e.target.value)}} placeholder="Search collections, approvals, payments…"/></div>
        <div className="knowledge">{policyResults.map(function(p){return <div className="doc" key={p[0]}><FileText size={20}/><div><b>{p[0]}</b><span>{p[1]}</span><small>Source · {p[0]} {p[2]}</small></div><span className="tag">indexed</span></div>})}{!policyResults.length&&<Empty title="No policy matches" text="Try approval, collections, or payment."/>}</div>
        <div className="card askCard"><div className="cardHead"><div><span className="eyebrow">Grounded answer</span><h2>Why is INV-1042 high risk?</h2></div><ShieldCheck size={18}/></div><div className="bubble bot">INV-1042 is high risk because it is overdue and has ₹4.8L outstanding. The Collections Policy allows escalation after 14 days overdue.<small>Sources · Collections Policy §3.2 · Invoice record INV-1042</small></div></div>
      </Section>}

      {section==="Evaluations" && <Evaluations/>}

      {selected && <InvoiceModal invoice={selected} mail={mail} setMail={setMail} close={function(){setSelected(null)}}/>}
      {match && <MatchModal invoice={match} close={function(){setMatch(null)}}/>}
      {toast && <div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
    </main>
  </div>
}

function Dashboard(props:{runWorkflow:()=>void;running:boolean;trace:Trace[];overdue:Invoice[];outstanding:number;setSection:(s:string)=>void;openInvoice:(i:Invoice)=>void}){
  return <><section className="hero"><div><div className="eyebrow">Finance operations copilot</div><h1>Turn finance work into<br/><span>verified agent workflows.</span></h1><p>Investigate invoices, ground answers in policy, verify every claim, and draft next actions — without leaving one workspace.</p><div className="heroActions"><button className="primary" onClick={props.runWorkflow} disabled={props.running}><Bot size={17}/>{props.running?"Running agents…":"Run invoice risk analysis"}</button><button className="secondary" onClick={function(){props.setSection("Invoices")}}>Explore invoices <ArrowUpRight size={16}/></button></div></div><div className="heroVisual"><div className="traceHead"><span>Live agent trace</span><span className="live"><i/> {props.running?"processing":"ready"}</span></div><TraceList trace={props.trace} compact/></div></section>
  <section className="stats"><Stat label="Outstanding" value={money(props.outstanding)} change="+8.4%"/><Stat label="Overdue invoices" value={String(props.overdue.length)} change="2 high risk"/><Stat label="Auto-verified claims" value="94.2%" change="+4.1 pts"/><Stat label="Avg. response" value="3.1s" change="-22%"/></section>
  <section className="grid2"><div className="card"><div className="cardHead"><div><span className="eyebrow">Priority queue</span><h2>Invoices needing attention</h2></div><button className="iconbtn" onClick={function(){props.setSection("Invoices")}}><ArrowUpRight size={16}/></button></div><div className="table">{props.overdue.slice(0,3).map(function(i){return <InvoiceRow key={i.id} invoice={i} onClick={function(){props.openInvoice(i)}}/>})}</div></div><div className="card"><div className="cardHead"><div><span className="eyebrow">Knowledge grounded</span><h2>Finance policy assistant</h2></div><div className="messageDot">AI</div></div><div className="chat"><div className="bubble bot">According to the Collections Policy, invoices become eligible for escalation after <b>14 days overdue</b>.<small>Source · Collections Policy §3.2</small></div><div className="ask"><b>Grounding:</b> 3 source records checked · 0 unsupported claims</div></div></div></section></>
}

function TraceList(props:{trace:Trace[];compact?:boolean}){return <div className={"traceList"+(props.compact?" compact":"")}>{props.trace.map(function(t,i){return <div className="trace" key={t.name}><div className={"traceIcon "+t.state}>{t.state==="done"?<Check size={15}/>:t.state==="running"?<Activity size={15}/>:<span>{i+1}</span>}</div><div><b>{t.name}</b><span>{t.detail}</span></div><em>{t.state==="done" ? String(t.ms)+"ms" : t.state}</em></div>})}</div>}

function Documents(props:{files:string[];upload:(f:File)=>void;invoices:Invoice[];setMatch:(i:Invoice)=>void}){
 const [drag,setDrag]=useState(false);
 return <Section title="Documents" eyebrow="OCR + three-way matching"><div className={"dropzone"+(drag?" drag":"")} onDragOver={function(e){e.preventDefault();setDrag(true)}} onDragLeave={function(){setDrag(false)}} onDrop={function(e){e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)props.upload(f)}}><UploadCloud size={30}/><h3>Drop an invoice or PO here</h3><p>Demo extraction runs locally; PDF, PNG, JPG and CSV are accepted.</p><label className="secondary fileButton">Choose document<input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" onChange={function(e){const f=e.target.files&&e.target.files[0];if(f)props.upload(f)}}/></label></div>
 <div className="card"><div className="cardHead"><div><span className="eyebrow">Three-way matching</span><h2>Invoice → purchase order → receipt</h2></div><ClipboardCheck size={19}/></div><p className="muted">Select a seeded invoice to run a deterministic match and surface mismatches.</p><div className="matchList">{props.invoices.map(function(i){return <button key={i.id} onClick={function(){props.setMatch(i)}}><div><b>{i.id}</b><span>{i.customer} · {money(i.amount)}</span></div><ArrowUpRight size={15}/></button>})}</div></div>
 {props.files.length>0 && <div className="card"><div className="cardHead"><div><span className="eyebrow">Indexed documents</span><h2>{props.files.length} document{props.files.length>1?"s":""}</h2></div></div>{props.files.map(function(name){return <div className="uploaded" key={name}><FileText size={17}/><span>{name}</span><span className="tag">extracted</span></div>})}</div>}
 </Section>
}

function MatchModal(props:{invoice:Invoice;close:()=>void}){const i=props.invoice;const pass=i.amount===i.po&&i.amount===i.received;return <div className="modalWrap" onClick={props.close}><div className="modal" onClick={function(e){e.stopPropagation()}}><button className="close" onClick={props.close}><X size={18}/></button><span className="eyebrow">Three-way match</span><h2>{i.id}</h2><p className="muted">{i.customer}</p><div className="matchGrid"><MatchCell label="Invoice" value={money(i.amount)} ok={i.amount===i.po}/><MatchCell label="Purchase order" value={money(i.po)} ok={i.amount===i.po}/><MatchCell label="Goods received" value={money(i.received)} ok={i.amount===i.received}/></div><div className={pass?"verifyBox":"warningBox"}>{pass?<CheckCircle2 size={20}/>:<ShieldCheck size={20}/>}<div><b>{pass?"Match passed":"Mismatch detected"}</b><p>{pass?"Invoice, PO and receipt values agree. Payment can proceed to approval.":"Invoice "+money(i.amount)+" differs from a source record. Review the discrepancy before approval."}</p></div></div></div></div>}
function MatchCell(p:{label:string;value:string;ok:boolean}){return <div><span>{p.label}</span><b>{p.value}</b><small className={p.ok?"ok":"bad"}>{p.ok?"MATCH":"MISMATCH"}</small></div>}
function InvoiceRow(p:{invoice:Invoice;onClick:()=>void}){const i=p.invoice;return <div className="row" onClick={p.onClick}><div><b>{i.id}</b><span>{i.customer}</span></div><div><b>{money(i.amount)}</b><span className={"status "+i.status.toLowerCase()}>{i.status}</span></div><span className={"risk "+i.risk.toLowerCase()}>{i.risk} risk</span><ArrowUpRight size={16}/></div>}
function InvoiceModal(p:{invoice:Invoice;mail:boolean;setMail:(v:boolean)=>void;close:()=>void}){const i=p.invoice;return <div className="modalWrap" onClick={p.close}><div className="modal" onClick={function(e){e.stopPropagation()}}><button className="close" onClick={p.close}><X size={18}/></button><span className="eyebrow">Invoice investigation</span><h2>{i.id}</h2><p className="muted">{i.customer} · {money(i.amount)}</p><div className="detailGrid"><div><span>Risk</span><b className={"risk "+i.risk.toLowerCase()}>{i.risk}</b></div><div><span>Due date</span><b>{i.due}</b></div><div><span>Status</span><b>{i.status}</b></div><div><span>Evidence</span><b>18 claims checked</b></div></div><div className="verifyBox"><ShieldCheck size={20}/><div><b>Verification passed</b><p>Amount, due date, customer and payment history match source records.</p></div></div><button className="primary full" onClick={function(){p.setMail(true)}}><Mail size={17}/>Draft follow-up email</button>{p.mail&&<div className="email"><div className="emailHead"><b>Draft email</b><span>AI generated · editable</span></div><p>Subject: Follow-up on {i.id}</p><p>Hi {i.customer} team,<br/><br/>Our records show {i.id} for {money(i.amount)} is currently overdue. Could you share an update on the expected payment date?<br/><br/>Thanks,<br/>Finance Operations</p></div>}</div></div>}
function Evaluations(){return <Section title="Evaluation lab" eyebrow="Prompt QA"><div className="evalgrid"><Eval label="Factual accuracy" value="94.2%" delta="+12.4 pts"/><Eval label="Hallucination rate" value="3.1%" delta="-7.9 pts"/><Eval label="Tool success" value="95.4%" delta="+9.8 pts"/><Eval label="Avg latency" value="3.1s" delta="-22%"/></div><div className="card"><div className="cardHead"><div><span className="eyebrow">Prompt benchmark</span><h2>Version comparison</h2></div></div><div className="bench"><div><span>Finance Agent v1</span><strong>82.0%</strong></div><div><span>Finance Agent v2</span><strong>94.2%</strong></div><div><span>Verification v1</span><strong>91.6%</strong></div></div><div className="benchmarkNote"><CheckCircle2 size={16}/> 100 seeded finance questions · deterministic demo metrics</div></div></Section>}
function Stat(p:{label:string;value:string;change:string}){return <div className="stat"><span>{p.label}</span><b>{p.value}</b><em>{p.change}</em></div>}
function Eval(p:{label:string;value:string;delta:string}){return <div className="eval"><span>{p.label}</span><b>{p.value}</b><em>{p.delta}</em></div>}
function Section(p:{title:string;eyebrow:string;children:React.ReactNode;action?:React.ReactNode}){return <section className="page"><div className="pageHead"><div><span className="eyebrow">{p.eyebrow}</span><h1>{p.title}</h1></div>{p.action}</div>{p.children}</section>}
function Empty(p:{title:string;text:string}){return <div className="empty"><FileText size={20}/><b>{p.title}</b><span>{p.text}</span></div>}

createRoot(document.getElementById("root")!).render(<App/>);