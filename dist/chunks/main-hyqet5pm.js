import{t,s,He,it,D,mt,st,l,n,at,N,P,De,gt,u,$e,f,o,A,i,V,r,C,Le,Y,ht,yt,h,Ee,Re,vt,Ve,Z,de,we,T,bt,H,L,Pe,U,b,X,ct,ut,q,Ne,E,F,Q,dt,Me,Fe,I,pe,Ae,z,Ze,qe,pt,xe,wt,x,fe,ee,ze,Ke,Te,te,me,Ce,Se,m,xt,ne,Ct,ft,St,Ye,Xe,O,Qe,je,et,S,e,ge,Ie,_,R,y,kt,tt,nt,g,re}from"./index-e4tj6bpc.js";import{c,oe,Ge,rt,ke,W,d}from"../bin/cc-safety-net.js";import{ye,ie,ot,K,j}from"./index-pzsnycqg.js";import{readdirSync as X2,statSync as ha,unlinkSync as Q2}from"node:fs";import{basename as ya,dirname as eg,isAbsolute as tg,join as ng,relative as rg,resolve as og,sep as sg}from"node:path";import{existsSync as q2,readdirSync as V2,readFileSync as J2}from"node:fs";import{join as W2}from"node:path";var fa=(a)=>{let p=Date.now()-new Date(a).getTime();if(!Number.isFinite(p))return"";let v=Math.floor(p/60000),w=Math.floor(v/60),k=Math.floor(w/24);if(k>0)return`${k}d ago`;if(w>0)return`${w}h ago`;if(v>0)return`${v}m ago`;return"just now"},Nr=(a)=>{let p=(a??"").trim().split(/\s+/).filter((k)=>k&&!/^[A-Za-z_][A-Za-z0-9_]*=/.test(k)),v=p[0]?.split("/").pop();if(!v)return null;let w=p[1];return w&&/^[a-z][a-z0-9-]*$/.test(w)?`${v} ${w}`:v};function kn(a,p){try{return V2(a,{withFileTypes:!0,encoding:"utf8"}).flatMap((v)=>{let w=W2(a,v.name);if(v.isDirectory())return kn(w,p);if(v.name.endsWith(".jsonl"))return[w];return[]})}catch{if(p&&q2(a))p.count++;return[]}}function ma(a){let p=(k)=>`${k.sessionId}
${Nr(k.segment||k.command)}`,v=a.filter((k)=>k.decision!=="allow"),w=v.filter((k)=>k.sessionId).reduce((k,M)=>k.set(p(M),(k.get(p(M))??0)+1),new Map);return new Set(v.filter((k)=>k.failureStage||(w.get(p(k))??0)>=2))}var K2=["segment","reason","sessionId","decision","agent","ruleId","failureStage"];function Y2(a){if(!a||typeof a!=="object"||Array.isArray(a))return!1;let p=a;if(typeof p.ts!=="string"||typeof p.command!=="string")return!1;return K2.every((v)=>p[v]===void 0||typeof p[v]==="string")}function Un(a,p){try{return J2(a,"utf-8").split(`
`).filter(Boolean).flatMap((v)=>{try{let w=JSON.parse(v);if(!Y2(w)){if(p)p.count++;return[]}return[w]}catch{if(p)p.count++;return[]}})}catch{if(p)p.count++;return[]}}function zt(a){return Array.from(a,(p)=>{let v=p.charCodeAt(0);if(v<=31||v>=127&&v<=159)return`\\x${v.toString(16).padStart(2,"0")}`;return p}).join("")}function ig(a,p){let v=ye(a),w=c({label:"logs",booleans:{all:["--all"],suspect:["--suspect"],json:["--json"],pruneLegacy:["--prune-legacy"],dryRun:["--dry-run"]},values:{id:["--id"],limit:["--limit"],since:["--since"],agent:["--agent"],rule:["--rule"],session:["--session"],project:["--project"]}},p);if(oe(w.errors))return null;if(w.values.id!==void 0&&!/^[a-f0-9]{16}$/.test(w.values.id))return console.error("--id must be 16 hexadecimal characters"),null;let k=w.values.limit===void 0?20:ga(w.values.limit);if(k===null)return console.error("--limit must be a positive number"),null;let M=w.values.since===void 0?Math.min(30,v):ga(w.values.since);if(M===null||M>v)return console.error(`--since must be a positive number of days no greater than ${v}`),null;let G={limit:k,limitExplicit:w.values.limit!==void 0,since:M,sinceExplicit:w.values.since!==void 0,all:w.flags.all,json:w.flags.json,suspect:w.flags.suspect,pruneLegacy:w.flags.pruneLegacy,dryRun:w.flags.dryRun,id:w.values.id,agent:w.values.agent,rule:w.values.rule,session:w.values.session,project:w.values.project===void 0?void 0:og(w.values.project)};if(G.id&&(G.agent!==void 0||G.rule!==void 0||G.session!==void 0||G.project!==void 0||G.suspect||G.sinceExplicit||G.limitExplicit))return console.error("--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit"),null;if(G.pruneLegacy&&(G.id!==void 0||G.agent!==void 0||G.rule!==void 0||G.session!==void 0||G.project!==void 0||G.suspect||G.all||G.sinceExplicit||G.limitExplicit))return console.error("--prune-legacy cannot be combined with --id, --agent, --rule, --session, --project, --suspect, --all, --since, or --limit"),null;if(G.dryRun&&!G.pruneLegacy)return console.error("--dry-run requires --prune-legacy"),null;return G}async function va(a,p,v={}){let w=ig(a,p);if(!w)return 1;let k=v.logsDir??K(a);if(w.pruneLegacy)return ag(k,w.json,w.dryRun);if(!k)return console.log(w.json?"[]":w.id?`No retained audit log entry found for id ${zt(w.id)}.`:"No audit log entries found."),0;ie(a,k);let M={count:0},G=kn(k,M).flatMap((ce)=>Un(ce,M).map((le)=>({entry:le,file:ce})));if(M.count>0)console.error(`warning: ${M.count} audit log ${M.count===1?"source":"sources"} could not be read; these results are incomplete`);if(w.id)return dg(G,w,v.timeZone);let B=Date.now()-w.since*24*60*60*1000,J=G.filter((ce)=>pg(ce,w,k,B)),se=w.suspect?ma(J.map((ce)=>ce.entry)):null,ae=(se?J.filter((ce)=>se.has(ce.entry)):J).sort((ce,le)=>Date.parse(le.entry.ts)-Date.parse(ce.entry.ts)).slice(0,w.limit);if(w.json)return console.log(JSON.stringify(ae.map((ce)=>ce.entry),null,2)),0;if(ae.length===0)return console.log("No audit log entries found."),0;for(let ce of ae)console.log(gg(ce.entry,v.timeZone));return 0}function ag(a,p,v){let w=a?lg(a).map((B)=>ng(a,B)):[];if(v)return cg(w,p);let k=[],M=0,G=0;for(let B of w){let J=ha(B,{throwIfNoEntry:!1})?.size??0,se=ug(B);if(se){k.push(`${ya(B)}: ${se}`);continue}M++,G+=J}if(p)return console.log(JSON.stringify({removedFiles:M,removedBytes:G,failedFiles:k.length})),k.length===0?0:1;console.log(M===0&&k.length===0?"No legacy audit log files found.":`Removed ${M} legacy audit log ${M===1?"file":"files"} (${ba(G)}).`);for(let B of k)console.error(`Could not remove ${zt(B)}`);if(console.log("Nested v2 audit logs were not changed."),M>0)console.log("This deletion cannot be undone.");return k.length===0?0:1}function cg(a,p){let v=a.reduce((w,k)=>w+(ha(k,{throwIfNoEntry:!1})?.size??0),0);if(p)return console.log(JSON.stringify({dryRun:!0,files:a.length,bytes:v})),0;if(console.log(a.length===0?"No legacy audit log files found.":`Would remove ${a.length} legacy audit log ${a.length===1?"file":"files"} (${ba(v)}).`),console.log("Nested v2 audit logs are not included."),a.length>0)console.log("Run the same command without --dry-run to delete them.");return 0}function lg(a){try{return X2(a,{withFileTypes:!0}).filter((p)=>p.isFile()&&p.name.endsWith(".jsonl")).map((p)=>p.name)}catch{return[]}}function ug(a){try{return Q2(a),null}catch(p){return p instanceof Error?p.message:String(p)}}function ba(a){let p=["B","KiB","MiB","GiB"],v=Math.min(Math.floor(Math.log2(Math.max(a,1))/10),p.length-1);return`${Math.round(a/1024**v*10)/10} ${p[v]}`}function dg(a,p,v){let w=a.filter((M)=>M.entry.id===p.id);if(w.length>1)return console.error(`Multiple audit log entries found for id ${zt(p.id??"")}.`),1;if(p.json)return console.log(JSON.stringify(w.map((M)=>M.entry),null,2)),0;let k=w[0];if(!k)return console.log(`No retained audit log entry found for id ${zt(p.id??"")}.`),0;return console.log(hg(k.entry,v)),0}function pg(a,p,v,w){if(!p.all&&a.entry.decision==="allow")return!1;if(Date.parse(a.entry.ts)<w)return!1;if(p.agent!==void 0&&a.entry.agent!==p.agent)return!1;if(p.rule!==void 0&&a.entry.ruleId!==p.rule)return!1;if(p.session!==void 0&&!fg(a,v,p.session))return!1;if(p.project!==void 0&&!mg(a.entry.cwd,p.project))return!1;return!0}function fg(a,p,v){if(a.entry.sessionId===v)return!0;return eg(a.file)===p&&ya(a.file,".jsonl")===v}function mg(a,p){if(!a)return!1;let v=rg(p,a);return v!==".."&&!v.startsWith(`..${sg}`)&&!tg(v)}function gg(a,p){let v=zt(a.id??"-"),w=zt(a.decision??"deny"),k=a.cwd?`  [${zt(a.cwd)}]`:"",M=a.segment||a.command,G=M===a.command?"":"↳ ",B=M.length>50?`${M.slice(0,50)}…`:M;return`${v.padEnd(16)}  ${zt(La(a.ts,p))}  ${w.padEnd(5)}  ${zt(a.agent??"-").padEnd(15)}  ${zt(a.ruleId??"-").padEnd(20)}  ${G}${zt(B)}${k}`}function hg(a,p){let v=(k)=>zt(k===void 0||k===null||k===""?"-":k),w=a.shape?`${a.agent??"-"} (shape: ${a.shape})`:a.agent??"-";return[`id:        ${v(a.id)}`,`ts:        ${v(La(a.ts,p))}`,`decision:  ${v(a.decision)}`,`agent:     ${v(w)}`,`level:     ${v(a.level)}`,`tool:      ${v(a.toolName)}`,`rule:      ${v(a.ruleId)}`,`intent:    ${v(a.intent)}`,`stage:     ${v(a.failureStage)}`,`error:     ${v(a.errorCode)}`,`session:   ${v(a.sessionId)}`,`cwd:       ${v(a.cwd)}`,`version:   ${v(a.v)}`,`truncated: ${v(a.truncated===!0?"yes":void 0)}`,`reason:    ${v(a.reason)}`,`command:   ${v(a.command)}`,`segment:   ${v(a.segment)}`].join(`
`)}function La(a,p){let v=new Date(a);if(Number.isNaN(v.getTime()))return a;return new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:p}).format(v)}function ga(a){let p=Number(a);return Number.isFinite(p)&&p>0?p:null}var wa={name:"doctor",aliases:["--doctor"],description:"Run diagnostic checks to verify installation and configuration",usage:"doctor [options]",options:[{flags:"--json",description:"Output diagnostics as JSON"},{flags:"--skip-update-check",description:"Skip npm registry version check"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net doctor","cc-safety-net doctor --json","cc-safety-net doctor --skip-update-check"]};var xa={name:"explain",description:"Show step-by-step analysis trace of how a command would be analyzed",usage:"explain [options] <command>",argument:"<command>",options:[{flags:"--json",description:"Output analysis as JSON"},{flags:"--cwd",argument:"<path>",description:"Use custom working directory"},{flags:"-h, --help",description:"Show this help"}],examples:['cc-safety-net explain "git reset --hard"','cc-safety-net explain --json "rm -rf /"','cc-safety-net explain --cwd /tmp "git status"']};var ka={name:"gui",description:"Open the local policy editor GUI",usage:"gui [options]",options:[{flags:"--no-open",description:"Print the URL without opening a browser"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net gui","cc-safety-net gui --no-open"]};var yg=ke.map((a)=>({flags:a.flags.join(", "),description:a.description})),vg=ke.flatMap((a)=>a.flags.map((p)=>`cc-safety-net hook ${p}`)),_a={name:"hook",description:"Run as an agent CLI hook (reads JSON from stdin)",usage:"hook INTEGRATION_FLAG",options:[...yg,{flags:"-h, --help",description:"Show this help"}],examples:vg};var Sa={name:"install",description:"Install CC Safety Net into a coding agent CLI",usage:"install [TARGET_FLAG]",options:[...W.map((a)=>({flags:a.flag,description:`Install ${d(a.id)} ${a.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net install",...W.map((a)=>`cc-safety-net install ${a.flag}`)]},Ca={name:"uninstall",description:"Uninstall CC Safety Net from a coding agent CLI",usage:"uninstall [TARGET_FLAG]",options:[...W.map((a)=>({flags:a.flag,description:`Uninstall ${d(a.id)} ${a.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net uninstall",...W.map((a)=>`cc-safety-net uninstall ${a.flag}`)]},Pa={name:"update",description:"Update every installed CC Safety Net integration to the latest version",usage:"update",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net update"]};var $a={name:"logs",description:"Browse audit log entries recorded by hooks",usage:"logs [options]",options:[{flags:"--id",argument:"<id>",description:"Show one entry from retained history by its 16-character id (not guaranteed once it is older than the configured retention)"},{flags:"--limit",argument:"<n>",description:"Maximum entries to print",default:"20"},{flags:"--since",argument:"<days>",description:"Only include entries newer than this many days (max: the configured audit retention, 1-365)",default:"30"},{flags:"--agent",argument:"<name>",description:"Filter by agent name"},{flags:"--rule",argument:"<ruleId>",description:"Filter by rule id"},{flags:"--session",argument:"<id>",description:"Filter by session id"},{flags:"--project",argument:"<path>",description:"Filter by project path"},{flags:"--suspect",description:"Only denials that look like false positives"},{flags:"--all",description:"Include allow entries"},{flags:"--prune-legacy",description:"Permanently delete all legacy root-level logs; nested logs are untouched"},{flags:"--dry-run",description:"With --prune-legacy, report what would be deleted and delete nothing"},{flags:"--json",description:"Output entries as JSON"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net logs --id 3fa9c2d1a70e8b42","cc-safety-net logs --agent claude-code","cc-safety-net logs --project . --since 7","cc-safety-net logs --suspect --since 7","cc-safety-net logs --json","cc-safety-net logs --prune-legacy --dry-run","cc-safety-net logs --prune-legacy"]};var zr={name:"policy",description:"Check and apply project or user policy proposals",usage:"policy <subcommand>",subcommands:[{usage:"check <file>",description:"Validate a policy proposal and print its diff"},{usage:"apply <file>",description:"Apply a proposal after confirming in a terminal"}],options:[{flags:"-g, --global",description:"Use the user-scope policy instead of the project one"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net policy check proposal.json","cc-safety-net policy apply proposal.json","cc-safety-net policy apply proposal.json --global"]};var as=[{flags:"--ref",argument:"<ref>",description:"Use a branch, tag, or commit"},{flags:"--only",argument:"<rulebook...>",description:"Add only these repository rulebooks"},{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"-h, --help",description:"Show this help"}],cs=["cc-safety-net rule add project-rules","cc-safety-net rule add acme/safety-rules","cc-safety-net rule add acme/safety-rules --only aws gcloud","cc-safety-net rule add acme/safety-rules --ref v2 --only aws","cc-safety-net rule add --only terraform aws"],Hn={name:"rule",description:"Manage CC Safety Net rule config and rulebook sources",usage:"rule <subcommand>",subcommands:[{usage:"init [--example]",description:"Create inert rule config"},{usage:"add [source] [--ref <ref>] [--only <rulebook...>]",description:"Add rulebook sources and sync"},{usage:"remove <source>",description:"Remove a rulebook source and sync"},{usage:"update [source]",description:"Re-fetch and vendor remote rulebooks"},{usage:"sync",description:"Deprecated: migrate lock and cache leftovers"},{usage:"list",description:"List active rulebooks"},{usage:"wrapper add <command>",description:"Trust a transparent command wrapper"},{usage:"wrapper remove <command>",description:"Remove a transparent command wrapper"},{usage:"wrapper list",description:"List transparent command wrappers"},{usage:"migrate [--cleanup]",description:"Migrate legacy inline rules"},{usage:"doc",description:"Print the rulebook authoring guide"},{usage:"verify",description:"Validate rule config files"}],options:[{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"--cleanup",description:"Delete legacy files after rule migrate verifies them"},{flags:"--delete-source",description:"Delete clean local source directory on remove"},{flags:"--example",description:"Create an inactive example rulebook with rule init"},...as.slice(0,2),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net rule init","cc-safety-net rule init --example","cc-safety-net rule wrapper add rtk",...cs,"cc-safety-net rule update","cc-safety-net rule migrate --cleanup","cc-safety-net rule verify"]};var Ea={name:"status",description:"Show what the runtime is enforcing right now",usage:"status",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net status"]};var Ra={name:"statusline",description:"Print status line with mode indicators for shell integration",usage:"statusline --claude-code",options:[{flags:"-cc, --claude-code",description:"Print status line for Claude Code"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net statusline -cc","cc-safety-net statusline --claude-code"]};var Fr=[Ea,wa,$a,xa,Hn,zr,Sa,Pa,Ca,_a,ka,Ra];function bg(a){return a.aliases??[]}function Mr(a){let p=a.toLowerCase();return Fr.find((v)=>v.name.toLowerCase()===p||bg(v).some((w)=>w.toLowerCase()===p))}import{basename as Lg}from"node:path";function Ur(a,p=7,v=K(a)){let w=Date.now()-p*24*60*60*1000,k=[],M=new Set,G=0,B,J,se,ae;if(v)ie(a,v);let ce={count:0},le=v?kn(v,ce):[];for(let be of le)for(let ve of Un(be,ce)){if(ve.decision==="allow")continue;let _e=new Date(ve.ts).getTime();if(_e>=w){if(G++,M.add(ve.sessionId??Lg(be,".jsonl")),J===void 0||_e<=J)B=ve.ts,J=_e;if(ae===void 0||_e>ae)se=ve.ts,ae=_e;wg(k,ve,_e)}}let he=k.map((be)=>({timestamp:be.ts,command:be.command,reason:be.reason,relativeTime:fa(new Date(be.ts))}));return{totalBlocked:G,sessionCount:M.size,recentEntries:he,oldestEntry:B,newestEntry:se,unreadable:ce.count}}function wg(a,p,v){let w=a.findIndex((k)=>v>new Date(k.ts).getTime());if(w===-1){if(a.length<3)a.push(p);return}if(a.splice(w,0,p),a.length>3)a.pop()}import{dirname as ty}from"node:path";import{dirname as Kh,join as Yh,resolve as Xh}from"node:path";var Dx=Object.freeze({status:"aborted"});function ue(a,p,v){function w(B,J){if(!B._zod)Object.defineProperty(B,"_zod",{value:{def:J,constr:G,traits:new Set},enumerable:!1});if(B._zod.traits.has(a))return;B._zod.traits.add(a),p(B,J);let se=G.prototype,ae=Object.keys(se);for(let ce=0;ce<ae.length;ce++){let le=ae[ce];if(!(le in B))B[le]=se[le].bind(B)}}let k=v?.Parent??Object;class M extends k{}Object.defineProperty(M,"name",{value:a});function G(B){var J;let se=v?.Parent?new M:this;w(se,B),(J=se._zod).deferred??(J.deferred=[]);for(let ae of se._zod.deferred)ae();return se}return Object.defineProperty(G,"init",{value:w}),Object.defineProperty(G,Symbol.hasInstance,{value:(B)=>{if(v?.Parent&&B instanceof v.Parent)return!0;return B?._zod?.traits?.has(a)}}),Object.defineProperty(G,"name",{value:a}),G}var Ax=Symbol("zod_brand");class ln extends Error{constructor(){super("Encountered Promise during synchronous parse. Use .parseAsync() instead.")}}class sr extends Error{constructor(a){super(`Encountered unidirectional transform during encode: ${a}`);this.name="ZodEncodeError"}}var Hr={};function Yt(a){if(a)Object.assign(Hr,a);return Hr}function Gr(a){let p=Object.values(a).filter((w)=>typeof w==="number");return Object.entries(a).filter(([w,k])=>p.indexOf(+w)===-1).map(([w,k])=>k)}function ar(a,p){if(typeof p==="bigint")return p.toString();return p}function Br(a){return{get value(){{let v=a();return Object.defineProperty(this,"value",{value:v}),v}throw Error("cached value already set")}}}function qr(a){return a===null||a===void 0}function Vr(a){let p=a.startsWith("^")?1:0,v=a.endsWith("$")?a.length-1:a.length;return a.slice(p,v)}var Da=Symbol("evaluating");function $t(a,p,v){let w=void 0;Object.defineProperty(a,p,{get(){if(w===Da)return;if(w===void 0)w=Da,w=v();return w},set(k){Object.defineProperty(a,p,{value:k})},configurable:!0})}function _n(a,p,v){Object.defineProperty(a,p,{value:v,writable:!0,enumerable:!0,configurable:!0})}function fn(...a){let p={};for(let v of a){let w=Object.getOwnPropertyDescriptors(v);Object.assign(p,w)}return Object.defineProperties({},p)}function us(a){return JSON.stringify(a)}function Aa(a){return a.toLowerCase().trim().replace(/[^\w\s-]/g,"").replace(/[\s_-]+/g,"-").replace(/^-+|-+$/g,"")}var ds="captureStackTrace"in Error?Error.captureStackTrace:(...a)=>{};function ir(a){return typeof a==="object"&&a!==null&&!Array.isArray(a)}var Ta=Br(()=>{if(typeof navigator<"u"&&navigator?.userAgent?.includes("Cloudflare"))return!1;try{return new Function(""),!0}catch(a){return!1}});function Sn(a){if(ir(a)===!1)return!1;let p=a.constructor;if(p===void 0)return!0;if(typeof p!=="function")return!0;let v=p.prototype;if(ir(v)===!1)return!1;if(Object.prototype.hasOwnProperty.call(v,"isPrototypeOf")===!1)return!1;return!0}function ps(a){if(Sn(a))return{...a};if(Array.isArray(a))return[...a];return a}var Ia=new Set(["string","number","symbol"]);function mn(a){return a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function Xt(a,p,v){let w=new a._zod.constr(p??a._zod.def);if(!p||v?.parent)w._zod.parent=a;return w}function lt(a){let p=a;if(!p)return{};if(typeof p==="string")return{error:()=>p};if(p?.message!==void 0){if(p?.error!==void 0)throw Error("Cannot specify both `message` and `error` params");p.error=p.message}if(delete p.message,typeof p.error==="string")return{...p,error:()=>p.error};return p}function Oa(a){return Object.keys(a).filter((p)=>a[p]._zod.optin==="optional"&&a[p]._zod.optout==="optional")}var xg={safeint:[Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER],int32:[-2147483648,2147483647],uint32:[0,4294967295],float32:[-340282346638528860000000000000000000000,340282346638528860000000000000000000000],float64:[-Number.MAX_VALUE,Number.MAX_VALUE]};function kg(a,p){let v=a._zod.def,w=v.checks;if(w&&w.length>0)throw Error(".pick() cannot be used on object schemas containing refinements");let M=fn(a._zod.def,{get shape(){let G={};for(let B in p){if(!(B in v.shape))throw Error(`Unrecognized key: "${B}"`);if(!p[B])continue;G[B]=v.shape[B]}return _n(this,"shape",G),G},checks:[]});return Xt(a,M)}function _g(a,p){let v=a._zod.def,w=v.checks;if(w&&w.length>0)throw Error(".omit() cannot be used on object schemas containing refinements");let M=fn(a._zod.def,{get shape(){let G={...a._zod.def.shape};for(let B in p){if(!(B in v.shape))throw Error(`Unrecognized key: "${B}"`);if(!p[B])continue;delete G[B]}return _n(this,"shape",G),G},checks:[]});return Xt(a,M)}function Sg(a,p){if(!Sn(p))throw Error("Invalid input to extend: expected a plain object");let v=a._zod.def.checks;if(v&&v.length>0){let M=a._zod.def.shape;for(let G in p)if(Object.getOwnPropertyDescriptor(M,G)!==void 0)throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.")}let k=fn(a._zod.def,{get shape(){let M={...a._zod.def.shape,...p};return _n(this,"shape",M),M}});return Xt(a,k)}function Cg(a,p){if(!Sn(p))throw Error("Invalid input to safeExtend: expected a plain object");let v=fn(a._zod.def,{get shape(){let w={...a._zod.def.shape,...p};return _n(this,"shape",w),w}});return Xt(a,v)}function Pg(a,p){let v=fn(a._zod.def,{get shape(){let w={...a._zod.def.shape,...p._zod.def.shape};return _n(this,"shape",w),w},get catchall(){return p._zod.def.catchall},checks:[]});return Xt(a,v)}function $g(a,p,v){let k=p._zod.def.checks;if(k&&k.length>0)throw Error(".partial() cannot be used on object schemas containing refinements");let G=fn(p._zod.def,{get shape(){let B=p._zod.def.shape,J={...B};if(v)for(let se in v){if(!(se in B))throw Error(`Unrecognized key: "${se}"`);if(!v[se])continue;J[se]=a?new a({type:"optional",innerType:B[se]}):B[se]}else for(let se in B)J[se]=a?new a({type:"optional",innerType:B[se]}):B[se];return _n(this,"shape",J),J},checks:[]});return Xt(p,G)}function Eg(a,p,v){let w=fn(p._zod.def,{get shape(){let k=p._zod.def.shape,M={...k};if(v)for(let G in v){if(!(G in M))throw Error(`Unrecognized key: "${G}"`);if(!v[G])continue;M[G]=new a({type:"nonoptional",innerType:k[G]})}else for(let G in k)M[G]=new a({type:"nonoptional",innerType:k[G]});return _n(this,"shape",M),M}});return Xt(p,w)}function Cn(a,p=0){if(a.aborted===!0)return!0;for(let v=p;v<a.issues.length;v++)if(a.issues[v]?.continue!==!0)return!0;return!1}function gn(a,p){return p.map((v)=>{var w;return(w=v).path??(w.path=[]),v.path.unshift(a),v})}function Zr(a){return typeof a==="string"?a:a?.message}function Qt(a,p,v){let w={...a,path:a.path??[]};if(!a.message){let k=Zr(a.inst?._zod.def?.error?.(a))??Zr(p?.error?.(a))??Zr(v.customError?.(a))??Zr(v.localeError?.(a))??"Invalid input";w.message=k}if(delete w.inst,delete w.continue,!p?.reportInput)delete w.input;return w}function Jr(a){if(Array.isArray(a))return"array";if(typeof a==="string")return"string";return"unknown"}function Pn(...a){let[p,v,w]=a;if(typeof p==="string")return{message:p,code:"custom",input:v,inst:w};return{...p}}var ja=(a,p)=>{a.name="$ZodError",Object.defineProperty(a,"_zod",{value:a._zod,enumerable:!1}),Object.defineProperty(a,"issues",{value:p,enumerable:!1}),a.message=JSON.stringify(p,ar,2),Object.defineProperty(a,"toString",{value:()=>a.message,enumerable:!1})},Wr=ue("$ZodError",ja),fs=ue("$ZodError",ja,{Parent:Error});function Na(a,p=(v)=>v.message){let v={},w=[];for(let k of a.issues)if(k.path.length>0)v[k.path[0]]=v[k.path[0]]||[],v[k.path[0]].push(p(k));else w.push(p(k));return{formErrors:w,fieldErrors:v}}function za(a,p=(v)=>v.message){let v={_errors:[]},w=(k)=>{for(let M of k.issues)if(M.code==="invalid_union"&&M.errors.length)M.errors.map((G)=>w({issues:G}));else if(M.code==="invalid_key")w({issues:M.issues});else if(M.code==="invalid_element")w({issues:M.issues});else if(M.path.length===0)v._errors.push(p(M));else{let G=v,B=0;while(B<M.path.length){let J=M.path[B];if(B!==M.path.length-1)G[J]=G[J]||{_errors:[]};else G[J]=G[J]||{_errors:[]},G[J]._errors.push(p(M));G=G[J],B++}}};return w(a),v}var Kr=(a)=>(p,v,w,k)=>{let M=w?Object.assign(w,{async:!1}):{async:!1},G=p._zod.run({value:v,issues:[]},M);if(G instanceof Promise)throw new ln;if(G.issues.length){let B=new(k?.Err??a)(G.issues.map((J)=>Qt(J,M,Yt())));throw ds(B,k?.callee),B}return G.value};var Yr=(a)=>async(p,v,w,k)=>{let M=w?Object.assign(w,{async:!0}):{async:!0},G=p._zod.run({value:v,issues:[]},M);if(G instanceof Promise)G=await G;if(G.issues.length){let B=new(k?.Err??a)(G.issues.map((J)=>Qt(J,M,Yt())));throw ds(B,k?.callee),B}return G.value};var cr=(a)=>(p,v,w)=>{let k=w?{...w,async:!1}:{async:!1},M=p._zod.run({value:v,issues:[]},k);if(M instanceof Promise)throw new ln;return M.issues.length?{success:!1,error:new(a??Wr)(M.issues.map((G)=>Qt(G,k,Yt())))}:{success:!0,data:M.value}},Fa=cr(fs),lr=(a)=>async(p,v,w)=>{let k=w?Object.assign(w,{async:!0}):{async:!0},M=p._zod.run({value:v,issues:[]},k);if(M instanceof Promise)M=await M;return M.issues.length?{success:!1,error:new a(M.issues.map((G)=>Qt(G,k,Yt())))}:{success:!0,data:M.value}},Ma=lr(fs),Ua=(a)=>(p,v,w)=>{let k=w?Object.assign(w,{direction:"backward"}):{direction:"backward"};return Kr(a)(p,v,k)};var Ha=(a)=>(p,v,w)=>Kr(a)(p,v,w);var Za=(a)=>async(p,v,w)=>{let k=w?Object.assign(w,{direction:"backward"}):{direction:"backward"};return Yr(a)(p,v,k)};var Ga=(a)=>async(p,v,w)=>Yr(a)(p,v,w);var Ba=(a)=>(p,v,w)=>{let k=w?Object.assign(w,{direction:"backward"}):{direction:"backward"};return cr(a)(p,v,k)};var qa=(a)=>(p,v,w)=>cr(a)(p,v,w);var Va=(a)=>async(p,v,w)=>{let k=w?Object.assign(w,{direction:"backward"}):{direction:"backward"};return lr(a)(p,v,k)};var Ja=(a)=>async(p,v,w)=>lr(a)(p,v,w);var Wa=/^[cC][^\s-]{8,}$/,Ka=/^[0-9a-z]+$/,Ya=/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/,Xa=/^[0-9a-vA-V]{20}$/,Qa=/^[A-Za-z0-9]{27}$/,ec=/^[a-zA-Z0-9_-]{21}$/,tc=/^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;var nc=/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,ms=(a)=>{if(!a)return/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${a}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`)};var rc=/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;var Dg="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";function oc(){return new RegExp(Dg,"u")}var sc=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,ic=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;var ac=/^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,cc=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,lc=/^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,gs=/^[A-Za-z0-9_-]*$/;var uc=/^\+[1-9]\d{6,14}$/,dc="(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))",pc=new RegExp(`^${dc}$`);function fc(a){return typeof a.precision==="number"?a.precision===-1?"(?:[01]\\d|2[0-3]):[0-5]\\d":a.precision===0?"(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d":`(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{${a.precision}}`:"(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?"}function mc(a){return new RegExp(`^${fc(a)}$`)}function gc(a){let p=fc({precision:a.precision}),v=["Z"];if(a.local)v.push("");if(a.offset)v.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");let w=`${p}(?:${v.join("|")})`;return new RegExp(`^${dc}T(?:${w})$`)}var hc=(a)=>{let p=a?`[\\s\\S]{${a?.minimum??0},${a?.maximum??""}}`:"[\\s\\S]*";return new RegExp(`^${p}$`)};var yc=/^-?\d+(?:\.\d+)?$/;var vc=/^[^A-Z]*$/,bc=/^[^a-z]*$/;var Zt=ue("$ZodCheck",(a,p)=>{var v;a._zod??(a._zod={}),a._zod.def=p,(v=a._zod).onattach??(v.onattach=[])});var Lc=ue("$ZodCheckMaxLength",(a,p)=>{var v;Zt.init(a,p),(v=a._zod.def).when??(v.when=(w)=>{let k=w.value;return!qr(k)&&k.length!==void 0}),a._zod.onattach.push((w)=>{let k=w._zod.bag.maximum??Number.POSITIVE_INFINITY;if(p.maximum<k)w._zod.bag.maximum=p.maximum}),a._zod.check=(w)=>{let k=w.value;if(k.length<=p.maximum)return;let G=Jr(k);w.issues.push({origin:G,code:"too_big",maximum:p.maximum,inclusive:!0,input:k,inst:a,continue:!p.abort})}}),wc=ue("$ZodCheckMinLength",(a,p)=>{var v;Zt.init(a,p),(v=a._zod.def).when??(v.when=(w)=>{let k=w.value;return!qr(k)&&k.length!==void 0}),a._zod.onattach.push((w)=>{let k=w._zod.bag.minimum??Number.NEGATIVE_INFINITY;if(p.minimum>k)w._zod.bag.minimum=p.minimum}),a._zod.check=(w)=>{let k=w.value;if(k.length>=p.minimum)return;let G=Jr(k);w.issues.push({origin:G,code:"too_small",minimum:p.minimum,inclusive:!0,input:k,inst:a,continue:!p.abort})}}),xc=ue("$ZodCheckLengthEquals",(a,p)=>{var v;Zt.init(a,p),(v=a._zod.def).when??(v.when=(w)=>{let k=w.value;return!qr(k)&&k.length!==void 0}),a._zod.onattach.push((w)=>{let k=w._zod.bag;k.minimum=p.length,k.maximum=p.length,k.length=p.length}),a._zod.check=(w)=>{let k=w.value,M=k.length;if(M===p.length)return;let G=Jr(k),B=M>p.length;w.issues.push({origin:G,...B?{code:"too_big",maximum:p.length}:{code:"too_small",minimum:p.length},inclusive:!0,exact:!0,input:w.value,inst:a,continue:!p.abort})}}),ur=ue("$ZodCheckStringFormat",(a,p)=>{var v,w;if(Zt.init(a,p),a._zod.onattach.push((k)=>{let M=k._zod.bag;if(M.format=p.format,p.pattern)M.patterns??(M.patterns=new Set),M.patterns.add(p.pattern)}),p.pattern)(v=a._zod).check??(v.check=(k)=>{if(p.pattern.lastIndex=0,p.pattern.test(k.value))return;k.issues.push({origin:"string",code:"invalid_format",format:p.format,input:k.value,...p.pattern?{pattern:p.pattern.toString()}:{},inst:a,continue:!p.abort})});else(w=a._zod).check??(w.check=()=>{})}),kc=ue("$ZodCheckRegex",(a,p)=>{ur.init(a,p),a._zod.check=(v)=>{if(p.pattern.lastIndex=0,p.pattern.test(v.value))return;v.issues.push({origin:"string",code:"invalid_format",format:"regex",input:v.value,pattern:p.pattern.toString(),inst:a,continue:!p.abort})}}),_c=ue("$ZodCheckLowerCase",(a,p)=>{p.pattern??(p.pattern=vc),ur.init(a,p)}),Sc=ue("$ZodCheckUpperCase",(a,p)=>{p.pattern??(p.pattern=bc),ur.init(a,p)}),Cc=ue("$ZodCheckIncludes",(a,p)=>{Zt.init(a,p);let v=mn(p.includes),w=new RegExp(typeof p.position==="number"?`^.{${p.position}}${v}`:v);p.pattern=w,a._zod.onattach.push((k)=>{let M=k._zod.bag;M.patterns??(M.patterns=new Set),M.patterns.add(w)}),a._zod.check=(k)=>{if(k.value.includes(p.includes,p.position))return;k.issues.push({origin:"string",code:"invalid_format",format:"includes",includes:p.includes,input:k.value,inst:a,continue:!p.abort})}}),Pc=ue("$ZodCheckStartsWith",(a,p)=>{Zt.init(a,p);let v=new RegExp(`^${mn(p.prefix)}.*`);p.pattern??(p.pattern=v),a._zod.onattach.push((w)=>{let k=w._zod.bag;k.patterns??(k.patterns=new Set),k.patterns.add(v)}),a._zod.check=(w)=>{if(w.value.startsWith(p.prefix))return;w.issues.push({origin:"string",code:"invalid_format",format:"starts_with",prefix:p.prefix,input:w.value,inst:a,continue:!p.abort})}}),$c=ue("$ZodCheckEndsWith",(a,p)=>{Zt.init(a,p);let v=new RegExp(`.*${mn(p.suffix)}$`);p.pattern??(p.pattern=v),a._zod.onattach.push((w)=>{let k=w._zod.bag;k.patterns??(k.patterns=new Set),k.patterns.add(v)}),a._zod.check=(w)=>{if(w.value.endsWith(p.suffix))return;w.issues.push({origin:"string",code:"invalid_format",format:"ends_with",suffix:p.suffix,input:w.value,inst:a,continue:!p.abort})}});var Ec=ue("$ZodCheckOverwrite",(a,p)=>{Zt.init(a,p),a._zod.check=(v)=>{v.value=p.tx(v.value)}});class hs{constructor(a=[]){if(this.content=[],this.indent=0,this)this.args=a}indented(a){this.indent+=1,a(this),this.indent-=1}write(a){if(typeof a==="function"){a(this,{execution:"sync"}),a(this,{execution:"async"});return}let v=a.split(`
`).filter((M)=>M),w=Math.min(...v.map((M)=>M.length-M.trimStart().length)),k=v.map((M)=>M.slice(w)).map((M)=>" ".repeat(this.indent*2)+M);for(let M of k)this.content.push(M)}compile(){let a=Function,p=this?.args,w=[...(this?.content??[""]).map((k)=>`  ${k}`)];return new a(...p,w.join(`
`))}}var Dc={major:4,minor:3,patch:5};var At=ue("$ZodType",(a,p)=>{var v;a??(a={}),a._zod.def=p,a._zod.bag=a._zod.bag||{},a._zod.version=Dc;let w=[...a._zod.def.checks??[]];if(a._zod.traits.has("$ZodCheck"))w.unshift(a);for(let k of w)for(let M of k._zod.onattach)M(a);if(w.length===0)(v=a._zod).deferred??(v.deferred=[]),a._zod.deferred?.push(()=>{a._zod.run=a._zod.parse});else{let k=(G,B,J)=>{let se=Cn(G),ae;for(let ce of B){if(ce._zod.def.when){if(!ce._zod.def.when(G))continue}else if(se)continue;let le=G.issues.length,he=ce._zod.check(G);if(he instanceof Promise&&J?.async===!1)throw new ln;if(ae||he instanceof Promise)ae=(ae??Promise.resolve()).then(async()=>{if(await he,G.issues.length===le)return;if(!se)se=Cn(G,le)});else{if(G.issues.length===le)continue;if(!se)se=Cn(G,le)}}if(ae)return ae.then(()=>G);return G},M=(G,B,J)=>{if(Cn(G))return G.aborted=!0,G;let se=k(B,w,J);if(se instanceof Promise){if(J.async===!1)throw new ln;return se.then((ae)=>a._zod.parse(ae,J))}return a._zod.parse(se,J)};a._zod.run=(G,B)=>{if(B.skipChecks)return a._zod.parse(G,B);if(B.direction==="backward"){let se=a._zod.parse({value:G.value,issues:[]},{...B,skipChecks:!0});if(se instanceof Promise)return se.then((ae)=>M(ae,G,B));return M(se,G,B)}let J=a._zod.parse(G,B);if(J instanceof Promise){if(B.async===!1)throw new ln;return J.then((se)=>k(se,w,B))}return k(J,w,B)}}$t(a,"~standard",()=>({validate:(k)=>{try{let M=Fa(a,k);return M.success?{value:M.data}:{issues:M.error?.issues}}catch(M){return Ma(a,k).then((G)=>G.success?{value:G.data}:{issues:G.error?.issues})}},vendor:"zod",version:1}))}),to=ue("$ZodString",(a,p)=>{At.init(a,p),a._zod.pattern=[...a?._zod.bag?.patterns??[]].pop()??hc(a._zod.bag),a._zod.parse=(v,w)=>{if(p.coerce)try{v.value=String(v.value)}catch(k){}if(typeof v.value==="string")return v;return v.issues.push({expected:"string",code:"invalid_type",input:v.value,inst:a}),v}}),Et=ue("$ZodStringFormat",(a,p)=>{ur.init(a,p),to.init(a,p)}),Mc=ue("$ZodGUID",(a,p)=>{p.pattern??(p.pattern=nc),Et.init(a,p)}),Uc=ue("$ZodUUID",(a,p)=>{if(p.version){let w={v1:1,v2:2,v3:3,v4:4,v5:5,v6:6,v7:7,v8:8}[p.version];if(w===void 0)throw Error(`Invalid UUID version: "${p.version}"`);p.pattern??(p.pattern=ms(w))}else p.pattern??(p.pattern=ms());Et.init(a,p)}),Hc=ue("$ZodEmail",(a,p)=>{p.pattern??(p.pattern=rc),Et.init(a,p)}),Zc=ue("$ZodURL",(a,p)=>{Et.init(a,p),a._zod.check=(v)=>{try{let w=v.value.trim(),k=new URL(w);if(p.hostname){if(p.hostname.lastIndex=0,!p.hostname.test(k.hostname))v.issues.push({code:"invalid_format",format:"url",note:"Invalid hostname",pattern:p.hostname.source,input:v.value,inst:a,continue:!p.abort})}if(p.protocol){if(p.protocol.lastIndex=0,!p.protocol.test(k.protocol.endsWith(":")?k.protocol.slice(0,-1):k.protocol))v.issues.push({code:"invalid_format",format:"url",note:"Invalid protocol",pattern:p.protocol.source,input:v.value,inst:a,continue:!p.abort})}if(p.normalize)v.value=k.href;else v.value=w;return}catch(w){v.issues.push({code:"invalid_format",format:"url",input:v.value,inst:a,continue:!p.abort})}}}),Gc=ue("$ZodEmoji",(a,p)=>{p.pattern??(p.pattern=oc()),Et.init(a,p)}),Bc=ue("$ZodNanoID",(a,p)=>{p.pattern??(p.pattern=ec),Et.init(a,p)}),qc=ue("$ZodCUID",(a,p)=>{p.pattern??(p.pattern=Wa),Et.init(a,p)}),Vc=ue("$ZodCUID2",(a,p)=>{p.pattern??(p.pattern=Ka),Et.init(a,p)}),Jc=ue("$ZodULID",(a,p)=>{p.pattern??(p.pattern=Ya),Et.init(a,p)}),Wc=ue("$ZodXID",(a,p)=>{p.pattern??(p.pattern=Xa),Et.init(a,p)}),Kc=ue("$ZodKSUID",(a,p)=>{p.pattern??(p.pattern=Qa),Et.init(a,p)}),Yc=ue("$ZodISODateTime",(a,p)=>{p.pattern??(p.pattern=gc(p)),Et.init(a,p)}),Xc=ue("$ZodISODate",(a,p)=>{p.pattern??(p.pattern=pc),Et.init(a,p)}),Qc=ue("$ZodISOTime",(a,p)=>{p.pattern??(p.pattern=mc(p)),Et.init(a,p)}),el=ue("$ZodISODuration",(a,p)=>{p.pattern??(p.pattern=tc),Et.init(a,p)}),tl=ue("$ZodIPv4",(a,p)=>{p.pattern??(p.pattern=sc),Et.init(a,p),a._zod.bag.format="ipv4"}),nl=ue("$ZodIPv6",(a,p)=>{p.pattern??(p.pattern=ic),Et.init(a,p),a._zod.bag.format="ipv6",a._zod.check=(v)=>{try{new URL(`http://[${v.value}]`)}catch{v.issues.push({code:"invalid_format",format:"ipv6",input:v.value,inst:a,continue:!p.abort})}}});var rl=ue("$ZodCIDRv4",(a,p)=>{p.pattern??(p.pattern=ac),Et.init(a,p)}),ol=ue("$ZodCIDRv6",(a,p)=>{p.pattern??(p.pattern=cc),Et.init(a,p),a._zod.check=(v)=>{let w=v.value.split("/");try{if(w.length!==2)throw Error();let[k,M]=w;if(!M)throw Error();let G=Number(M);if(`${G}`!==M)throw Error();if(G<0||G>128)throw Error();new URL(`http://[${k}]`)}catch{v.issues.push({code:"invalid_format",format:"cidrv6",input:v.value,inst:a,continue:!p.abort})}}});function sl(a){if(a==="")return!0;if(a.length%4!==0)return!1;try{return atob(a),!0}catch{return!1}}var il=ue("$ZodBase64",(a,p)=>{p.pattern??(p.pattern=lc),Et.init(a,p),a._zod.bag.contentEncoding="base64",a._zod.check=(v)=>{if(sl(v.value))return;v.issues.push({code:"invalid_format",format:"base64",input:v.value,inst:a,continue:!p.abort})}});function Ag(a){if(!gs.test(a))return!1;let p=a.replace(/[-_]/g,(w)=>w==="-"?"+":"/"),v=p.padEnd(Math.ceil(p.length/4)*4,"=");return sl(v)}var al=ue("$ZodBase64URL",(a,p)=>{p.pattern??(p.pattern=gs),Et.init(a,p),a._zod.bag.contentEncoding="base64url",a._zod.check=(v)=>{if(Ag(v.value))return;v.issues.push({code:"invalid_format",format:"base64url",input:v.value,inst:a,continue:!p.abort})}}),cl=ue("$ZodE164",(a,p)=>{p.pattern??(p.pattern=uc),Et.init(a,p)});function Tg(a,p=null){try{let v=a.split(".");if(v.length!==3)return!1;let[w]=v;if(!w)return!1;let k=JSON.parse(atob(w));if("typ"in k&&k?.typ!=="JWT")return!1;if(!k.alg)return!1;if(p&&(!("alg"in k)||k.alg!==p))return!1;return!0}catch{return!1}}var ll=ue("$ZodJWT",(a,p)=>{Et.init(a,p),a._zod.check=(v)=>{if(Tg(v.value,p.alg))return;v.issues.push({code:"invalid_format",format:"jwt",input:v.value,inst:a,continue:!p.abort})}});var ul=ue("$ZodUnknown",(a,p)=>{At.init(a,p),a._zod.parse=(v)=>v}),dl=ue("$ZodNever",(a,p)=>{At.init(a,p),a._zod.parse=(v,w)=>(v.issues.push({expected:"never",code:"invalid_type",input:v.value,inst:a}),v)});function Ac(a,p,v){if(a.issues.length)p.issues.push(...gn(v,a.issues));p.value[v]=a.value}var pl=ue("$ZodArray",(a,p)=>{At.init(a,p),a._zod.parse=(v,w)=>{let k=v.value;if(!Array.isArray(k))return v.issues.push({expected:"array",code:"invalid_type",input:k,inst:a}),v;v.value=Array(k.length);let M=[];for(let G=0;G<k.length;G++){let B=k[G],J=p.element._zod.run({value:B,issues:[]},w);if(J instanceof Promise)M.push(J.then((se)=>Ac(se,v,G)));else Ac(J,v,G)}if(M.length)return Promise.all(M).then(()=>v);return v}});function eo(a,p,v,w,k){if(a.issues.length){if(k&&!(v in w))return;p.issues.push(...gn(v,a.issues))}if(a.value===void 0){if(v in w)p.value[v]=void 0}else p.value[v]=a.value}function fl(a){let p=Object.keys(a.shape);for(let w of p)if(!a.shape?.[w]?._zod?.traits?.has("$ZodType"))throw Error(`Invalid element at key "${w}": expected a Zod schema`);let v=Oa(a.shape);return{...a,keys:p,keySet:new Set(p),numKeys:p.length,optionalKeys:new Set(v)}}function ml(a,p,v,w,k,M){let G=[],B=k.keySet,J=k.catchall._zod,se=J.def.type,ae=J.optout==="optional";for(let ce in p){if(B.has(ce))continue;if(se==="never"){G.push(ce);continue}let le=J.run({value:p[ce],issues:[]},w);if(le instanceof Promise)a.push(le.then((he)=>eo(he,v,ce,p,ae)));else eo(le,v,ce,p,ae)}if(G.length)v.issues.push({code:"unrecognized_keys",keys:G,input:p,inst:M});if(!a.length)return v;return Promise.all(a).then(()=>v)}var Ig=ue("$ZodObject",(a,p)=>{if(At.init(a,p),!Object.getOwnPropertyDescriptor(p,"shape")?.get){let B=p.shape;Object.defineProperty(p,"shape",{get:()=>{let J={...B};return Object.defineProperty(p,"shape",{value:J}),J}})}let w=Br(()=>fl(p));$t(a._zod,"propValues",()=>{let B=p.shape,J={};for(let se in B){let ae=B[se]._zod;if(ae.values){J[se]??(J[se]=new Set);for(let ce of ae.values)J[se].add(ce)}}return J});let k=ir,M=p.catchall,G;a._zod.parse=(B,J)=>{G??(G=w.value);let se=B.value;if(!k(se))return B.issues.push({expected:"object",code:"invalid_type",input:se,inst:a}),B;B.value={};let ae=[],ce=G.shape;for(let le of G.keys){let he=ce[le],be=he._zod.optout==="optional",ve=he._zod.run({value:se[le],issues:[]},J);if(ve instanceof Promise)ae.push(ve.then((_e)=>eo(_e,B,le,se,be)));else eo(ve,B,le,se,be)}if(!M)return ae.length?Promise.all(ae).then(()=>B):B;return ml(ae,se,B,J,w.value,a)}}),gl=ue("$ZodObjectJIT",(a,p)=>{Ig.init(a,p);let v=a._zod.parse,w=Br(()=>fl(p)),k=(le)=>{let he=new hs(["shape","payload","ctx"]),be=w.value,ve=(Oe)=>{let Lt=us(Oe);return`shape[${Lt}]._zod.run({ value: input[${Lt}], issues: [] }, ctx)`};he.write("const input = payload.value;");let _e=Object.create(null),Be=0;for(let Oe of be.keys)_e[Oe]=`key_${Be++}`;he.write("const newResult = {};");for(let Oe of be.keys){let Lt=_e[Oe],Je=us(Oe),cn=le[Oe]?._zod?.optout==="optional";if(he.write(`const ${Lt} = ${ve(Oe)};`),cn)he.write(`
        if (${Lt}.issues.length) {
          if (${Je} in input) {
            payload.issues = payload.issues.concat(${Lt}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${Je}, ...iss.path] : [${Je}]
            })));
          }
        }
        
        if (${Lt}.value === undefined) {
          if (${Je} in input) {
            newResult[${Je}] = undefined;
          }
        } else {
          newResult[${Je}] = ${Lt}.value;
        }
        
      `);else he.write(`
        if (${Lt}.issues.length) {
          payload.issues = payload.issues.concat(${Lt}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${Je}, ...iss.path] : [${Je}]
          })));
        }
        
        if (${Lt}.value === undefined) {
          if (${Je} in input) {
            newResult[${Je}] = undefined;
          }
        } else {
          newResult[${Je}] = ${Lt}.value;
        }
        
      `)}he.write("payload.value = newResult;"),he.write("return payload;");let Ue=he.compile();return(Oe,Lt)=>Ue(le,Oe,Lt)},M,G=ir,B=!Hr.jitless,se=B&&Ta.value,ae=p.catchall,ce;a._zod.parse=(le,he)=>{ce??(ce=w.value);let be=le.value;if(!G(be))return le.issues.push({expected:"object",code:"invalid_type",input:be,inst:a}),le;if(B&&se&&he?.async===!1&&he.jitless!==!0){if(!M)M=k(p.shape);if(le=M(le,he),!ae)return le;return ml([],be,le,he,ce,a)}return v(le,he)}});function Tc(a,p,v,w){for(let M of a)if(M.issues.length===0)return p.value=M.value,p;let k=a.filter((M)=>!Cn(M));if(k.length===1)return p.value=k[0].value,k[0];return p.issues.push({code:"invalid_union",input:p.value,inst:v,errors:a.map((M)=>M.issues.map((G)=>Qt(G,w,Yt())))}),p}var hl=ue("$ZodUnion",(a,p)=>{At.init(a,p),$t(a._zod,"optin",()=>p.options.some((k)=>k._zod.optin==="optional")?"optional":void 0),$t(a._zod,"optout",()=>p.options.some((k)=>k._zod.optout==="optional")?"optional":void 0),$t(a._zod,"values",()=>{if(p.options.every((k)=>k._zod.values))return new Set(p.options.flatMap((k)=>Array.from(k._zod.values)));return}),$t(a._zod,"pattern",()=>{if(p.options.every((k)=>k._zod.pattern)){let k=p.options.map((M)=>M._zod.pattern);return new RegExp(`^(${k.map((M)=>Vr(M.source)).join("|")})$`)}return});let v=p.options.length===1,w=p.options[0]._zod.run;a._zod.parse=(k,M)=>{if(v)return w(k,M);let G=!1,B=[];for(let J of p.options){let se=J._zod.run({value:k.value,issues:[]},M);if(se instanceof Promise)B.push(se),G=!0;else{if(se.issues.length===0)return se;B.push(se)}}if(!G)return Tc(B,k,a,M);return Promise.all(B).then((J)=>Tc(J,k,a,M))}});var yl=ue("$ZodIntersection",(a,p)=>{At.init(a,p),a._zod.parse=(v,w)=>{let k=v.value,M=p.left._zod.run({value:k,issues:[]},w),G=p.right._zod.run({value:k,issues:[]},w);if(M instanceof Promise||G instanceof Promise)return Promise.all([M,G]).then(([J,se])=>Ic(v,J,se));return Ic(v,M,G)}});function ys(a,p){if(a===p)return{valid:!0,data:a};if(a instanceof Date&&p instanceof Date&&+a===+p)return{valid:!0,data:a};if(Sn(a)&&Sn(p)){let v=Object.keys(p),w=Object.keys(a).filter((M)=>v.indexOf(M)!==-1),k={...a,...p};for(let M of w){let G=ys(a[M],p[M]);if(!G.valid)return{valid:!1,mergeErrorPath:[M,...G.mergeErrorPath]};k[M]=G.data}return{valid:!0,data:k}}if(Array.isArray(a)&&Array.isArray(p)){if(a.length!==p.length)return{valid:!1,mergeErrorPath:[]};let v=[];for(let w=0;w<a.length;w++){let k=a[w],M=p[w],G=ys(k,M);if(!G.valid)return{valid:!1,mergeErrorPath:[w,...G.mergeErrorPath]};v.push(G.data)}return{valid:!0,data:v}}return{valid:!1,mergeErrorPath:[]}}function Ic(a,p,v){let w=new Map,k;for(let B of p.issues)if(B.code==="unrecognized_keys"){k??(k=B);for(let J of B.keys){if(!w.has(J))w.set(J,{});w.get(J).l=!0}}else a.issues.push(B);for(let B of v.issues)if(B.code==="unrecognized_keys")for(let J of B.keys){if(!w.has(J))w.set(J,{});w.get(J).r=!0}else a.issues.push(B);let M=[...w].filter(([,B])=>B.l&&B.r).map(([B])=>B);if(M.length&&k)a.issues.push({...k,keys:M});if(Cn(a))return a;let G=ys(p.value,v.value);if(!G.valid)throw Error(`Unmergable intersection. Error path: ${JSON.stringify(G.mergeErrorPath)}`);return a.value=G.data,a}var vl=ue("$ZodRecord",(a,p)=>{At.init(a,p),a._zod.parse=(v,w)=>{let k=v.value;if(!Sn(k))return v.issues.push({expected:"record",code:"invalid_type",input:k,inst:a}),v;let M=[],G=p.keyType._zod.values;if(G){v.value={};let B=new Set;for(let se of G)if(typeof se==="string"||typeof se==="number"||typeof se==="symbol"){B.add(typeof se==="number"?se.toString():se);let ae=p.valueType._zod.run({value:k[se],issues:[]},w);if(ae instanceof Promise)M.push(ae.then((ce)=>{if(ce.issues.length)v.issues.push(...gn(se,ce.issues));v.value[se]=ce.value}));else{if(ae.issues.length)v.issues.push(...gn(se,ae.issues));v.value[se]=ae.value}}let J;for(let se in k)if(!B.has(se))J=J??[],J.push(se);if(J&&J.length>0)v.issues.push({code:"unrecognized_keys",input:k,inst:a,keys:J})}else{v.value={};for(let B of Reflect.ownKeys(k)){if(B==="__proto__")continue;let J=p.keyType._zod.run({value:B,issues:[]},w);if(J instanceof Promise)throw Error("Async schemas not supported in object keys currently");if(typeof B==="string"&&yc.test(B)&&J.issues.length&&J.issues.some((ce)=>ce.code==="invalid_type"&&ce.expected==="number")){let ce=p.keyType._zod.run({value:Number(B),issues:[]},w);if(ce instanceof Promise)throw Error("Async schemas not supported in object keys currently");if(ce.issues.length===0)J=ce}if(J.issues.length){if(p.mode==="loose")v.value[B]=k[B];else v.issues.push({code:"invalid_key",origin:"record",issues:J.issues.map((ce)=>Qt(ce,w,Yt())),input:B,path:[B],inst:a});continue}let ae=p.valueType._zod.run({value:k[B],issues:[]},w);if(ae instanceof Promise)M.push(ae.then((ce)=>{if(ce.issues.length)v.issues.push(...gn(B,ce.issues));v.value[J.value]=ce.value}));else{if(ae.issues.length)v.issues.push(...gn(B,ae.issues));v.value[J.value]=ae.value}}}if(M.length)return Promise.all(M).then(()=>v);return v}});var bl=ue("$ZodEnum",(a,p)=>{At.init(a,p);let v=Gr(p.entries),w=new Set(v);a._zod.values=w,a._zod.pattern=new RegExp(`^(${v.filter((k)=>Ia.has(typeof k)).map((k)=>typeof k==="string"?mn(k):k.toString()).join("|")})$`),a._zod.parse=(k,M)=>{let G=k.value;if(w.has(G))return k;return k.issues.push({code:"invalid_value",values:v,input:G,inst:a}),k}}),Ll=ue("$ZodLiteral",(a,p)=>{if(At.init(a,p),p.values.length===0)throw Error("Cannot create literal schema with no valid values");let v=new Set(p.values);a._zod.values=v,a._zod.pattern=new RegExp(`^(${p.values.map((w)=>typeof w==="string"?mn(w):w?mn(w.toString()):String(w)).join("|")})$`),a._zod.parse=(w,k)=>{let M=w.value;if(v.has(M))return w;return w.issues.push({code:"invalid_value",values:p.values,input:M,inst:a}),w}});var wl=ue("$ZodTransform",(a,p)=>{At.init(a,p),a._zod.parse=(v,w)=>{if(w.direction==="backward")throw new sr(a.constructor.name);let k=p.transform(v.value,v);if(w.async)return(k instanceof Promise?k:Promise.resolve(k)).then((G)=>(v.value=G,v));if(k instanceof Promise)throw new ln;return v.value=k,v}});function Oc(a,p){if(a.issues.length&&p===void 0)return{issues:[],value:void 0};return a}var vs=ue("$ZodOptional",(a,p)=>{At.init(a,p),a._zod.optin="optional",a._zod.optout="optional",$t(a._zod,"values",()=>p.innerType._zod.values?new Set([...p.innerType._zod.values,void 0]):void 0),$t(a._zod,"pattern",()=>{let v=p.innerType._zod.pattern;return v?new RegExp(`^(${Vr(v.source)})?$`):void 0}),a._zod.parse=(v,w)=>{if(p.innerType._zod.optin==="optional"){let k=p.innerType._zod.run(v,w);if(k instanceof Promise)return k.then((M)=>Oc(M,v.value));return Oc(k,v.value)}if(v.value===void 0)return v;return p.innerType._zod.run(v,w)}}),xl=ue("$ZodExactOptional",(a,p)=>{vs.init(a,p),$t(a._zod,"values",()=>p.innerType._zod.values),$t(a._zod,"pattern",()=>p.innerType._zod.pattern),a._zod.parse=(v,w)=>p.innerType._zod.run(v,w)}),kl=ue("$ZodNullable",(a,p)=>{At.init(a,p),$t(a._zod,"optin",()=>p.innerType._zod.optin),$t(a._zod,"optout",()=>p.innerType._zod.optout),$t(a._zod,"pattern",()=>{let v=p.innerType._zod.pattern;return v?new RegExp(`^(${Vr(v.source)}|null)$`):void 0}),$t(a._zod,"values",()=>p.innerType._zod.values?new Set([...p.innerType._zod.values,null]):void 0),a._zod.parse=(v,w)=>{if(v.value===null)return v;return p.innerType._zod.run(v,w)}}),_l=ue("$ZodDefault",(a,p)=>{At.init(a,p),a._zod.optin="optional",$t(a._zod,"values",()=>p.innerType._zod.values),a._zod.parse=(v,w)=>{if(w.direction==="backward")return p.innerType._zod.run(v,w);if(v.value===void 0)return v.value=p.defaultValue,v;let k=p.innerType._zod.run(v,w);if(k instanceof Promise)return k.then((M)=>jc(M,p));return jc(k,p)}});function jc(a,p){if(a.value===void 0)a.value=p.defaultValue;return a}var Sl=ue("$ZodPrefault",(a,p)=>{At.init(a,p),a._zod.optin="optional",$t(a._zod,"values",()=>p.innerType._zod.values),a._zod.parse=(v,w)=>{if(w.direction==="backward")return p.innerType._zod.run(v,w);if(v.value===void 0)v.value=p.defaultValue;return p.innerType._zod.run(v,w)}}),Cl=ue("$ZodNonOptional",(a,p)=>{At.init(a,p),$t(a._zod,"values",()=>{let v=p.innerType._zod.values;return v?new Set([...v].filter((w)=>w!==void 0)):void 0}),a._zod.parse=(v,w)=>{let k=p.innerType._zod.run(v,w);if(k instanceof Promise)return k.then((M)=>Nc(M,a));return Nc(k,a)}});function Nc(a,p){if(!a.issues.length&&a.value===void 0)a.issues.push({code:"invalid_type",expected:"nonoptional",input:a.value,inst:p});return a}var Pl=ue("$ZodCatch",(a,p)=>{At.init(a,p),$t(a._zod,"optin",()=>p.innerType._zod.optin),$t(a._zod,"optout",()=>p.innerType._zod.optout),$t(a._zod,"values",()=>p.innerType._zod.values),a._zod.parse=(v,w)=>{if(w.direction==="backward")return p.innerType._zod.run(v,w);let k=p.innerType._zod.run(v,w);if(k instanceof Promise)return k.then((M)=>{if(v.value=M.value,M.issues.length)v.value=p.catchValue({...v,error:{issues:M.issues.map((G)=>Qt(G,w,Yt()))},input:v.value}),v.issues=[];return v});if(v.value=k.value,k.issues.length)v.value=p.catchValue({...v,error:{issues:k.issues.map((M)=>Qt(M,w,Yt()))},input:v.value}),v.issues=[];return v}});var $l=ue("$ZodPipe",(a,p)=>{At.init(a,p),$t(a._zod,"values",()=>p.in._zod.values),$t(a._zod,"optin",()=>p.in._zod.optin),$t(a._zod,"optout",()=>p.out._zod.optout),$t(a._zod,"propValues",()=>p.in._zod.propValues),a._zod.parse=(v,w)=>{if(w.direction==="backward"){let M=p.out._zod.run(v,w);if(M instanceof Promise)return M.then((G)=>Qr(G,p.in,w));return Qr(M,p.in,w)}let k=p.in._zod.run(v,w);if(k instanceof Promise)return k.then((M)=>Qr(M,p.out,w));return Qr(k,p.out,w)}});function Qr(a,p,v){if(a.issues.length)return a.aborted=!0,a;return p._zod.run({value:a.value,issues:a.issues},v)}var El=ue("$ZodReadonly",(a,p)=>{At.init(a,p),$t(a._zod,"propValues",()=>p.innerType._zod.propValues),$t(a._zod,"values",()=>p.innerType._zod.values),$t(a._zod,"optin",()=>p.innerType?._zod?.optin),$t(a._zod,"optout",()=>p.innerType?._zod?.optout),a._zod.parse=(v,w)=>{if(w.direction==="backward")return p.innerType._zod.run(v,w);let k=p.innerType._zod.run(v,w);if(k instanceof Promise)return k.then(zc);return zc(k)}});function zc(a){return a.value=Object.freeze(a.value),a}var Rl=ue("$ZodCustom",(a,p)=>{Zt.init(a,p),At.init(a,p),a._zod.parse=(v,w)=>v,a._zod.check=(v)=>{let w=v.value,k=p.fn(w);if(k instanceof Promise)return k.then((M)=>Fc(M,v,w,a));Fc(k,v,w,a);return}});function Fc(a,p,v,w){if(!a){let k={code:"custom",input:v,inst:w,path:[...w._zod.def.path??[]],continue:!w._zod.def.abort};if(w._zod.def.params)k.params=w._zod.def.params;p.issues.push(Pn(k))}}var Dl,n3=Symbol("ZodOutput"),r3=Symbol("ZodInput");class Al{constructor(){this._map=new WeakMap,this._idmap=new Map}add(a,...p){let v=p[0];if(this._map.set(a,v),v&&typeof v==="object"&&"id"in v)this._idmap.set(v.id,a);return this}clear(){return this._map=new WeakMap,this._idmap=new Map,this}remove(a){let p=this._map.get(a);if(p&&typeof p==="object"&&"id"in p)this._idmap.delete(p.id);return this._map.delete(a),this}get(a){let p=a._zod.parent;if(p){let v={...this.get(p)??{}};delete v.id;let w={...v,...this._map.get(a)};return Object.keys(w).length?w:void 0}return this._map.get(a)}has(a){return this._map.has(a)}}function Og(){return new Al}(Dl=globalThis).__zod_globalRegistry??(Dl.__zod_globalRegistry=Og());var dr=globalThis.__zod_globalRegistry;function Tl(a,p){return new a({type:"string",...lt(p)})}function Il(a,p){return new a({type:"string",format:"email",check:"string_format",abort:!1,...lt(p)})}function bs(a,p){return new a({type:"string",format:"guid",check:"string_format",abort:!1,...lt(p)})}function Ol(a,p){return new a({type:"string",format:"uuid",check:"string_format",abort:!1,...lt(p)})}function jl(a,p){return new a({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v4",...lt(p)})}function Nl(a,p){return new a({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v6",...lt(p)})}function zl(a,p){return new a({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v7",...lt(p)})}function Fl(a,p){return new a({type:"string",format:"url",check:"string_format",abort:!1,...lt(p)})}function Ml(a,p){return new a({type:"string",format:"emoji",check:"string_format",abort:!1,...lt(p)})}function Ul(a,p){return new a({type:"string",format:"nanoid",check:"string_format",abort:!1,...lt(p)})}function Hl(a,p){return new a({type:"string",format:"cuid",check:"string_format",abort:!1,...lt(p)})}function Zl(a,p){return new a({type:"string",format:"cuid2",check:"string_format",abort:!1,...lt(p)})}function Gl(a,p){return new a({type:"string",format:"ulid",check:"string_format",abort:!1,...lt(p)})}function Bl(a,p){return new a({type:"string",format:"xid",check:"string_format",abort:!1,...lt(p)})}function ql(a,p){return new a({type:"string",format:"ksuid",check:"string_format",abort:!1,...lt(p)})}function Vl(a,p){return new a({type:"string",format:"ipv4",check:"string_format",abort:!1,...lt(p)})}function Jl(a,p){return new a({type:"string",format:"ipv6",check:"string_format",abort:!1,...lt(p)})}function Wl(a,p){return new a({type:"string",format:"cidrv4",check:"string_format",abort:!1,...lt(p)})}function Kl(a,p){return new a({type:"string",format:"cidrv6",check:"string_format",abort:!1,...lt(p)})}function Yl(a,p){return new a({type:"string",format:"base64",check:"string_format",abort:!1,...lt(p)})}function Xl(a,p){return new a({type:"string",format:"base64url",check:"string_format",abort:!1,...lt(p)})}function Ql(a,p){return new a({type:"string",format:"e164",check:"string_format",abort:!1,...lt(p)})}function eu(a,p){return new a({type:"string",format:"jwt",check:"string_format",abort:!1,...lt(p)})}function tu(a,p){return new a({type:"string",format:"datetime",check:"string_format",offset:!1,local:!1,precision:null,...lt(p)})}function nu(a,p){return new a({type:"string",format:"date",check:"string_format",...lt(p)})}function ru(a,p){return new a({type:"string",format:"time",check:"string_format",precision:null,...lt(p)})}function ou(a,p){return new a({type:"string",format:"duration",check:"string_format",...lt(p)})}function su(a){return new a({type:"unknown"})}function iu(a,p){return new a({type:"never",...lt(p)})}function no(a,p){return new Lc({check:"max_length",...lt(p),maximum:a})}function Zn(a,p){return new wc({check:"min_length",...lt(p),minimum:a})}function ro(a,p){return new xc({check:"length_equals",...lt(p),length:a})}function Ls(a,p){return new kc({check:"string_format",format:"regex",...lt(p),pattern:a})}function ws(a){return new _c({check:"string_format",format:"lowercase",...lt(a)})}function xs(a){return new Sc({check:"string_format",format:"uppercase",...lt(a)})}function ks(a,p){return new Cc({check:"string_format",format:"includes",...lt(p),includes:a})}function _s(a,p){return new Pc({check:"string_format",format:"starts_with",...lt(p),prefix:a})}function Ss(a,p){return new $c({check:"string_format",format:"ends_with",...lt(p),suffix:a})}function yn(a){return new Ec({check:"overwrite",tx:a})}function Cs(a){return yn((p)=>p.normalize(a))}function Ps(){return yn((a)=>a.trim())}function $s(){return yn((a)=>a.toLowerCase())}function Es(){return yn((a)=>a.toUpperCase())}function Rs(){return yn((a)=>Aa(a))}function au(a,p,v){return new a({type:"array",element:p,...lt(v)})}function cu(a,p,v){return new a({type:"custom",check:"custom",fn:p,...lt(v)})}function lu(a){let p=jg((v)=>(v.addIssue=(w)=>{if(typeof w==="string")v.issues.push(Pn(w,v.value,p._zod.def));else{let k=w;if(k.fatal)k.continue=!1;k.code??(k.code="custom"),k.input??(k.input=v.value),k.inst??(k.inst=p),k.continue??(k.continue=!p._zod.def.abort),v.issues.push(Pn(k))}},a(v.value,v)));return p}function jg(a,p){let v=new Zt({check:"custom",...lt(p)});return v._zod.check=a,v}var Ds=()=>{throw Error("JSON Schema conversion is not bundled into this plugin artifact")},uu=()=>Ds,As=()=>Ds;var Ft=Ds;var Ng={guid:"uuid",url:"uri",datetime:"date-time",json_string:"json-string",regex:""},du=(a,p,v,w)=>{let k=v;k.type="string";let{minimum:M,maximum:G,format:B,patterns:J,contentEncoding:se}=a._zod.bag;if(typeof M==="number")k.minLength=M;if(typeof G==="number")k.maxLength=G;if(B){if(k.format=Ng[B]??B,k.format==="")delete k.format;if(B==="time")delete k.format}if(se)k.contentEncoding=se;if(J&&J.size>0){let ae=[...J];if(ae.length===1)k.pattern=ae[0].source;else if(ae.length>1)k.allOf=[...ae.map((ce)=>({...p.target==="draft-07"||p.target==="draft-04"||p.target==="openapi-3.0"?{type:"string"}:{},pattern:ce.source}))]}};var pu=(a,p,v,w)=>{v.not={}};var fu=(a,p,v,w)=>{};var mu=(a,p,v,w)=>{let k=a._zod.def,M=Gr(k.entries);if(M.every((G)=>typeof G==="number"))v.type="number";if(M.every((G)=>typeof G==="string"))v.type="string";v.enum=M},gu=(a,p,v,w)=>{let k=a._zod.def,M=[];for(let G of k.values)if(G===void 0){if(p.unrepresentable==="throw")throw Error("Literal `undefined` cannot be represented in JSON Schema")}else if(typeof G==="bigint")if(p.unrepresentable==="throw")throw Error("BigInt literals cannot be represented in JSON Schema");else M.push(Number(G));else M.push(G);if(M.length===0);else if(M.length===1){let G=M[0];if(v.type=G===null?"null":typeof G,p.target==="draft-04"||p.target==="openapi-3.0")v.enum=[G];else v.const=G}else{if(M.every((G)=>typeof G==="number"))v.type="number";if(M.every((G)=>typeof G==="string"))v.type="string";if(M.every((G)=>typeof G==="boolean"))v.type="boolean";if(M.every((G)=>G===null))v.type="null";v.enum=M}};var hu=(a,p,v,w)=>{if(p.unrepresentable==="throw")throw Error("Custom types cannot be represented in JSON Schema")};var yu=(a,p,v,w)=>{if(p.unrepresentable==="throw")throw Error("Transforms cannot be represented in JSON Schema")};var vu=(a,p,v,w)=>{let k=v,M=a._zod.def,{minimum:G,maximum:B}=a._zod.bag;if(typeof G==="number")k.minItems=G;if(typeof B==="number")k.maxItems=B;k.type="array",k.items=Ft(M.element,p,{...w,path:[...w.path,"items"]})},bu=(a,p,v,w)=>{let k=v,M=a._zod.def;k.type="object",k.properties={};let G=M.shape;for(let se in G)k.properties[se]=Ft(G[se],p,{...w,path:[...w.path,"properties",se]});let B=new Set(Object.keys(G)),J=new Set([...B].filter((se)=>{let ae=M.shape[se]._zod;if(p.io==="input")return ae.optin===void 0;else return ae.optout===void 0}));if(J.size>0)k.required=Array.from(J);if(M.catchall?._zod.def.type==="never")k.additionalProperties=!1;else if(!M.catchall){if(p.io==="output")k.additionalProperties=!1}else if(M.catchall)k.additionalProperties=Ft(M.catchall,p,{...w,path:[...w.path,"additionalProperties"]})},Lu=(a,p,v,w)=>{let k=a._zod.def,M=k.inclusive===!1,G=k.options.map((B,J)=>Ft(B,p,{...w,path:[...w.path,M?"oneOf":"anyOf",J]}));if(M)v.oneOf=G;else v.anyOf=G},wu=(a,p,v,w)=>{let k=a._zod.def,M=Ft(k.left,p,{...w,path:[...w.path,"allOf",0]}),G=Ft(k.right,p,{...w,path:[...w.path,"allOf",1]}),B=(se)=>("allOf"in se)&&Object.keys(se).length===1,J=[...B(M)?M.allOf:[M],...B(G)?G.allOf:[G]];v.allOf=J};var xu=(a,p,v,w)=>{let k=v,M=a._zod.def;k.type="object";let G=M.keyType,J=G._zod.bag?.patterns;if(M.mode==="loose"&&J&&J.size>0){let ae=Ft(M.valueType,p,{...w,path:[...w.path,"patternProperties","*"]});k.patternProperties={};for(let ce of J)k.patternProperties[ce.source]=ae}else{if(p.target==="draft-07"||p.target==="draft-2020-12")k.propertyNames=Ft(M.keyType,p,{...w,path:[...w.path,"propertyNames"]});k.additionalProperties=Ft(M.valueType,p,{...w,path:[...w.path,"additionalProperties"]})}let se=G._zod.values;if(se){let ae=[...se].filter((ce)=>typeof ce==="string"||typeof ce==="number");if(ae.length>0)k.required=ae}},ku=(a,p,v,w)=>{let k=a._zod.def,M=Ft(k.innerType,p,w),G=p.seen.get(a);if(p.target==="openapi-3.0")G.ref=k.innerType,v.nullable=!0;else v.anyOf=[M,{type:"null"}]},_u=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);M.ref=k.innerType},Su=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);M.ref=k.innerType,v.default=JSON.parse(JSON.stringify(k.defaultValue))},Cu=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);if(M.ref=k.innerType,p.io==="input")v._prefault=JSON.parse(JSON.stringify(k.defaultValue))},Pu=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);M.ref=k.innerType;let G;try{G=k.catchValue(void 0)}catch{throw Error("Dynamic catch values are not supported in JSON Schema")}v.default=G},$u=(a,p,v,w)=>{let k=a._zod.def,M=p.io==="input"?k.in._zod.def.type==="transform"?k.out:k.in:k.out;Ft(M,p,w);let G=p.seen.get(a);G.ref=M},Eu=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);M.ref=k.innerType,v.readOnly=!0};var Ts=(a,p,v,w)=>{let k=a._zod.def;Ft(k.innerType,p,w);let M=p.seen.get(a);M.ref=k.innerType};var Wg=ue("ZodISODateTime",(a,p)=>{Yc.init(a,p),Dt.init(a,p)});function Ru(a){return tu(Wg,a)}var Kg=ue("ZodISODate",(a,p)=>{Xc.init(a,p),Dt.init(a,p)});function Du(a){return nu(Kg,a)}var Yg=ue("ZodISOTime",(a,p)=>{Qc.init(a,p),Dt.init(a,p)});function Au(a){return ru(Yg,a)}var Xg=ue("ZodISODuration",(a,p)=>{el.init(a,p),Dt.init(a,p)});function Tu(a){return ou(Xg,a)}var Iu=(a,p)=>{Wr.init(a,p),a.name="ZodError",Object.defineProperties(a,{format:{value:(v)=>za(a,v)},flatten:{value:(v)=>Na(a,v)},addIssue:{value:(v)=>{a.issues.push(v),a.message=JSON.stringify(a.issues,ar,2)}},addIssues:{value:(v)=>{a.issues.push(...v),a.message=JSON.stringify(a.issues,ar,2)}},isEmpty:{get(){return a.issues.length===0}}})},F3=ue("ZodError",Iu),Gt=ue("ZodError",Iu,{Parent:Error});var Ou=Kr(Gt),ju=Yr(Gt),Nu=cr(Gt),zu=lr(Gt),Fu=Ua(Gt),Mu=Ha(Gt),Uu=Za(Gt),Hu=Ga(Gt),Zu=Ba(Gt),Gu=qa(Gt),Bu=Va(Gt),qu=Ja(Gt);var It=ue("ZodType",(a,p)=>(At.init(a,p),Object.assign(a["~standard"],{jsonSchema:{input:As(a,"input"),output:As(a,"output")}}),a.toJSONSchema=uu(a,{}),a.def=p,a.type=p.type,Object.defineProperty(a,"_def",{value:p}),a.check=(...v)=>a.clone(fn(p,{checks:[...p.checks??[],...v.map((w)=>typeof w==="function"?{_zod:{check:w,def:{check:"custom"},onattach:[]}}:w)]}),{parent:!0}),a.with=a.check,a.clone=(v,w)=>Xt(a,v,w),a.brand=()=>a,a.register=(v,w)=>(v.add(a,w),a),a.parse=(v,w)=>Ou(a,v,w,{callee:a.parse}),a.safeParse=(v,w)=>Nu(a,v,w),a.parseAsync=async(v,w)=>ju(a,v,w,{callee:a.parseAsync}),a.safeParseAsync=async(v,w)=>zu(a,v,w),a.spa=a.safeParseAsync,a.encode=(v,w)=>Fu(a,v,w),a.decode=(v,w)=>Mu(a,v,w),a.encodeAsync=async(v,w)=>Uu(a,v,w),a.decodeAsync=async(v,w)=>Hu(a,v,w),a.safeEncode=(v,w)=>Zu(a,v,w),a.safeDecode=(v,w)=>Gu(a,v,w),a.safeEncodeAsync=async(v,w)=>Bu(a,v,w),a.safeDecodeAsync=async(v,w)=>qu(a,v,w),a.refine=(v,w)=>a.check(Gh(v,w)),a.superRefine=(v)=>a.check(ao(v)),a.overwrite=(v)=>a.check(yn(v)),a.optional=()=>Ju(a),a.exactOptional=()=>Dh(a),a.nullable=()=>Wu(a),a.nullish=()=>Ju(Wu(a)),a.nonoptional=(v)=>Nh(a,v),a.array=()=>Gn(a),a.or=(v)=>js([a,v]),a.and=(v)=>Yu(a,v),a.transform=(v)=>Os(a,Qu(v)),a.default=(v)=>Ih(a,v),a.prefault=(v)=>jh(a,v),a.catch=(v)=>Fh(a,v),a.pipe=(v)=>Os(a,v),a.readonly=()=>Hh(a),a.describe=(v)=>{let w=a.clone();return dr.add(w,{description:v}),w},Object.defineProperty(a,"description",{get(){return dr.get(a)?.description},configurable:!0}),a.meta=(...v)=>{if(v.length===0)return dr.get(a);let w=a.clone();return dr.add(w,v[0]),w},a.isOptional=()=>a.safeParse(void 0).success,a.isNullable=()=>a.safeParse(null).success,a.apply=(v)=>v(a),a)),Ku=ue("_ZodString",(a,p)=>{to.init(a,p),It.init(a,p),a._zod.processJSONSchema=(w,k,M)=>du(a,w,k,M);let v=a._zod.bag;a.format=v.format??null,a.minLength=v.minimum??null,a.maxLength=v.maximum??null,a.regex=(...w)=>a.check(Ls(...w)),a.includes=(...w)=>a.check(ks(...w)),a.startsWith=(...w)=>a.check(_s(...w)),a.endsWith=(...w)=>a.check(Ss(...w)),a.min=(...w)=>a.check(Zn(...w)),a.max=(...w)=>a.check(no(...w)),a.length=(...w)=>a.check(ro(...w)),a.nonempty=(...w)=>a.check(Zn(1,...w)),a.lowercase=(w)=>a.check(ws(w)),a.uppercase=(w)=>a.check(xs(w)),a.trim=()=>a.check(Ps()),a.normalize=(...w)=>a.check(Cs(...w)),a.toLowerCase=()=>a.check($s()),a.toUpperCase=()=>a.check(Es()),a.slugify=()=>a.check(Rs())}),nh=ue("ZodString",(a,p)=>{to.init(a,p),Ku.init(a,p),a.email=(v)=>a.check(Il(rh,v)),a.url=(v)=>a.check(Fl(oh,v)),a.jwt=(v)=>a.check(eu(bh,v)),a.emoji=(v)=>a.check(Ml(sh,v)),a.guid=(v)=>a.check(bs(Vu,v)),a.uuid=(v)=>a.check(Ol(so,v)),a.uuidv4=(v)=>a.check(jl(so,v)),a.uuidv6=(v)=>a.check(Nl(so,v)),a.uuidv7=(v)=>a.check(zl(so,v)),a.nanoid=(v)=>a.check(Ul(ih,v)),a.guid=(v)=>a.check(bs(Vu,v)),a.cuid=(v)=>a.check(Hl(ah,v)),a.cuid2=(v)=>a.check(Zl(ch,v)),a.ulid=(v)=>a.check(Gl(lh,v)),a.base64=(v)=>a.check(Yl(hh,v)),a.base64url=(v)=>a.check(Xl(yh,v)),a.xid=(v)=>a.check(Bl(uh,v)),a.ksuid=(v)=>a.check(ql(dh,v)),a.ipv4=(v)=>a.check(Vl(ph,v)),a.ipv6=(v)=>a.check(Jl(fh,v)),a.cidrv4=(v)=>a.check(Wl(mh,v)),a.cidrv6=(v)=>a.check(Kl(gh,v)),a.e164=(v)=>a.check(Ql(vh,v)),a.datetime=(v)=>a.check(Ru(v)),a.date=(v)=>a.check(Du(v)),a.time=(v)=>a.check(Au(v)),a.duration=(v)=>a.check(Tu(v))});function en(a){return Tl(nh,a)}var Dt=ue("ZodStringFormat",(a,p)=>{Et.init(a,p),Ku.init(a,p)}),rh=ue("ZodEmail",(a,p)=>{Hc.init(a,p),Dt.init(a,p)});var Vu=ue("ZodGUID",(a,p)=>{Mc.init(a,p),Dt.init(a,p)});var so=ue("ZodUUID",(a,p)=>{Uc.init(a,p),Dt.init(a,p)});var oh=ue("ZodURL",(a,p)=>{Zc.init(a,p),Dt.init(a,p)});var sh=ue("ZodEmoji",(a,p)=>{Gc.init(a,p),Dt.init(a,p)});var ih=ue("ZodNanoID",(a,p)=>{Bc.init(a,p),Dt.init(a,p)});var ah=ue("ZodCUID",(a,p)=>{qc.init(a,p),Dt.init(a,p)});var ch=ue("ZodCUID2",(a,p)=>{Vc.init(a,p),Dt.init(a,p)});var lh=ue("ZodULID",(a,p)=>{Jc.init(a,p),Dt.init(a,p)});var uh=ue("ZodXID",(a,p)=>{Wc.init(a,p),Dt.init(a,p)});var dh=ue("ZodKSUID",(a,p)=>{Kc.init(a,p),Dt.init(a,p)});var ph=ue("ZodIPv4",(a,p)=>{tl.init(a,p),Dt.init(a,p)});var fh=ue("ZodIPv6",(a,p)=>{nl.init(a,p),Dt.init(a,p)});var mh=ue("ZodCIDRv4",(a,p)=>{rl.init(a,p),Dt.init(a,p)});var gh=ue("ZodCIDRv6",(a,p)=>{ol.init(a,p),Dt.init(a,p)});var hh=ue("ZodBase64",(a,p)=>{il.init(a,p),Dt.init(a,p)});var yh=ue("ZodBase64URL",(a,p)=>{al.init(a,p),Dt.init(a,p)});var vh=ue("ZodE164",(a,p)=>{cl.init(a,p),Dt.init(a,p)});var bh=ue("ZodJWT",(a,p)=>{ll.init(a,p),Dt.init(a,p)});var Lh=ue("ZodUnknown",(a,p)=>{ul.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>fu(a,v,w,k)});function pr(){return su(Lh)}var wh=ue("ZodNever",(a,p)=>{dl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>pu(a,v,w,k)});function xh(a){return iu(wh,a)}var kh=ue("ZodArray",(a,p)=>{pl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>vu(a,v,w,k),a.element=p.element,a.min=(v,w)=>a.check(Zn(v,w)),a.nonempty=(v)=>a.check(Zn(1,v)),a.max=(v,w)=>a.check(no(v,w)),a.length=(v,w)=>a.check(ro(v,w)),a.unwrap=()=>a.element});function Gn(a,p){return au(kh,a,p)}var _h=ue("ZodObject",(a,p)=>{gl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>bu(a,v,w,k),$t(a,"shape",()=>p.shape),a.keyof=()=>Ns(Object.keys(a._zod.def.shape)),a.catchall=(v)=>a.clone({...a._zod.def,catchall:v}),a.passthrough=()=>a.clone({...a._zod.def,catchall:pr()}),a.loose=()=>a.clone({...a._zod.def,catchall:pr()}),a.strict=()=>a.clone({...a._zod.def,catchall:xh()}),a.strip=()=>a.clone({...a._zod.def,catchall:void 0}),a.extend=(v)=>Sg(a,v),a.safeExtend=(v)=>Cg(a,v),a.merge=(v)=>Pg(a,v),a.pick=(v)=>kg(a,v),a.omit=(v)=>_g(a,v),a.partial=(...v)=>$g(ed,a,v[0]),a.required=(...v)=>Eg(td,a,v[0])});function fr(a,p){return new _h({type:"object",shape:a,catchall:pr(),...lt(p)})}var Sh=ue("ZodUnion",(a,p)=>{hl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Lu(a,v,w,k),a.options=p.options});function js(a,p){return new Sh({type:"union",options:a,...lt(p)})}var Ch=ue("ZodIntersection",(a,p)=>{yl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>wu(a,v,w,k)});function Yu(a,p){return new Ch({type:"intersection",left:a,right:p})}var Ph=ue("ZodRecord",(a,p)=>{vl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>xu(a,v,w,k),a.keyType=p.keyType,a.valueType=p.valueType});function Xu(a,p,v){return new Ph({type:"record",keyType:a,valueType:p,...lt(v)})}var Is=ue("ZodEnum",(a,p)=>{bl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(w,k,M)=>mu(a,w,k,M),a.enum=p.entries,a.options=Object.values(p.entries);let v=new Set(Object.keys(p.entries));a.extract=(w,k)=>{let M={};for(let G of w)if(v.has(G))M[G]=p.entries[G];else throw Error(`Key ${G} not found in enum`);return new Is({...p,checks:[],...lt(k),entries:M})},a.exclude=(w,k)=>{let M={...p.entries};for(let G of w)if(v.has(G))delete M[G];else throw Error(`Key ${G} not found in enum`);return new Is({...p,checks:[],...lt(k),entries:M})}});function Ns(a,p){let v=Array.isArray(a)?Object.fromEntries(a.map((w)=>[w,w])):a;return new Is({type:"enum",entries:v,...lt(p)})}var $h=ue("ZodLiteral",(a,p)=>{Ll.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>gu(a,v,w,k),a.values=new Set(p.values),Object.defineProperty(a,"value",{get(){if(p.values.length>1)throw Error("This schema contains multiple valid literal values. Use `.values` instead.");return p.values[0]}})});function io(a,p){return new $h({type:"literal",values:Array.isArray(a)?a:[a],...lt(p)})}var Eh=ue("ZodTransform",(a,p)=>{wl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>yu(a,v,w,k),a._zod.parse=(v,w)=>{if(w.direction==="backward")throw new sr(a.constructor.name);v.addIssue=(M)=>{if(typeof M==="string")v.issues.push(Pn(M,v.value,p));else{let G=M;if(G.fatal)G.continue=!1;G.code??(G.code="custom"),G.input??(G.input=v.value),G.inst??(G.inst=a),v.issues.push(Pn(G))}};let k=p.transform(v.value,v);if(k instanceof Promise)return k.then((M)=>(v.value=M,v));return v.value=k,v}});function Qu(a){return new Eh({type:"transform",transform:a})}var ed=ue("ZodOptional",(a,p)=>{vs.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Ts(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function Ju(a){return new ed({type:"optional",innerType:a})}var Rh=ue("ZodExactOptional",(a,p)=>{xl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Ts(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function Dh(a){return new Rh({type:"optional",innerType:a})}var Ah=ue("ZodNullable",(a,p)=>{kl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>ku(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function Wu(a){return new Ah({type:"nullable",innerType:a})}var Th=ue("ZodDefault",(a,p)=>{_l.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Su(a,v,w,k),a.unwrap=()=>a._zod.def.innerType,a.removeDefault=a.unwrap});function Ih(a,p){return new Th({type:"default",innerType:a,get defaultValue(){return typeof p==="function"?p():ps(p)}})}var Oh=ue("ZodPrefault",(a,p)=>{Sl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Cu(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function jh(a,p){return new Oh({type:"prefault",innerType:a,get defaultValue(){return typeof p==="function"?p():ps(p)}})}var td=ue("ZodNonOptional",(a,p)=>{Cl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>_u(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function Nh(a,p){return new td({type:"nonoptional",innerType:a,...lt(p)})}var zh=ue("ZodCatch",(a,p)=>{Pl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Pu(a,v,w,k),a.unwrap=()=>a._zod.def.innerType,a.removeCatch=a.unwrap});function Fh(a,p){return new zh({type:"catch",innerType:a,catchValue:typeof p==="function"?p:()=>p})}var Mh=ue("ZodPipe",(a,p)=>{$l.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>$u(a,v,w,k),a.in=p.in,a.out=p.out});function Os(a,p){return new Mh({type:"pipe",in:a,out:p})}var Uh=ue("ZodReadonly",(a,p)=>{El.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>Eu(a,v,w,k),a.unwrap=()=>a._zod.def.innerType});function Hh(a){return new Uh({type:"readonly",innerType:a})}var Zh=ue("ZodCustom",(a,p)=>{Rl.init(a,p),It.init(a,p),a._zod.processJSONSchema=(v,w,k)=>hu(a,v,w,k)});function Gh(a,p={}){return cu(Zh,a,p)}function ao(a){return lu(a)}function zs(a,p){return Os(Qu(a),p)}var nd,Bh=Array(I+1).fill("over-limit"),rd=/^[^/]+\/[^/]+$/,C_=`must be an integer between ${Me} and ${Fe}`;var od=(a)=>{let p=ao(a);return p._zod.def.when=()=>!0,p};function sd(a){if(!co(a)||!Array.isArray(a.rules)||a.rules.length<=I)return a;return{$schema:a.$schema,version:a.version,rules:Bh,overrides:a.overrides,transparent_wrappers:a.transparent_wrappers}}function qh(){let a=Ns(Ne),p=js([io("off"),fr({reason:en({error:"required non-empty string"}).min(1,"required non-empty string").max(F,`must be at most ${F} characters`).describe("Replacement block reason"),intent:a.optional()})],{error:'must be "off" or an object'}).describe("Disable a rule or replace its block reason and intent."),v=en({error:"must be a rulebook source string"}).min(1,"must be a non-empty rulebook source string"),w=en({error:"must be a command string"}).regex(E,"must match command pattern").describe("Command name such as 'git', 'docker', or 'rtk'."),k=fr({$schema:pr().optional().describe("JSON Schema reference for IDE support"),version:io(1).describe("Schema version (must be 1)"),rules:Gn(v,{error:"must be an array of rulebook source strings"}).max(I,pe).default([]).describe("Rulebook source strings such as project-rules or owner/repo#main/team-rules"),overrides:Xu(en().meta({pattern:rd.source}),p).default({}).describe("Rule overrides by id"),transparent_wrappers:Gn(w,{error:"must be an array of command strings"}).default([]).describe("Commands that transparently execute a visible protected child command")}),M=(le,he)=>{if(!co(le))return;if(Array.isArray(le.rules)&&le.rules.length<=I){let ve=new Set;le.rules.forEach((_e,Be)=>{if(typeof _e!=="string"||_e==="")return;if(_e.trim()===""){he.addIssue({code:"custom",message:"must be a non-empty rulebook source string",path:["rules",Be]});return}let Ue=Ve(_e);if(Ue){he.addIssue({code:"custom",message:Ue,path:["rules",Be]});return}if(ve.has(_e)){he.addIssue({code:"custom",message:`duplicate rulebook source "${_e}"`,path:["rules",Be]});return}ve.add(_e)})}if(co(le.overrides))for(let ve of Object.keys(le.overrides)){if(rd.test(ve))continue;he.addIssue({code:"custom",message:"must use <rulebook-name>/<rule-name>",path:["overrides",ve]})}if(!Array.isArray(le.transparent_wrappers))return;let be=new Set;le.transparent_wrappers.forEach((ve,_e)=>{if(typeof ve!=="string"||!E.test(ve))return;if(be.has(ve)){he.addIssue({code:"custom",message:`duplicate command "${ve}"`,path:["transparent_wrappers",_e]});return}if(Ae(ve)){he.addIssue({code:"custom",message:`reserved command "${ve}" cannot be a wrapper`,path:["transparent_wrappers",_e]});return}be.add(ve)})},G=zs(sd,k.check(ao(M))),B=zs(sd,k.check(od(M))),J=(le,he)=>{if(!Array.isArray(le))return;let be=new Set;le.forEach((ve,_e)=>{let Be=co(ve)?ve.name:void 0;if(typeof Be!=="string")return;if(be.has(Be.toLowerCase())){he.addIssue({code:"custom",message:`duplicate rule name "${Be}"`,path:[_e,"name"]});return}be.add(Be.toLowerCase())})},se="must match pattern (letters, numbers, hyphens, underscores)",ae=fr({name:en({error:"required string"}).regex(h,"must match pattern (letters, numbers, hyphens, underscores; max 64 chars)"),command:en({error:"required string"}).regex(E,"must match pattern (letters, numbers, hyphens, underscores)"),subcommand:en({error:"must be a string if provided"}).regex(E,"must match pattern (letters, numbers, hyphens, underscores)").optional(),block_args:Gn(en({error:"must be a string"}).refine((le)=>le!=="",{error:"must not be empty"}),{error:"required array"}).refine((le)=>le.length>0,{error:"must have at least one element"}),reason:en({error:"required string"}).refine((le)=>le!=="",{error:"must not be empty"}).refine((le)=>le.length<=F,{error:`must be at most ${F} characters`}),intent:a.optional()},{error:"must be an object"}),ce=fr({version:io(1),rules:Gn(ae,{error:"must be an array"}).check(od(J)).optional()});return{RulesConfigSchema:G,RulesConfigDiagnosticSchema:B,LegacyConfigSchema:ce}}function Vh(){return nd??=qh(),nd}function id(){return Vh().LegacyConfigSchema}function ad(a,p=": ",v=" "){return[...new Set(a.flatMap((w)=>cd(w,p,v,[])))]}function cd(a,p,v,w){let k=[...w,...a.path],M=pt(k);if(a.code==="unrecognized_keys")return a.keys.map((G)=>`${M?`${M}.`:""}unknown field "${G}"`);if(a.code==="invalid_key")return a.issues.map((G)=>G.message);if(a.code==="invalid_union"){let G=a.errors.flat().filter((B)=>B.path.length>0);if(G.length>0)return G.flatMap((B)=>cd(B,p,v,k))}if(k.length===0)return[a.code==="invalid_type"?"Config must be an object":a.message];if(k.length===1&&(a.code==="too_big"||a.code==="too_small")&&a.origin==="array")return[a.message];return[`${M}${k.length===1?v:p}${Jh(a)}`]}function Jh(a){if(a.code==="invalid_value")return`must be ${Wh(a.values)}`;if(a.code!=="invalid_type"||!a.message.startsWith("Invalid input:"))return a.message;if(a.expected==="object"||a.expected==="record")return"must be an object if provided";return a.expected==="boolean"?"must be a boolean":a.message}function Wh(a){if(a.length>3)return`one of ${a.join(", ")}`;let p=a.map((v)=>typeof v==="string"?`"${v}"`:String(v));if(p.length<2)return`${p[0]}`;return`${p.slice(0,-1).join(", ")}${p.length>2?",":""} or ${p.at(-1)}`}function co(a){return!!a&&typeof a==="object"&&!Array.isArray(a)}var Qh="config.json";function Ut(a,p,v,w){C(ey(a),`${JSON.stringify(p,null,2)}
`,v,w)}function ey(a){return typeof a==="string"?V(a):a}function Fs(a){let p=id().safeParse(a);return{errors:p.success?[]:ad(p.error.issues),ruleNames:new Set(qe(a).map((v)=>v.toLowerCase()))}}function Ms(a){let p=ld(a);if(!p.ok)return p.result;return Fs(p.parsed)}function ld(a){let p=[],v=new Set;try{let w=typeof a==="string"?V(a):a,k=r(w);if(k===null)return p.push(`File not found: ${w.path}`),{ok:!1,result:{errors:p,ruleNames:v}};if(!k.trim())return p.push("Config file is empty"),{ok:!1,result:{errors:p,ruleNames:v}};return{ok:!0,parsed:JSON.parse(k)}}catch(w){if(w instanceof o)return p.push(w.message),{ok:!1,result:{errors:p,ruleNames:v}};let k=w instanceof Error?w.message:String(w);return p.push(w instanceof SyntaxError?"Invalid JSON":k),{ok:!1,result:{errors:p,ruleNames:v}}}}function ud(a){return Xh(a,".safety-net.json")}function vn(a){let p=ld(a);if(!p.ok)return p.result;let v=Ze(p.parsed);return{errors:v.errors,ruleNames:v.sources}}function lo(a,p={}){return Yh(Kh(Pe(a,p)),Qh)}function dd(a,p,v){let w;try{if(r(p)===null)return{path:a,exists:!1,valid:!1,ruleCount:0};w=vn(p),w.errors.push(...ee(a,v))}catch(k){if(!(k instanceof o))throw k;w={errors:[k.message],ruleNames:new Set}}return{path:a,exists:!0,valid:w.errors.length===0,ruleCount:w.ruleNames.size,...w.errors.length>0?{errors:w.errors}:{}}}function ny(a,p){return{source:p,name:a.name,command:a.command,subcommand:a.subcommand,blockArgs:[...a.block_args],reason:a.reason}}function pd(a,p,v){let w=v?.userConfigPath??U(a),k=v?.projectConfigPath??H(p),M=ty(w),G=fe(a,{cwd:p,userConfigPath:w,projectConfigPath:k,userConfigDir:M}),B=X(a,{cwd:p,userConfigPath:w,projectConfigPath:k,userConfigDir:M}),J=new Map(G.rulebooks.flatMap((se)=>se.rules.map((ae)=>[ae,se.source])));return{userConfig:dd(w,B.userConfigTarget,B.userScope),projectConfig:dd(k,B.projectConfigTarget,B.projectScope),effectiveRules:G.rules.map((se)=>ny(se,J.get(se.name)??"project")),shadowedRules:[]}}var ry=[{flag:n.level,description:"Safety level preset: standard, strict, or paranoid",defaultBehavior:"standard"},{flag:n.strict,description:"Legacy; equivalent to safety.overrides.fail_closed",defaultBehavior:"permissive"},{flag:n.paranoid,description:"Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",defaultBehavior:"off"},{flag:n.paranoidRm,description:"Legacy; equivalent to safety.overrides.paranoid_rm",defaultBehavior:"off"},{flag:n.paranoidInterpreters,description:"Legacy; equivalent to safety.overrides.paranoid_interpreters",defaultBehavior:"off"},{flag:n.worktree,description:"Allow local git discards in linked worktrees",defaultBehavior:"off"},{flag:n.debug,description:"Print diagnostic messages to stderr",defaultBehavior:"off"},{flag:n.auditScope,description:"Command decisions recorded: all, or blocked (privacy-minimizing, denials only)",defaultBehavior:"all"}];function fd(a){return[...ry.map((p)=>({name:p.flag.name,value:De(p.flag,a.env),isSet:gt(p.flag,a.env),legacyName:p.flag.legacyName,legacyValue:p.flag.legacyName?a.env.get(p.flag.legacyName):void 0,legacyIsSet:p.flag.legacyName?a.env.get(p.flag.legacyName)!==void 0:void 0,description:p.description,defaultBehavior:p.defaultBehavior})),{name:"CC_SAFETY_NET_HOME",value:a.env.get("CC_SAFETY_NET_HOME"),isSet:a.env.get("CC_SAFETY_NET_HOME")!==void 0,description:"Override user-scope config/cache directory",defaultBehavior:"~/.cc-safety-net"}]}var md={error:0,warning:1,info:2},oy=["policy","config","audit"];function sy(a){return a.map((p)=>{if(p==="ownership")return"is not owned by the current user";if(p==="permissions")return"has unsafe permissions";if(p==="symlink")return"is a symbolic link";return"is not a directory"}).join(" and ")}var iy=[{derive:(a)=>a.hooks.length>0&&a.hooks.every((p)=>!p.configured)?[{checkId:"integration.none-configured",severity:"error",title:"No integration configured",detail:"CC Safety Net is not connected to any supported coding-agent integration.",fixHint:"Run `cc-safety-net install` and configure at least one integration."}]:[]},{derive:(a)=>a.hooks.filter((p)=>p.inspectionStatus==="failed").map((p)=>{let v=d(p.platform);return{checkId:"integration.inspection-failed",severity:"error",title:`${v} inspection failed`,detail:`Doctor could not verify the ${v} integration configuration.`,fixHint:`Correct the reported ${v} configuration error, then run \`cc-safety-net doctor\` again.`,integration:p.platform}})},{derive:(a)=>a.userConfig.exists&&!a.userConfig.valid?[{checkId:"config.user-invalid",severity:"error",title:"User configuration is invalid",detail:"Doctor could not load a valid user rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:a.userConfig.path}]:[]},{derive:(a)=>a.projectConfig.exists&&!a.projectConfig.valid?[{checkId:"config.project-invalid",severity:"error",title:"Project configuration is invalid",detail:"Doctor could not load a valid project rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:a.projectConfig.path}]:[]},{derive:(a)=>a.configState.state==="degraded"?[{checkId:"config.runtime-degraded",severity:"warning",title:"Runtime is enforcing a fallback configuration",detail:`The rejected candidate configuration is not active: ${a.configState.reason}`,fixHint:"Fix the file named in the reason, or run `cc-safety-net rule update` to vendor a remote source, then rerun doctor."}]:[]},{derive:(a)=>a.v2Leftovers&&a.v2Leftovers.length>0?[{checkId:"config.v2-leftovers",severity:"info",title:"Rulebook lock and cache leftovers detected",detail:`Files an earlier version left behind are no longer read: ${a.v2Leftovers.join(", ")}.`,fixHint:"Run `cc-safety-net rule sync` (add `--global` for user scope) to migrate them, then rerun doctor."}]:[]},{derive:(a)=>{let p=a.environment.find((v)=>v.name==="CC_SAFETY_NET_AUDIT_SCOPE");return at(p?.value)==="invalid"?[{checkId:"environment.audit-scope-invalid",severity:"warning",title:"Audit scope value is invalid",detail:"CC_SAFETY_NET_AUDIT_SCOPE is not `all` or `blocked`, so allowed command decisions are not recorded.",fixHint:"Set CC_SAFETY_NET_AUDIT_SCOPE to `all` or `blocked`, then restart the integration."}]:[]}},...oy.map((a)=>({derive:(p)=>p.posture.directories.filter((v)=>v.kind===a&&v.status==="unsafe").map((v)=>({checkId:`posture.${a}-directory-unsafe`,severity:"error",title:`${a[0]?.toUpperCase()}${a.slice(1)} directory is unsafe`,detail:`The ${a} directory ${sy(v.issues)}.`,fixHint:"Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.",...v.path?{path:v.path}:{}}))})),{derive:(a)=>{let p=[...a.effectiveSafety.weakenedRuleOverrides].sort();return p.length>0?[{checkId:"posture.rule-overrides-weaken-preset",severity:"warning",title:"Rule overrides weaken the selected preset",detail:`Explicit overrides disable rules the resolved preset would enable: ${p.join(", ")}.`,fixHint:`Remove these \`off\` overrides or set them to \`on\`: ${p.join(", ")}.`}]:[]}}];function gd(a){return iy.flatMap((p,v)=>p.derive(a).map((w,k)=>({finding:w,catalogOrder:v,occurrence:k}))).sort((p,v)=>md[p.finding.severity]-md[v.finding.severity]||p.catalogOrder-v.catalogOrder||p.occurrence-v.occurrence).map((p)=>p.finding)}function tn(){return Boolean(process.stdout.isTTY&&!process.env.NO_COLOR)}var ay=(a)=>tn()?`\x1B[32m${a}\x1B[0m`:a,cy=(a)=>tn()?`\x1B[33m${a}\x1B[0m`:a,ly=(a)=>tn()?`\x1B[34m${a}\x1B[0m`:a,uy=(a)=>tn()?`\x1B[35m${a}\x1B[0m`:a,dy=(a)=>tn()?`\x1B[36m${a}\x1B[0m`:a,py=(a)=>tn()?`\x1B[31m${a}\x1B[0m`:a,fy=(a)=>tn()?`\x1B[2m${a}\x1B[0m`:a,my=(a)=>tn()?`\x1B[1m${a}\x1B[0m`:a,We={green:ay,yellow:cy,blue:ly,magenta:uy,cyan:dy,red:py,dim:fy,bold:my},gy="\x1B[0m",hy=[39,82,198,226,208,51,196,46,201,214,93,154,220,27,49,190,200,33,129,227,45,160,63,118,123,202];function yy(a){let p=a;return()=>(p=(p*1664525+1013904223)%4294967296,p/4294967296)}function vy(a){let p=[...hy],v=yy(a);for(let w=p.length-1;w>0;w--){let k=Math.floor(v()*(w+1)),M=p[w];p[w]=p[k],p[k]=M}return p}function by(a,p=0){if(!tn())return"";let v=vy(p);return`\x1B[38;5;${v[a%v.length]}m`}function hd(a,p,v=0){if(!tn())return`"${a}"`;return`${by(p,v)}"${a}"${gy}`}function uo(a){return a==="default"?"built-in default":`${a} policy`}var Ly=new RegExp("\x1B\\[[0-9;]*m","g"),Us=(a)=>a.replace(Ly,"").length;function $n(a){let p=(a.headers??a.rows[0]??[]).map((G,B)=>{let J=Math.max(...a.rows.map((se)=>Us(se[B]??"")));return Math.max(Us(G),J)}),v=(G,B)=>G+" ".repeat(Math.max(0,B-Us(G))),w=(G,B)=>B[0]+p.map((J)=>G.repeat(J+2)).join(B[1])+B[2],k=(G)=>`│ ${G.map((B,J)=>v(B,p[J]??0)).join(" │ ")} │`,M=a.headers?[`   ${k(a.headers)}`,`   ${w("─",["├","┼","┤"])}`]:[];return[`   ${w("─",["┌","┬","┐"])}`,...M,...a.rows.map((G)=>`   ${k(G)}`),`   ${w("─",["└","┴","┘"])}`].join(`
`)}function yd(a){let p=[];p.push("Hook Integration"),p.push(wy(a));let v=[],w=[];for(let k of a){let M=d(k.platform);if(k.errors&&k.errors.length>0)for(let G of k.errors)if(k.configured)v.push({platform:M,message:G});else w.push({platform:M,message:G})}for(let k of v)p.push(`   Warning (${k.platform}): ${k.message}`);for(let k of w)p.push(We.red(`   Error (${k.platform}): ${k.message}`));return p.join(`
`)}function wy(a){let p=["Platform","Discovery","Configuration","Inspection"],v=a.map((w)=>{let k=d(w.platform);if(w.inspectionStatus==="not-inspected"){let J=We.dim("Not inspected");return[k,J,J,J]}let M=w.detected?We.green("Detected"):w.inspectionStatus==="failed"?We.red("Unknown"):We.dim("Not detected"),G=w.configured?We.green("Configured"):w.detected?We.yellow("Not configured"):w.inspectionStatus==="failed"?We.red("Unknown"):We.dim("Not applicable"),B=w.inspectionStatus==="verified"?We.green("Verified"):w.inspectionStatus==="failed"?We.red("Failed"):We.dim("Not applicable");return[k,M,G,B]});return $n({headers:p,rows:v})}function vd(a){let v=["Guard Engine Verification",`   Synthetic self-test: ${a.failed>0?We.red(`${a.passed}/${a.total} FAIL`):We.green(`${a.passed}/${a.total} passed`)}`],w=a.results.filter((k)=>!k.passed);if(w.length>0){v.push(""),v.push(We.red("   Failures:"));for(let k of w)v.push(We.red(`   • ${k.description}`)),v.push(We.red(`     expected ${k.expected}, got ${k.actual}`))}return v.join(`
`)}function xy(a){if(a.length===0)return"   (no custom rules)";let p=["Source","Name","Command","Block Args"],v=a.map((w)=>[w.source,w.name,w.subcommand?`${w.command} ${w.subcommand}`:w.command,w.blockArgs.join(", ")]);return $n({headers:p,rows:v})}function bd(a){let p=[];if(p.push("Configuration"),p.push(ky(a.userConfig,a.projectConfig)),p.push(""),a.effectiveRules.length>0)p.push(`   Effective rules (${a.effectiveRules.length} total):`),p.push(xy(a.effectiveRules));else p.push("   Effective rules: (none - using built-in rules only)");for(let v of a.shadowedRules)p.push(""),p.push(`   Note: Project rule "${v.name}" shadows user rule with same name`);return p.join(`
`)}function ky(a,p){let v=["Scope","Status"],w=(M)=>{if(!M.exists)return We.dim("N/A");if(!M.valid)return We.red(`Invalid (${M.errors?.[0]??"unknown error"})`);return We.green("Configured")},k=[["User",w(a)],["Project",w(p)]];return $n({headers:v,rows:k})}function Ld(a){let p=[];return p.push("Environment"),p.push(_y(a)),p.join(`
`)}function wd(a){let p=a.effectiveSafety.policyScopes,v=["Effective Safety",`   Selected preset: ${a.effectiveSafety.selectedPreset}${p?` (${uo(p.levelScope)})`:""}`,`   Effective: ${a.effectiveSafety.level}`],w=[["fail_closed","fail_closed"],["paranoid_rm","paranoid_rm"],["paranoid_interpreters","paranoid_interpreters"]];for(let[k,M]of w){let G=a.effectiveSafety.capabilities[k],B=G.enabled?We.green("ON"):We.dim("OFF"),J=G.sources.length>0?` (${G.sources.join(", ")})`:"";v.push(`   ${M}: ${B} via ${G.source}${J}`)}if(p&&p.weakenings.length>0){v.push("   Project policy deltas:");for(let k of p.weakenings)v.push(`      ${k}`)}v.push(`   Stored rule customizations: ${a.effectiveSafety.ruleCounts.stored}`),v.push(`   Effective rule customizations: ${a.effectiveSafety.ruleCounts.effective}`);for(let[k,M]of Object.entries(a.effectiveSafety.ruleOverrides))v.push(`   ${k}: ${M}`);return v.join(`
`)}function xd(a){let p=["Findings"];if(a.length===0)return p.push("   No findings from inspected doctor facts."),p.join(`
`);for(let v of a){let w=`[${v.severity.toUpperCase()}] ${v.checkId}: ${zt(v.title)}`,k=v.severity==="error"?We.red:v.severity==="warning"?We.yellow:We.blue;if(p.push(`   ${k(w)}`),p.push(`      ${zt(v.detail)}`),v.path)p.push(`      Path: ${zt(v.path)}`);if(v.fixHint)p.push(`      Fix: ${zt(v.fixHint)}`)}return p.join(`
`)}function _y(a){let p=["Variable","Status","Legacy"],v=a.map((w)=>{let k=w.isSet?We.green("✓"):We.dim("✗"),M=w.legacyName&&w.legacyIsSet?`${w.legacyName} ${We.green("✓")}`:w.legacyName??"";return[w.name,k,M]});return $n({headers:p,rows:v})}function kd(a){let p=[];if(a.totalBlocked===0)p.push("Recent Activity"),p.push("   No blocked commands in the last 7 days"),p.push("   Tip: This is normal for new installations");else p.push(`Recent Activity · last 7 days (${a.totalBlocked} blocked / ${a.sessionCount} sessions)`),p.push(Sy(a.recentEntries));if(a.unreadable>0)p.push(`   Warning: ${a.unreadable} audit log ${a.unreadable===1?"source":"sources"} could not be read; this summary is incomplete`);return p.join(`
`)}function Sy(a){let p=["Time","Command"],v=a.map((w)=>{let k=zt(w.command.replace(/\r\n|\r|\n/g," ↵ ").replace(/\t/g," ")),M=k.length>40?`${k.slice(0,37)}...`:k;return[w.relativeTime,M]});return $n({headers:p,rows:v})}function _d(a){let p=[];if(p.push("Update Check"),a.latestVersion===null&&!a.error)return p.push(po([["Status",We.dim("Skipped")],["Installed",a.currentVersion]])),p.join(`
`);if(a.error)return p.push(po([["Status",`${We.yellow("⚠")} Error`],["Installed",a.currentVersion],["Error",We.dim(a.error)]])),p.join(`
`);if(a.updateAvailable)return p.push(po([["Status",`${We.yellow("⚠")} Update Available`],["Current",a.currentVersion],["Latest",We.green(a.latestVersion??"")]])),p.push(""),p.push("   Run: bunx cc-safety-net@latest doctor"),p.push("   Or:  npx cc-safety-net@latest doctor"),p.join(`
`);return p.push(po([["Status",`${We.green("✓")} Up to date`],["Version",a.currentVersion]])),p.join(`
`)}function po(a){return $n({rows:a})}function Sd(a){let p=[];return p.push("System Info"),p.push(Cy(a)),p.join(`
`)}function Cy(a){let p=["Component","Version"],v=(M)=>{if(M===null)return We.dim("not found");return M},k=[{label:"cc-safety-net",value:a.version},...rt.map((M)=>({label:d(M),value:a.versions[M]??null})),{label:"Node.js",value:a.nodeVersion},{label:"npm",value:a.npmVersion},{label:"Bun",value:a.bunVersion},{label:"Platform",value:a.platform}].map((M)=>[M.label,v(M.value)]);return $n({headers:p,rows:k})}function Cd(a){if(a.findings.length===0)return We.green(`
No findings from inspected doctor facts.`);let p={error:a.findings.filter((M)=>M.severity==="error").length,warning:a.findings.filter((M)=>M.severity==="warning").length,info:a.findings.filter((M)=>M.severity==="info").length},v=["error","warning","info"].filter((M)=>p[M]>0).map((M)=>`${p[M]} ${M}`),w=a.findings.length===1?"finding":"findings",k=`
${a.findings.length} ${w}: ${v.join(", ")}.`;if(p.error>0)return We.red(k);if(p.warning>0)return We.yellow(k);return We.blue(k)}import{lstatSync as Py}from"node:fs";import{dirname as Hs}from"node:path";function Zs(a,p){try{let v=Py(p);if(v.isSymbolicLink())return{kind:a,path:p,status:"unsafe",issues:["symlink"]};if(!v.isDirectory())return{kind:a,path:p,status:"unsafe",issues:["not-directory"]};if(process.platform==="win32"||typeof process.getuid!=="function")return{kind:a,path:p,status:"unknown",issues:[]};let w=[...v.uid!==process.getuid()?["ownership"]:[],...(v.mode&18)!==0?["permissions"]:[]];return{kind:a,path:p,status:w.length>0?"unsafe":"safe",issues:w}}catch(v){if(typeof v==="object"&&v!==null&&"code"in v&&v.code==="ENOENT")return{kind:a,path:p,status:"not-applicable",issues:[]};return{kind:a,path:p,status:"unknown",issues:[]}}}function Pd(a,p){let v=K(a);return{directories:[Zs("policy",Hs(Hs(p))),Zs("config",Hs(p)),...v?[Zs("audit",v)]:[{kind:"audit",status:"unknown",issues:[]}]]}}import{spawn as $y}from"node:child_process";import{existsSync as $d}from"node:fs";import{delimiter as Ey,extname as Ry,join as Dy}from"node:path";import{stripVTControlCharacters as Ed}from"node:util";var Dd="2.3.4",Ay=5000,Ty="_CC_SAFETY_NET_TEST_SPAWN_PLATFORM";function jt(){return Dd}function Gs(a,p){let v=a[p];if(v)return v;let w=Object.keys(a).find((k)=>k.toLowerCase()===p.toLowerCase()&&!!a[k]);return w?a[w]:v}function Iy(a){return(Gs(a,"PATHEXT")||".COM;.EXE;.BAT;.CMD").split(";").filter((p)=>p.length>0)}function Oy(a,p){let v=Ry(a)?[a]:[...Iy(p).map((w)=>`${a}${w}`),a];if(a.includes("/")||a.includes("\\"))return v.find((w)=>$d(w))??a;return(Gs(p,"PATH")??"").split(Ey).flatMap((w)=>v.map((k)=>Dy(w,k))).find((w)=>$d(w))??a}function Rd(a){if(!/[\s"&|<>^]/.test(a))return a;return`"${a.replace(/"/g,'""')}"`}function En(a,p){let[v,...w]=a,k=p[Ty]==="win32"?"win32":process.platform;if(!v||k!=="win32")return{cmd:v??"",args:w};let M=Oy(v,p);if(!/\.(?:bat|cmd)$/i.test(M))return{cmd:M,args:w};return{cmd:Gs(p,"COMSPEC")??"cmd.exe",args:["/d","/c",["call",Rd(M),...w.map(Rd)].join(" ")]}}var Bn=async(a,p=Ay)=>{let v=await jy(a,{timeoutMs:p});if(v.code!==0)return null;return Ed(v.stdout).trim()||Ed(v.stderr).trim()||null};function jy(a,p){let[v,...w]=a;if(!v)return Promise.resolve({code:null,stdout:"",stderr:""});return new Promise((k)=>{try{let M=En([v,...w],process.env),G=$y(M.cmd,M.args,{stdio:["ignore","pipe","pipe"]}),B=!1,J="",se="";G.stdout.on("data",(le)=>{J+=le.toString()}),G.stderr.on("data",(le)=>{se+=le.toString()});let ae=(le)=>{if(B)return;B=!0,clearTimeout(ce),k(le)},ce=setTimeout(()=>{G.kill(),ae({code:null,stdout:J,stderr:se})},p.timeoutMs);G.on("close",(le)=>{ae({code:le,stdout:J,stderr:se})}),G.on("error",()=>{ae({code:null,stdout:J,stderr:se})})}catch{k({code:null,stdout:"",stderr:""})}})}function fo(a){if(!a)return null;let p=/Claude Code\s+(\d+\.\d+\.\d+)/i.exec(a);if(p)return p[1]??null;let v=/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(a);if(v)return v[1]??null;return a.split(`
`)[0]?.trim()||null}async function mr(a=Bn){let[p,v,w,k,M,G]=await Promise.all([Promise.all(W.map(async(B)=>[B.id,fo(await a([...B.probeCommand]))])),a(["codex","plugin","list"],30000),a(["amp","plugins","list"],30000),a(["node","--version"]),a(["npm","--version"]),a(["bun","--version"])]);return{version:Dd,versions:Object.fromEntries(p),codexPluginListOutput:v,ampPluginListOutput:w,nodeVersion:fo(k),npmVersion:fo(M),bunVersion:fo(G),platform:`${process.platform} ${process.arch}`}}function Bs(a,p){if(p==="dev")return!1;let v=a.split(".").map(Number),w=p.split(".").map(Number),[k=0,M=0,G=0]=v,[B=0,J=0,se=0]=w;if(k!==B)return k>B;if(M!==J)return M>J;return G>se}async function bn(){let a=jt(),p=new AbortController,v=setTimeout(()=>p.abort(),3000);try{let w=await fetch("https://registry.npmjs.org/cc-safety-net/latest",{signal:p.signal});if(!w.ok)return{currentVersion:a,latestVersion:null,updateAvailable:!1,error:`npm registry returned ${w.status}`};let k=await w.json(),M=Bs(k.version,a);return{currentVersion:a,latestVersion:k.version,updateAvailable:M}}catch(w){return{currentVersion:a,latestVersion:null,updateAvailable:!1,error:w instanceof Error?w.message:"Network error"}}finally{clearTimeout(v)}}import*as Fd from"node:readline";var Od=(a)=>`\x1B[${a}B`,Ny=(a)=>`\x1B[${a}A`;var Ad=["░","▒","▓","╱","╲","┃","━","┏","┓","┗","┛","╋"];function zy(a){return new Promise((p)=>setTimeout(p,a))}function Fy(a,p,v){if(!v)return p(a);if(v.aborted)return Promise.resolve();return new Promise((w,k)=>{let M=()=>v.removeEventListener("abort",G),G=()=>{M(),w()};v.addEventListener("abort",G,{once:!0}),p(a).then(()=>{M(),w()},(B)=>{M(),k(B)})})}function gr(a,p){return a&&a>0?a:p}function mo(a){return Math.max(0,Math.min(1,a))}function qn(a){return Math.max(0,Math.min(255,Math.round(a)))}function qs(a){return a<=0.0031308?12.92*a:1.055*a**0.4166666666666667-0.055}function My(a,p,v){let w=v*Math.PI/180,k=p*Math.cos(w),M=p*Math.sin(w),G=(a+0.3963377774*k+0.2158037573*M)**3,B=(a-0.1055613458*k-0.0638541728*M)**3,J=(a-0.0894841775*k-1.291485548*M)**3;return{blue:qn(qs(mo(-0.0041960863*G-0.7034186147*B+1.707614701*J))*255),green:qn(qs(mo(-1.2684380046*G+2.6097574011*B-0.3413193965*J))*255),red:qn(qs(mo(4.0767416621*G-3.3077115913*B+0.2309699292*J))*255)}}function Vs(a,p){let v=(p*a*180/Math.PI%360+360)%360;return My(0.72,0.15,v)}function jd(a,p=0.1){let v=Vs(p,a);return`\x1B[38;2;${v.red};${v.green};${v.blue}m`}function Uy(a,p){return{blue:qn(a.blue+(255-a.blue)*p),green:qn(a.green+(255-a.green)*p),red:qn(a.red+(255-a.red)*p)}}function Nd(a,p,v){let w=Math.imul(a+2654435769,2246822507)^Math.imul(p+3266489909,668265263)^Math.imul(v+374761393,2654435761),k=w^w>>>15,M=Math.imul(k,739982445),G=M^M>>>12,B=Math.imul(G,695872825);return((B^B>>>15)>>>0)/4294967296}function Hy(a,p,v){let w=Math.floor(Nd(a,p,v)*Ad.length);return Ad[w]??"░"}function Td(a){let p=mo(a);return p*p*p*(p*(p*6-15)+10)}function Zy(a){if(a.length===0)return"";let p=[],v=!1,w="";for(let k of a){let M=`${k.red};${k.green};${k.blue}`;if(k.bold!==v)p.push(k.bold?"\x1B[1m":"\x1B[22m"),v=k.bold;if(M!==w)p.push(`\x1B[38;2;${M}m`),w=M;p.push(k.character)}return`${p.join("")}\x1B[22m\x1B[39m`}function Gy(a,p,v,w,k){return a.map((M,G)=>({...Vs(v,w+p+G/k),bold:!1,character:M}))}function By(a,p,v,w,k,M,G,B){let J=Math.max(1,w*0.75),se=Math.min(1,v/J),ae=k*Td(se),ce=Math.max(0,(v-J)/Math.max(1,w-J)),le=(1-Td(v/w))*B*2,he=0.35*Math.max(0,1-ce*2),be=se>=1,ve=Math.min(a.length,Math.ceil(ae+2+1));return a.slice(0,ve).map((_e,Be)=>{let Ue=Vs(M,G+p+Be/B+le),Oe=Be+Nd(p,Be,7919)*2-1;if(Oe>ae+2)return{...Ue,bold:!1,character:" "};let Lt=ae-Oe,Je=0.8*Math.exp(-(Lt*Lt)/12.5),Rt=Math.min(0.9,Je+he),cn=!be&&Oe>ae-4;return{...Uy(Ue,Rt),bold:Rt>0.3,character:cn?Hy(p,Be,v):_e}})}function Id(a){return`\x1B[?2026h${a.map((p,v)=>`\x1B8${v>0?Od(v):""}${Zy(p)}`).join("")}\x1B[?2026l`}async function Js(a,p={}){if(!a)return;let v=p.output??process.stdout,w=p.sleep??zy,k=gr(p.frequency,0.1),M=p.seed??0,G=gr(p.speed,40),B=gr(p.spread,3),J=gr(p.frameRate,60),se=Math.max(1,Math.floor(gr(p.duration,12))),ae=a.split(`
`).map((ve)=>Array.from(ve)),ce=Math.max(...ae.map((ve)=>ve.length)),le=1000*se*ae.filter((ve)=>ve.length>0).length/G,he=ce>0?Math.max(1,Math.ceil(le/(1000/J))):0,be=he>0?le/he:0;v.write(`\x1B[?25l${ae.length>1?`${`
`.repeat(ae.length-1)}${Ny(ae.length-1)}`:""}\x1B7`);try{for(let ve=1;ve<=he;ve+=1){if(p.signal?.aborted)break;v.write(Id(ae.map((_e,Be)=>By(_e,Be,ve,he,ce,k,M,B)))),await Fy(be,w,p.signal)}}finally{if(v.write(Id(ae.map((ve,_e)=>Gy(ve,_e,k,M,B)))),v.write("\x1B8"),ae.length>1)v.write(Od(ae.length-1));v.write(`
\x1B[0m\x1B[?25h`)}}var zd=["┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛","┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ","━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "].join(`
`);function qy(a){return Boolean(a.isTTY)}async function hr(a={}){let p=a.output??process.stdout;if(!qy(p))return;let v=a.input??process.stdin,w={duration:a.duration,frequency:a.frequency,output:p,seed:a.seed??Math.random()*8192,sleep:a.sleep,speed:a.speed,spread:a.spread};if(!v.isTTY||typeof v.setRawMode!=="function"){await Js(zd,w);return}let k=new AbortController,M=v.readableFlowing===!0,G=v.isRaw===!0,B=!1,J=(se,ae)=>{if(ae.ctrl&&ae.name==="c")B=!0;if(B||ae.name==="return"||ae.name==="enter")k.abort()};Fd.emitKeypressEvents(v),v.on("keypress",J),v.setRawMode(!0),v.resume();try{await Js(zd,{...w,signal:k.signal})}finally{if(v.off("keypress",J),v.setRawMode(G),!M)v.pause()}if(!B)return;if(a.onInterrupt){a.onInterrupt();return}process.kill(process.pid,"SIGINT")}import{createHash as Yy}from"node:crypto";import{existsSync as Hd}from"node:fs";import{dirname as go,join as Zd}from"node:path";import{dirname as Md,join as Vy,resolve as Jy}from"node:path";var Wy="rule.lock";function Ky(a){return Vy(Md(a),Wy)}function Ud(a={}){return Jy(a.cwd??process.cwd(),".safety-net.json")}function Ht(a,p){let v=p.global?p.userConfigPath??U(a,p):p.projectConfigPath??H(p.cwd??process.cwd()),w=p.global?ct(a,p):ut(v,p.cwd??process.cwd()),k=Ky(v);return{configDir:Md(v),configPath:v,lockPath:k,filesystemScope:w,configTarget:i(w,v),lockTarget:i(w,k)}}var Xy="`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.",Qy="cache",e0="rulebooks";function Gd(a,p={}){let v=Ht(a,p),w=i(v.filesystemScope,qd(v.configDir)),k=r(v.lockTarget);if(console.log(Xy),k===null&&!Hd(w.path))return console.log(`No v2 lock or cache leftovers found in ${go(v.configDir)}; nothing to migrate.`),0;let M=s0(k),G=x(v.configTarget);if(!G.config&&(r(v.configTarget)!==null||M.size>0))return console.error(`Cannot migrate: the rules config in ${go(v.configDir)} is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.`),1;let B=G.config?.rules??[];for(let J of B.flatMap((se)=>t0(se,M,v,w,p.global===!0)))console.log(J);return Y(v.lockTarget),ht(w),console.log(`Removed the v2 lock and cache under ${go(v.configDir)}.`),0}function Bd(a,p){return[...new Set([{cwd:p},{cwd:p,global:!0}].flatMap((v)=>{let w=Ht(a,v);return[w.lockPath,qd(w.configDir)]}))].filter((v)=>Hd(v))}function t0(a,p,v,w,k){if(!T(a))return[];let M=Z(a).name,G=i(v.filesystemScope,q(v.configDir,M)),B=r(G);if(B!==null&&n0(B,M))return[];let J=p.get(a),se=J?r0(J,M,w.path,v.filesystemScope):null;if(se===null)return[`Could not migrate ${a} from the v2 cache. Run \`cc-safety-net rule update ${a}${k?" --global":""}\` to vendor it.`];if(C(G,se),B!==null)return[`Restored ${a} from the v2 cache over an invalid file.`];return[`Vendored ${a} from the v2 cache.`]}function n0(a,p){let v=Te(a);return!("problem"in v)&&v.rulebook.name===p}function r0(a,p,v,w){let k=Zd(v,e0,`${o0(a)}--${a.digest.replace("sha256:","").slice(0,12)}`,Ee),M=r(i(w,k));if(M===null||c0(M)!==a.digest)return null;let G=Te(M);if("problem"in G||G.rulebook.name!==p)return null;return M}function qd(a){return Zd(go(a),Qy)}function o0(a){return([a.owner,a.repo,a.display_ref,a.name].every((w)=>typeof w==="string"&&w!=="")?`${a.owner}/${a.repo}#${a.display_ref}/${a.name}`:a.spec).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"rulebook"}function s0(a){let p=a===null?null:a0(a),v=Vd(p)&&Array.isArray(p.rulebooks)?p.rulebooks:[];return new Map(v.filter(i0).map((w)=>[w.spec,w]))}function i0(a){return Vd(a)&&typeof a.spec==="string"&&typeof a.digest==="string"}function Vd(a){return!!a&&typeof a==="object"}function a0(a){try{return JSON.parse(a)}catch{return null}}function c0(a){return`sha256:${Yy("sha256").update(a).digest("hex")}`}var Jd="\r\x1B[2K",l0="\x1B[?25l",u0="\x1B[39m",d0="\x1B[?25h",p0=100,f0=0.55,m0=80,Wd=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function g0(a){return new Promise((p)=>setTimeout(p,a))}async function ho(a,p={}){let v=p.output??process.stdout;if(!v.isTTY)return a;let w=p.sleep??g0,k=!1,M=a.then((B)=>(k=!0,B),(B)=>{throw k=!0,B});if(await Promise.race([M.then(()=>!0),w(p0).then(()=>!1)]))return M;v.write(l0);try{for(let B=0;!k;B+=1)v.write(`${Jd}${jd(B*f0)}${Wd[B%Wd.length]}${u0} ${p.loadingMessage??"Loading…"}`),await Promise.race([M,w(m0)]);return await M}finally{v.write(`${Jd}${d0}`)}}async function yr(a,p,v,w={}){let k=p();if(a)await v();if(a&&k.ready)await ho(k.ready,w);return k.finish()}import{stripVTControlCharacters as h0}from"node:util";var yo="amp plugins list",y0=/^\s*[✓✗]\s+cc-safety-net(?:\.ts)?\s+\(User Plugins\)\s+(\S+)\s*$/;function Kd(a){if(!a.ampPluginListOutput)return{platform:"amp",status:"n/a"};let p=h0(a.ampPluginListOutput).split(`
`).map((v)=>y0.exec(v)?.[1]).find((v)=>v!==void 0);if(!p)return{platform:"amp",status:"n/a"};if(p!=="active")return{platform:"amp",status:"disabled",method:yo,configPath:yo,errors:[`Amp personal plugin cc-safety-net is ${p}; run "plugins: reload" in Amp or reinstall with install --amp`]};return{platform:"amp",status:"configured",method:yo,configPath:yo}}import{existsSync as v0,readFileSync as b0}from"node:fs";var L0=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;function w0(a){if(!a||typeof a!=="object"||Array.isArray(a))return[];return Object.values(a).flatMap((p)=>{if(!p||typeof p!=="object"||Array.isArray(p))return[];let v=p,w=v.PreToolUse;if(!Array.isArray(w))return[];return w.flatMap((k)=>{if(!k||typeof k!=="object"||Array.isArray(k))return[];let M=k.hooks;if(!Array.isArray(M))return[];return M.flatMap((G)=>{if(!G||typeof G!=="object"||Array.isArray(G))return[];let B=G.command;if(typeof B!=="string"||!L0.test(B))return[];return[{command:B,enabled:v.enabled!==!1}]})})})}function Yd(a){let p=Ge(a.environment.home);if(!v0(p))return{platform:"antigravity-cli",status:"n/a",configPath:p};let v;try{v=w0(JSON.parse(b0(p,"utf-8")))}catch(w){return{platform:"antigravity-cli",status:"n/a",configPath:p,errors:[`Failed to parse Antigravity hooks config ${p}: ${w instanceof Error?w.message:String(w)}`]}}if(v.some((w)=>w.enabled))return{platform:"antigravity-cli",status:"configured",method:"hook config",configPath:p};if(v.length>0)return{platform:"antigravity-cli",status:"disabled",method:"hook config",configPath:p};return{platform:"antigravity-cli",status:"n/a",configPath:p}}import{join as Xd}from"node:path";import{existsSync as x0,lstatSync as k0,readFileSync as _0}from"node:fs";function nn(a,p=(v)=>v){if(!x0(a))return{kind:"missing"};try{return{kind:"ok",value:JSON.parse(p(_0(a,"utf-8")))}}catch{return{kind:"unreadable"}}}function Ot(a){try{return k0(a)}catch{return}}function vo(a,p){let v=Ot(p);if(!v)return{platform:a,status:"n/a",configPath:p};if(!v.isSymbolicLink()&&v.isDirectory())return;return{platform:a,status:"n/a",configPath:p,errors:[`${p} is a symlink or not a directory; move or remove it before installing`]}}function _t(a,p){return typeof a==="object"&&a!==null?a[p]:void 0}var Ws="cc-safety-net@cc-marketplace";function Qd(a){return Xd(a.home,".claude","plugins","installed_plugins.json")}function ep(a,p){let v=_t(_t(a,"plugins"),p);return Array.isArray(v)&&v.length>0}function bo(a,p){let v=nn(Qd(a));return v.kind==="ok"&&ep(v.value,p)}function Ks(a){let p=Qd(a),v=nn(p);if(v.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(v.kind==="missing")return{platform:"claude-code",status:"n/a"};if(!ep(v.value,Ws))return{platform:"claude-code",status:"n/a"};let w=Xd(a.home,".claude","settings.json"),k=nn(w);if(k.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(!(k.kind==="ok"&&_t(_t(k.value,"enabledPlugins"),Ws)===!0))return{platform:"claude-code",status:"disabled",method:"plugin config",configPath:w,errors:[`${Ws} is installed but not enabled in Claude Code`]};return{platform:"claude-code",status:"configured",method:"plugin config",configPath:p}}function tp(a){return Ks(a.environment)}function np(a){if(!a.codexPluginListOutput)return{platform:"codex",status:"n/a"};let p=a.codexPluginListOutput.split(`
`).find((v)=>v.includes("https://github.com/kenryu42/cc-safety-net.git"));if(!p)return{platform:"codex",status:"n/a"};if(!p.includes("installed,"))return{platform:"codex",status:"n/a"};if(!p.includes("installed, enabled"))return{platform:"codex",status:"disabled",method:"codex plugin list",configPath:"codex plugin list",errors:["Codex plugin line for https://github.com/kenryu42/cc-safety-net.git must contain installed, enabled."]};return{platform:"codex",status:"configured",method:"codex plugin list",configPath:"codex plugin list"}}import{existsSync as So,readdirSync as S0,readFileSync as C0}from"node:fs";import{join as Mt}from"node:path";function qt(a){let p="",v=0,w=!1,k=!1,M=-1;while(v<a.length){let G=a[v],B=a[v+1];if(k){p+=G,k=!1,v++;continue}if(G==='"'&&!w){w=!0,M=-1,p+=G,v++;continue}if(G==='"'&&w){w=!1,p+=G,v++;continue}if(G==="\\"&&w){k=!0,p+=G,v++;continue}if(w){p+=G,v++;continue}if(G==="/"&&B==="/"){while(v<a.length&&a[v]!==`
`)v++;continue}if(G==="/"&&B==="*"){v+=2;while(v<a.length-1){if(a[v]==="*"&&a[v+1]==="/"){v+=2;break}v++}continue}if(G===","){M=p.length,p+=G,v++;continue}if(G==="}"||G==="]"){if(M!==-1){let J=p.slice(M+1);if(/^\s*$/.test(J))p=p.slice(0,M)+J}M=-1,p+=G,v++;continue}if(!/\s/.test(G))M=-1;p+=G,v++}return p}function Ys(a,p,v){let w=p+1,k=!1;while(w<a.length){if(k){k=!1,w++;continue}if(a[w]==="\\"){k=!0,w++;continue}if(a[w]==='"')return w+1;w++}throw Error(v)}function Xs(a,p,v){let w=a[p],k=w==="["?"]":"}",M=0,G=p;while(G<a.length){let B=v.skipComment?.(a,G)??G;if(B!==G){G=B;continue}if(a[G]==='"'){G=Ys(a,G,v.stringError);continue}if(a[G]===w)M++;if(a[G]===k){if(M--,M===0)return G}G++}throw Error(v.bracketError)}function op(a,p){let v=a.lastIndexOf(`
`,p)+1;return/^[ \t]*/.exec(a.slice(v))?.[0]??""}function wo(a,p){let v=p.end+(/^\s*/.exec(a.slice(p.end))?.[0].length??0);if(a[v]===","){let G=a[v+1]===`
`?v+2:v+1;return`${a.slice(0,p.start)}${a.slice(G)}`}let w=a.slice(0,p.start).search(/\s*$/)-1;if(a[w]!==",")return`${a.slice(0,p.start)}${a.slice(p.end)}`;let k=a.lastIndexOf(`
`,w-1),M=k!==-1&&/^\s*$/.test(a.slice(k+1,w))?k:w;return`${a.slice(0,M)}${a.slice(p.end)}`}function Lo(a,p){if(a.startsWith("//",p)){let v=a.indexOf(`
`,p+2);return v===-1?a.length:v+1}if(a.startsWith("/*",p)){let v=a.indexOf("*/",p+2);return v===-1?a.length:v+2}return p}function rp(a,p){let v=p;while(v<a.length){if(/\s/.test(a[v]??"")){v++;continue}let w=Lo(a,v);if(w===v)return v;v=w}return v}function sp(a,p,v){let w=0,k=0;while(k<a.length){let M=Lo(a,k);if(M!==k){k=M;continue}if(a[k]==='"'){let G=Ys(a,k,v.stringError);if(w===1&&JSON.parse(a.slice(k,G))===p){let B=rp(a,G),J=rp(a,B+1);if(a[B]===":"&&a[J]==="[")return{start:J,end:Xs(a,J,{skipComment:Lo,...v})}}k=G;continue}if(a[k]==="{"||a[k]==="[")w++;if(a[k]==="}"||a[k]==="]")w--;k++}return}function ip(a,p,v){let w=[],k=p.start+1;while(k<p.end){let M=Lo(a,k);if(M!==k){k=M;continue}if(a[k]==='"'){let G=Ys(a,k,v),B=JSON.parse(a.slice(k,G));if(typeof B==="string")w.push({range:{start:k,end:G},value:B});k=G;continue}k++}return w}var rn="cc-safety-net@cc-marketplace",xo=["cc-marketplace","cc-safety-net"],ap=["_direct","copilot-safety-net"],cp=["cc-marketplace","safety-net"],lp="safety-net@cc-marketplace";function ko(a,p){let v=p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(^|[^a-z0-9-])${v}([^a-z0-9-]|$)`,"m").test(a??"")}function up(a){return ko(a,"cc-safety-net@cc-marketplace")}function dp(a){return ko(a,"cc-marketplace")}function pp(a){return ko(a,"copilot-safety-net")}function fp(a){return ko(a,"safety-net@cc-marketplace")}function Qs(a){if(!a?.includes("cc-safety-net"))return!1;return/(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(a)}function gp(a,p){if(!a)return null;let v=a.match(/(\d+)\.(\d+)\.(\d+)/);if(!v)return null;let w=[Number(v[1]),Number(v[2]),Number(v[3])];for(let k=0;k<p.length;k++){let M=w[k]??0,G=p[k]??0;if(M!==G)return M>G}return!0}function P0(a){return gp(a,[0,0,422])}function $0(a){return gp(a,[1,0,8])}function vr(a){return a.env.get("COPILOT_HOME")||Mt(a.home,".copilot")}function ei(a){return(a.hooks?.preToolUse??[]).some((v)=>{if(v.type!=="command")return!1;return Qs(v.command)||Qs(v.bash)||Qs(v.powershell)})}function _o(a){return a===void 0||typeof a==="string"}function E0(a){if(!a||typeof a!=="object"||Array.isArray(a))return!1;let p=a;if(p.disableAllHooks!==void 0&&typeof p.disableAllHooks!=="boolean")return!1;if(p.hooks===void 0)return!0;if(!p.hooks||typeof p.hooks!=="object"||Array.isArray(p.hooks))return!1;let v=p.hooks.preToolUse;if(v===void 0)return!0;return Array.isArray(v)&&v.every((w)=>w!==null&&typeof w==="object"&&!Array.isArray(w)&&_o(w.type)&&_o(w.command)&&_o(w.bash)&&_o(w.powershell))}function ti(a,p){try{let v=JSON.parse(qt(C0(a,"utf-8")));if(!E0(v)){p?.push(`Invalid hook config ${a}: hooks.preToolUse must be an array of hook objects`);return}return v}catch(v){p?.push(`Failed to parse ${a}: ${v instanceof Error?v.message:String(v)}`);return}}function hp(a,p){try{return S0(a).filter((v)=>v.endsWith(".json")).sort((v,w)=>v.localeCompare(w))}catch(v){return p?.push(`Failed to read ${a}: ${v instanceof Error?v.message:String(v)}`),[]}}function R0(a,p){if(!So(a))return[];let v=[];for(let w of hp(a,p)){let k=Mt(a,w),M=ti(k,p);if(M&&ei(M))v.push(k)}return v}function Vn(a,p){if(!So(a))return;let v=ti(a,p);if(!v)return;return{path:a,config:v}}function mp(a,p,v,w){if(p){a.push(`GitHub Copilot CLI ${p} does not support ${v}; requires ${w}+`);return}a.push(`GitHub Copilot CLI version unavailable; skipping ${v} because it requires ${w}+`)}function D0(a){for(let p of a){if(p?.config.disableAllHooks===!0)return p.path;if(p?.config.disableAllHooks===!1)return}return}function A0(a,p,v,w){let k=vr(a),M=Mt(p,".github","hooks"),G=Mt(k,"hooks"),B=Mt(p,".github","copilot"),J=Mt(p,".claude"),se=$0(v),ae=se===!0?w:void 0,ce=[Vn(Mt(B,"settings.local.json"),ae),Vn(Mt(B,"settings.json"),ae),Vn(Mt(J,"settings.local.json"),ae),Vn(Mt(J,"settings.json"),ae)],le=[Vn(Mt(k,"settings.json"),ae),Vn(Mt(k,"config.json"),ae)];if(se!==!1){let Lt=D0([...ce,...le]);if(Lt){if(se===null)w.push(`GitHub Copilot CLI version unavailable; treating disableAllHooks in ${Lt} as active`);return{activeConfigPaths:[],disabledBy:Lt}}}let he=R0(M,w),be=P0(v),ve=be===!0?w:void 0,_e=So(G)?hp(G,ve):[],Be=[];for(let Lt of _e){let Je=Mt(G,Lt),Rt=ti(Je,ve);if(Rt&&ei(Rt))Be.push(Je)}if(be!==!0&&Be.length>0)mp(w,v,`user hook files in ${G}`,"0.0.422"),Be.length=0;let Ue=[];for(let Lt of[...ce,...le]){if(!Lt)continue;if(!ei(Lt.config))continue;if(se===!0){Ue.push(Lt);continue}mp(w,v,"inline hook definitions in Copilot config files","1.0.8");break}let Oe=(Lt)=>Lt.filter((Je)=>!!Je&&Ue.includes(Je)).map((Je)=>Je.path);return{activeConfigPaths:[...Oe(ce),...he,...Oe(le),...Be]}}function yp(a){let p=[],v=A0(a.environment,a.cwd,a.copilotCliVersion,p);if(v.disabledBy)return{platform:"copilot-cli",status:"disabled",method:"hook config",configPath:v.disabledBy,configPaths:[v.disabledBy],errors:p.length>0?p:void 0};let w=vr(a.environment),k=Mt(w,"installed-plugins",...xo),M=So(k),G=Mt(w,"settings.json"),B=nn(G,qt);if(M&&B.kind==="unreadable")return{platform:"copilot-cli",status:"not-inspected"};if(M&&B.kind==="ok"&&_t(_t(B.value,"enabledPlugins"),rn)===!1)return{platform:"copilot-cli",status:"disabled",method:"plugin config",configPath:G,errors:[`${rn} is installed but not enabled in Copilot CLI`]};if(M||v.activeConfigPaths.length>0){let J=M,se=v.activeConfigPaths[0];return{platform:"copilot-cli",status:"configured",method:J?"plugin config":"hook config",configPath:se??(J?k:void 0),configPaths:v.activeConfigPaths.length>0?v.activeConfigPaths:void 0,errors:p.length>0?p:void 0}}return{platform:"copilot-cli",status:"n/a",errors:p.length>0?p:void 0}}import{existsSync as H0,readFileSync as Z0}from"node:fs";import{existsSync as vp,mkdirSync as O0,readFileSync as j0}from"node:fs";import{dirname as N0,join as z0}from"node:path";import{renameSync as T0,writeFileSync as I0}from"node:fs";function Nt(a,p){let v=`${a}.${process.pid}.tmp`;I0(v,p),T0(v,a)}var on=Object.fromEntries(ke.map((a)=>[a.id,`npx -y cc-safety-net hook ${a.flags[1]}`]));var br=on.cursor,bp=30;function Po(a){return z0(a.home,".cursor","hooks.json")}function Rn(a){return typeof a==="object"&&a!==null&&!Array.isArray(a)}function ni(){return{command:br,timeout:bp,failClosed:!0}}function Co(a){return Rn(a)&&a.command===br}function F0(a){return Object.keys(a).length===3&&a.command===br&&a.timeout===bp&&a.failClosed===!0}function M0(a){try{return JSON.parse(j0(a,"utf-8"))}catch(p){if(p instanceof SyntaxError)throw Error(`Failed to parse Cursor hooks config ${a}: ${p.message}`);throw p}}function Lp(a){let p=M0(a);if(!Rn(p))throw Error(`Cursor hooks config ${a} must be a JSON object`);if(p.version!==1)throw Error(`Cursor hooks config ${a} must set "version": 1`);if(p.hooks!==void 0&&!Rn(p.hooks))throw Error(`Cursor hooks config ${a} "hooks" must be an object`);let v=Rn(p.hooks)?p.hooks.preToolUse:void 0;if(v!==void 0&&!Array.isArray(v))throw Error(`Cursor hooks config ${a} "hooks.preToolUse" must be an array`);return p}function wp(a){let p=Rn(a.hooks)?a.hooks.preToolUse:void 0;return Array.isArray(p)?p:[]}function U0(a){if(!a.some(Co))return[...a,ni()];return a.reduce((p,v)=>{if(!Co(v))return p.result.push(v),p;if(!p.inserted)p.result.push(ni()),p.inserted=!0;return p},{result:[],inserted:!1}).result}function xp(a,p,v){let w=Rn(p.hooks)?p.hooks:{},k={...p,hooks:{...w,preToolUse:v}};Nt(a,`${JSON.stringify(k,null,2)}
`)}function kp(a){let p=Po(a);if(!vp(p))return O0(N0(p),{recursive:!0}),Nt(p,`${JSON.stringify({version:1,hooks:{preToolUse:[ni()]}},null,2)}
`),{path:p,alreadyInstalled:!1};let v=Lp(p),w=wp(v),k=w.filter(Co);if(Rn(v.hooks)&&Array.isArray(v.hooks.preToolUse)&&k.length===1&&k[0]!==void 0&&F0(k[0]))return{path:p,alreadyInstalled:!0};return xp(p,v,U0(w)),{path:p,alreadyInstalled:!1}}function _p(a){let p=Po(a);if(!vp(p))return{path:p,alreadyInstalled:!1};let v=Lp(p),w=wp(v),k=w.filter((M)=>!Co(M));if(k.length===w.length)return{path:p,alreadyInstalled:!1};return xp(p,v,k),{path:p,alreadyInstalled:!0}}function G0(a){if(!a||typeof a!=="object"||Array.isArray(a))return[];let p=a.hooks;if(!p||typeof p!=="object"||Array.isArray(p))return[];let v=p.preToolUse;if(!Array.isArray(v))return[];return v.filter((w)=>!!w&&typeof w==="object"&&!Array.isArray(w)&&w.command===br)}function B0(a){let p=[];if(a.length>1)p.push("Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates");let v=a[0];if(v&&v.failClosed!==!0)p.push('Managed hook is missing "failClosed": true; reinstall to repair');if(v&&v.timeout!==30)p.push('Managed hook "timeout" is not 30; reinstall to repair');return p}function Sp(a){let p=Po(a.environment);if(!H0(p))return{platform:"cursor",status:"n/a",configPath:p};let v;try{v=JSON.parse(Z0(p,"utf-8"))}catch(M){return{platform:"cursor",status:"n/a",configPath:p,errors:[`Failed to parse Cursor hooks config ${p}: ${M instanceof Error?M.message:String(M)}`]}}let w=G0(v);if(w.length===0)return{platform:"cursor",status:"n/a",configPath:p};let k=B0(w);return{platform:"cursor",status:"configured",method:"hook config",configPath:p,errors:k.length>0?k:void 0}}import{existsSync as q0}from"node:fs";import{join as ri}from"node:path";var oi="gemini-safety-net";function si(a){let p=ri(a.home,".gemini","extensions"),v=ri(p,oi);if(!q0(v))return{platform:"gemini-cli",status:"n/a"};let w=ri(p,"extension-enablement.json"),k=nn(w);if(k.kind==="unreadable")return{platform:"gemini-cli",status:"not-inspected"};let M=k.kind==="ok"?_t(_t(k.value,oi),"overrides"):void 0;if(Array.isArray(M)&&M.some((B)=>typeof B==="string"&&B.startsWith("!")))return{platform:"gemini-cli",status:"disabled",method:"extension config",configPath:w,errors:[`${oi} is disabled in Gemini CLI`]};return{platform:"gemini-cli",status:"configured",method:"extension config",configPath:v}}function Cp(a){return si(a.environment)}import{existsSync as K0,readFileSync as Y0}from"node:fs";import{existsSync as $p,mkdirSync as V0,readFileSync as Ep,rmSync as J0}from"node:fs";import{dirname as W0,join as Pp}from"node:path";var Lr=on["grok-build"],Ro=30;function Do(a){return Pp(a.env.get("GROK_HOME")??Pp(a.home,".grok"),"hooks","cc-safety-net.json")}function Dn(a){return typeof a==="object"&&a!==null&&!Array.isArray(a)}function $o(){return{hooks:[{type:"command",command:Lr,timeout:Ro}]}}function Rp(a){return Dn(a)&&a.command===Lr}function Dp(a){return a.flatMap((p)=>{if(!Dn(p)||!Array.isArray(p.hooks))return[p];let v=p.hooks.filter((w)=>!Rp(w));if(v.length===p.hooks.length)return[p];return v.length===0?[]:[{...p,hooks:v}]})}function Ap(a){try{let p=JSON.parse(a);return Dn(p)?p:null}catch{return null}}function Tp(a){let p=Dn(a.hooks)?a.hooks.PreToolUse:void 0;return Array.isArray(p)?p:[]}function Eo(a,p,v){let w=Dn(p.hooks)?p.hooks:{};Nt(a,`${JSON.stringify({...p,hooks:{...w,PreToolUse:v}},null,2)}
`)}function Ip(a){let p=Do(a);if(!$p(p))return V0(W0(p),{recursive:!0}),Eo(p,{},[$o()]),{path:p,alreadyInstalled:!1};let v=Ap(Ep(p,"utf-8"));if(!v)return Eo(p,{},[$o()]),{path:p,alreadyInstalled:!1};let w=Tp(v),k=w.filter((M)=>Dn(M)&&Array.isArray(M.hooks)&&M.hooks.some(Rp));if(k.length===1&&JSON.stringify(k[0])===JSON.stringify($o()))return{path:p,alreadyInstalled:!0};return Eo(p,v,[...Dp(w),$o()]),{path:p,alreadyInstalled:!1}}function Op(a){let p=Do(a);if(!$p(p))return{path:p,alreadyInstalled:!1};let v=Ap(Ep(p,"utf-8"));if(!v)return{path:p,alreadyInstalled:!1};let w=Tp(v),k=Dp(w);if(JSON.stringify(k)===JSON.stringify(w))return{path:p,alreadyInstalled:!1};let M=Dn(v.hooks)?v.hooks:{};if(k.length===0&&Object.keys(v).length===1&&Object.keys(M).length===1)return J0(p),{path:p,alreadyInstalled:!0};return Eo(p,v,k),{path:p,alreadyInstalled:!0}}function wr(a){return!!a&&typeof a==="object"&&!Array.isArray(a)}function X0(a){if(!wr(a)||!wr(a.hooks))return[];let p=a.hooks.PreToolUse;if(!Array.isArray(p))return[];return p.filter((v)=>wr(v)&&Array.isArray(v.hooks)&&v.hooks.some((w)=>wr(w)&&w.command===Lr))}function Q0(a){let v=(Array.isArray(a.hooks)?a.hooks.filter(wr):[]).find((w)=>w.command===Lr);return[...a.matcher===void 0||a.matcher===""||a.matcher==="*"?[]:['Managed hook has a "matcher" that narrows coverage; reinstall to repair'],...v?.type==="command"?[]:['Managed hook "type" is not "command"; reinstall to repair'],...v?.timeout===Ro?[]:[`Managed hook "timeout" is not ${Ro}; reinstall to repair`]]}function jp(a){let p=Do(a.environment);if(!K0(p))return{platform:"grok-build",status:"n/a",configPath:p};let v;try{v=JSON.parse(Y0(p,"utf-8"))}catch(M){return{platform:"grok-build",status:"n/a",configPath:p,errors:[`Failed to parse Grok Build hooks config ${p}: ${M instanceof Error?M.message:String(M)}`]}}let w=X0(v)[0];if(!w)return{platform:"grok-build",status:"n/a",configPath:p};let k=Q0(w);return{platform:"grok-build",status:"configured",method:"hook config",configPath:p,errors:k.length>0?k:void 0}}import{readFileSync as Gp}from"node:fs";import{join as Bp}from"node:path";var Vt="cc-safety-net",ii="# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent",e1=30;function Np(a){return`${ii}
# version: ${a}
`}function t1(a){return`${Np(a)}name: ${Vt}
version: "${a}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`}function n1(a){return`${Np(a)}"""CC Safety Net guard for Hermes Agent.

Registers pre_tool_call and forwards the tool call to the packaged CC Safety Net
adapter (cc-safety-net hook --hermes-agent) over JSON stdin. The adapter prints nothing
when the call is allowed and an {"action": "block", ...} directive when it is denied.
Hermes ignores a callback that raises, so every transport and analysis failure is turned
into an explicit block here instead.
"""

import json
import os
import shutil
import signal
import subprocess

HOOK_EVENT = "pre_tool_call"
SUPPORTED_TOOLS = ("patch", "read_file", "terminal", "write_file")
ANALYZER = [${on["hermes-agent"].split(" ").map((p)=>`"${p}"`).join(", ")}]
TIMEOUT_SECONDS = ${e1}


def _block(detail):
    return {"action": "block", "message": "CC Safety Net failed closed: " + detail}


def _terminal_cwd(task_id, process_cwd):
    """Return the directory Hermes will run this terminal command in.

    A \`terminal\` call without \`workdir\` runs in the session's own cwd RECORD, not in the
    Hermes process directory: \`_resolve_command_cwd\` in tools/terminal_tool.py returns
    \`workdir or get_session_cwd(session_key) or default_cwd\`, and that record is rewritten
    after every completed command, so it IS the session's \`cd\` state. The session key is
    derived exactly as terminal_tool derives it: the contextvar when set, the raw task_id
    otherwise. No record yet (first command of a session) means \`default_cwd\`, which the local
    terminal backend reads from \`TERMINAL_CWD\` (\`hermes_cli/config.py\` bridges the configured
    \`terminal.cwd\` into it) and only then falls back to the process directory.
    """
    from tools.approval import get_current_session_key
    from tools.terminal_tool import get_session_cwd

    return (
        get_session_cwd(get_current_session_key(default="") or (task_id or ""))
        or os.environ.get("TERMINAL_CWD")
        or process_cwd
    )


def _pre_tool_call(tool_name="", args=None, session_id="", task_id="", **_):
    if tool_name not in SUPPORTED_TOOLS:
        return None

    executable = shutil.which(ANALYZER[0])
    if executable is None:
        return _block(ANALYZER[0] + " was not found on PATH.")

    try:
        cwd = os.getcwd()
    except OSError as error:
        return _block("the working directory could not be resolved (%s)." % error)

    if tool_name == "terminal":
        try:
            cwd = _terminal_cwd(task_id, cwd)
        except ImportError as error:
            # Without the session record we cannot tell which directory the command runs in,
            # and analysing the wrong one clears every path-scoped protection.
            return _block(
                "the Hermes session directory could not be read (%s). Update cc-safety-net and "
                "reinstall the plugin with: npx -y cc-safety-net install --hermes-agent." % error
            )

    payload = json.dumps(
        {
            "hook_event_name": HOOK_EVENT,
            "tool_name": tool_name,
            "tool_input": args if isinstance(args, dict) else None,
            "session_id": session_id if isinstance(session_id, str) else "",
            "cwd": cwd,
        }
    )

    try:
        if os.name == "nt":
            launch_options = {}
        else:
            launch_options = {"start_new_session": True}
        process = subprocess.Popen(
            [executable] + ANALYZER[1:],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            # Decode explicitly: the analyzer writes UTF-8, and a locale decoder would raise
            # UnicodeDecodeError on output it cannot read — an exception Hermes swallows by
            # allowing the tool call. "replace" turns that into unreadable output, which blocks.
            encoding="utf-8",
            errors="replace",
            # Resolve the analyzer from a neutral directory: npx prefers a repository-local
            # node_modules/.bin/cc-safety-net, so inheriting Hermes' working directory would
            # let workspace contents stand in for the analyzer. The payload's "cwd" above is
            # still the real Hermes working directory, which the analysis needs.
            cwd=os.path.expanduser("~"),
            # Own process group so the timeout below can kill the whole tree: npx's descendants
            # outlive a kill aimed at npx alone and keep holding the pipes captured here. Windows
            # uses taskkill's process-tree traversal instead because sessions are POSIX-only.
            **launch_options,
        )
    except OSError as error:
        return _block("analysis could not start (%s)." % error)

    try:
        stdout, _ = process.communicate(payload, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            if os.name == "nt":
                system_root = os.environ.get("SystemRoot")
                if not system_root:
                    raise OSError("SystemRoot is unavailable")
                subprocess.run(
                    [
                        os.path.join(system_root, "System32", "taskkill.exe"),
                        "/PID",
                        str(process.pid),
                        "/T",
                        "/F",
                    ],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=1,
                    check=False,
                )
            else:
                os.killpg(process.pid, signal.SIGKILL)
        except (OSError, subprocess.SubprocessError):
            pass
        try:
            process.communicate(timeout=1)
        except (OSError, subprocess.SubprocessError):
            pass
        return _block("analysis timed out after %ss." % TIMEOUT_SECONDS)

    if process.returncode != 0:
        return _block("analysis exited with status %s." % process.returncode)

    directive = (stdout or "").strip()
    if not directive:
        return None

    try:
        parsed = json.loads(directive)
    except ValueError:
        return _block("analysis returned unreadable output.")

    if isinstance(parsed, dict) and parsed.get("action") == "block":
        message = parsed.get("message")
        if isinstance(message, str) and message:
            return parsed
    return _block("analysis returned an unexpected directive.")


def register(ctx):
    ctx.register_hook("pre_tool_call", _pre_tool_call)
`}function xr(a){return[{name:"__init__.py",content:n1(a)},{name:"plugin.yaml",content:t1(a)}]}import{mkdirSync as r1,readdirSync as o1,readFileSync as s1,rmSync as ai}from"node:fs";import{join as An}from"node:path";var i1="__pycache__";function ci(a){let p=a.env.get("HERMES_HOME")?.trim();return p?p:An(a.home,".hermes")}function li(a){return An(ci(a),"plugins",Vt)}function ui(a){return a.startsWith(ii)}function di(a,p){let v=li(a),w=Ot(v);if(w&&(w.isSymbolicLink()||!w.isDirectory()))throw Error(`Refusing to ${p} ${v}: not a regular directory. Move or remove it and rerun ${p==="install"?"install":"uninstall"} --hermes-agent.`);return v}function zp(a,p){let v=Ot(a);if(!v)return;if(v.isSymbolicLink()||!v.isFile())throw Error(`Refusing to ${p} ${a}: not a regular file. Move or remove it.`);let w=s1(a,"utf-8");if(!ui(w))throw Error(`Refusing to ${p} unmanaged file at ${a}. Move or remove it.`);return w}function Fp(a){let p=di(a,"install"),v=xr(jt());if(v.map((k)=>zp(An(p,k.name),"overwrite")).every((k,M)=>k===v[M]?.content))return{path:p,alreadyInstalled:!0};return r1(p,{recursive:!0}),v.forEach((k)=>{Nt(An(p,k.name),k.content)}),{path:p,alreadyInstalled:!1}}function pi(a){let p=di(a,"remove");if(!Ot(p))return[];return xr(jt()).filter((v)=>zp(An(p,v.name),"remove")!==void 0)}function Mp(a){let p=di(a,"remove");if(!Ot(p))return{path:p,alreadyInstalled:!1};let v=pi(a);if(v.forEach((w)=>{ai(An(p,w.name))}),ai(An(p,i1),{recursive:!0,force:!0}),o1(p).length===0)ai(p,{recursive:!0});return{path:p,alreadyInstalled:v.length>0}}var Ao="hermes-agent",Up=/^([^\s#][^:]*):/,a1=/^\s+([A-Za-z_][\w-]*):/,Hp=/^\s+-\s*(.*)$/;function c1(a){return a.trim().replace(/^(["'])(.*)\1$/,"$2")}function l1(a){let p=a.split(/\r?\n/),v=p.findIndex((M)=>Up.exec(M)?.[1]?.trim()==="plugins");if(v===-1)return[];let w=p.slice(v+1),k=w.findIndex((M)=>Up.test(M));return k===-1?w:w.slice(0,k)}function Zp(a,p){let v=l1(a),w=v.findIndex((G)=>a1.exec(G)?.[1]===p);if(w===-1)return[];let k=v.slice(w+1),M=k.findIndex((G)=>!Hp.test(G));return(M===-1?k:k.slice(0,M)).map((G)=>c1(Hp.exec(G)?.[1]??""))}function u1(a){try{return Gp(Bp(ci(a),"config.yaml"),"utf-8")}catch{return}}function fi(a){let p=u1(a)??"";return Zp(p,"enabled").includes(Vt)&&!Zp(p,"disabled").includes(Vt)}function qp(a){return/^# version:\s*(.+)$/m.exec(a)?.[1]?.trim()}function d1(a,p){let v=Ot(a);if(!v)return{error:`${p.name} is missing from ${a}; run install --hermes-agent`};if(v.isSymbolicLink()||!v.isFile())return{error:`${a} is a symlink or not a regular file; move or remove it`};try{let w=Gp(a,"utf-8");if(!ui(w))return{error:`Unmanaged ${p.name} occupies ${a}; move or remove it`};if(qp(w)===jt()&&w!==p.content)return{error:`Modified ${p.name} occupies ${a}; run install --hermes-agent to restore it`};return{content:w}}catch(w){return{error:`Failed to read ${a}: ${w instanceof Error?w.message:String(w)}`}}}function Vp(a){let p=li(a.environment),v=vo(Ao,p);if(v)return v;let w=xr(jt()).map((B)=>d1(Bp(p,B.name),B)),k=w.flatMap((B)=>("error"in B)?[B.error]:[]);if(k.length>0)return{platform:Ao,status:"n/a",configPath:p,errors:k};let M=w.some((B)=>("content"in B)&&qp(B.content)!==jt()),G=M?["Installed Hermes Agent plugin is outdated; run install --hermes-agent to update"]:[];if(!fi(a.environment))return{platform:Ao,status:"disabled",method:"plugin directory",configPath:p,errors:[`${Vt} is not enabled in Hermes; run \`hermes plugins enable ${Vt}\``,...G]};return{platform:Ao,status:"configured",method:"plugin directory",configPath:p,errors:M?G:void 0}}import{existsSync as p1,readFileSync as f1}from"node:fs";import{join as Jp}from"node:path";var m1=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;function g1(a){return Jp(a.env.get("KIMI_CODE_HOME")||Jp(a.home,".kimi-code"),"config.toml")}function kr(a){let p=g1(a.environment);if(!p1(p))return{platform:"kimi-code",status:"n/a",configPath:p};try{if(!m1.test(f1(p,"utf-8")))return{platform:"kimi-code",status:"n/a",configPath:p}}catch(v){return{platform:"kimi-code",status:"n/a",configPath:p,errors:[`Failed to read ${p}: ${v instanceof Error?v.message:String(v)}`]}}return{platform:"kimi-code",status:"configured",method:"hook config",configPath:p}}import{readFileSync as of}from"node:fs";import{join as Sr}from"node:path";var Tt="cc-safety-net",Jt="index.js",Jn="openclaw.plugin.json",Wn="package.json";var To="// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw";import{existsSync as v1,lstatSync as b1,readdirSync as L1,readFileSync as w1}from"node:fs";import{dirname as Yp,join as Ln}from"node:path";import{fileURLToPath as x1}from"node:url";import{spawn as h1}from"node:child_process";function y1(a){return a.join(" ")}function mi(a,p,v){return[`Failed to run ${y1(a)}${p===null?"":` (exit ${p})`}.`,v.trim()].filter(Boolean).join(`
`)}function gi(a){let p={stdout:"",stderr:""};return a.stdout.setEncoding("utf-8"),a.stderr.setEncoding("utf-8"),a.stdout.on("data",(v)=>{p.stdout+=v}),a.stderr.on("data",(v)=>{p.stderr+=v}),p}function sn(a,p){return new Promise((v,w)=>{let k=En([...a],process.env),M=h1(k.cmd,k.args,{stdio:["ignore","pipe","pipe"]}),G=gi(M),B=()=>[G.stdout,G.stderr].filter(Boolean).join(`
`),J=p?.timeoutMs??120000,se=setTimeout(()=>{M.kill(),w(Error(mi(a,null,`Timed out after ${J}ms.
${B()}`.trim())))},J);M.on("error",(ae)=>{clearTimeout(se),w(Error(mi(a,null,`${ae.message}
${B()}`.trim())))}),M.on("close",(ae)=>{if(clearTimeout(se),ae!==0){w(Error(mi(a,ae,B())));return}v(p?.stdoutOnly?G.stdout:B())})})}async function hi(a){for(let p of a)await sn(p)}async function Wp(a){for(let p of a)try{await sn(p)}catch(v){console.warn(v instanceof Error?v.message:String(v))}}var Kp=Ln("openclaw",Tt),k1=[Jt,Jn,Wn];function yi(a,p){if(a==="~")return p;if(a.startsWith("~/")||a.startsWith("~\\"))return Ln(p,a.slice(2));return a}function Xp(a){let p=a.env.get("OPENCLAW_STATE_DIR")?.trim();if(p)return yi(p,a.home);let v=a.env.get("OPENCLAW_CONFIG_PATH")?.trim();return v?Yp(yi(v,a.home)):Ln(a.home,".openclaw")}function Qp(a){let p=a.env.get("OPENCLAW_CONFIG_PATH")?.trim();return p?yi(p,a.home):Ln(Xp(a),"openclaw.json")}function vi(a){return Ln(Xp(a),"extensions",Tt)}function _1(a){let p=L1(a);if(p.length===0)return!0;if(p.some((k)=>!k1.includes(k)))return!1;let v=Ln(a,Jt),w=Ot(v);return w!==void 0&&!w.isSymbolicLink()&&w.isFile()&&w1(v,"utf-8").startsWith(To)}function bi(a){let p=vi(a),v=Ot(p);if(!v)return;if(!v.isSymbolicLink()&&v.isDirectory()&&_1(p))return;throw Error(`Refusing to modify ${p}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`)}function ef(){let a=Yp(x1(import.meta.url));return[Ln(a,"..",Kp),Ln(a,"..","..","..","dist",Kp)]}function Li(a=ef()){return a.find((p)=>v1(p)&&b1(p).isDirectory())}function S1(a=ef()){let p=Li(a);if(!p)throw Error("Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.");return p}function tf(a=S1()){return[["openclaw","plugins","install",a,"--force"],["openclaw","plugins","enable",Tt]]}function C1(a){let p=(()=>{try{return JSON.parse(a)}catch{return}})(),v=_t(_t(p,"plugin"),"status");return typeof v==="string"?v:void 0}async function nf(){let a=C1(await sn(["openclaw","plugins","inspect",Tt,"--runtime","--json"],{stdoutOnly:!0}));if(a==="loaded")return;throw Error(`${a===void 0?`The ${Tt} plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable.`:`OpenClaw reports the ${Tt} plugin with status "${a}".`} Run \`openclaw plugins inspect ${Tt} --runtime\` for details.`)}var Io="openclaw",_r=`run \`openclaw plugins enable ${Tt}\``;function Kn(a,p){let v=Sr(a,p),w=Ot(v);if(!w)return{error:`${p} is missing from ${v}; run install --openclaw`};if(w.isSymbolicLink()||!w.isFile())return{error:`${v} is a symlink or not a regular file; move or remove it`};try{return{content:of(v,"utf-8")}}catch(k){return{error:`Failed to read ${v}: ${k instanceof Error?k.message:String(k)}`}}}function sf(a){try{return JSON.parse(qt(a))}catch{return}}function P1(a){let p=Kn(a,Jn);if("error"in p)return p.error;if(_t(sf(p.content),"id")===Tt)return;return`${Sr(a,Jn)} is not a valid ${Tt} manifest; run install --openclaw`}function $1(a){let p=Kn(a,Wn);if("error"in p)return p.error;let v=_t(_t(sf(p.content),"openclaw"),"extensions");if(Array.isArray(v)&&v.includes(`./${Jt}`))return;return`${Sr(a,Wn)} does not point OpenClaw at ${Jt}; run install --openclaw`}function rf(a){return Array.isArray(a)?a.filter((p)=>typeof p==="string"):[]}function E1(a){let p=Qp(a);if(!Ot(p))return`${Tt} is not enabled; ${_r}`;let v=(()=>{try{return JSON.parse(qt(of(p,"utf-8")))}catch{return}})();if(v===void 0)return`Failed to read ${p}; fix it, then ${_r}`;let w=_t(v,"plugins");if(_t(w,"enabled")===!1)return`plugins.enabled is false in ${p}; no OpenClaw plugin loads`;let k=_t(_t(_t(w,"entries"),Tt),"enabled");if(rf(_t(w,"deny")).includes(Tt)||k===!1)return`${Tt} is disabled in ${p}; ${_r}`;let M=rf(_t(w,"allow"));if(M.length>0&&!M.includes(Tt))return`plugins.allow in ${p} does not list ${Tt}; add it, then ${_r}`;if(M.includes(Tt)||k===!0)return;return`${Tt} is not enabled; ${_r}`}function af(a){return/^\/\/ version:\s*(.+)$/m.exec(a)?.[1]?.trim()}function R1(a,p,v){if(v===void 0)return[];let w=Kn(v,Jt);if("error"in w||af(w.content)!==p)return[];return[Jt,Jn,Wn].flatMap((k)=>{let M=Kn(a,k),G=Kn(v,k);if("error"in M||"error"in G||M.content===G.content)return[];return[`Modified ${k} occupies ${Sr(a,k)}; run install --openclaw to restore it`]})}function cf(a){let p=vi(a.environment),v=vo(Io,p);if(v)return v;let w=Kn(p,Jt),M=["error"in w?w.error:w.content.startsWith(To)?void 0:`Unmanaged ${Jt} occupies ${Sr(p,Jt)}; move or remove it`,P1(p),$1(p)].filter((ae)=>ae!==void 0),G="content"in w?af(w.content):void 0,B=M.length>0?M:R1(p,G,Li());if(B.length>0)return{platform:Io,status:"n/a",configPath:p,errors:B};let J=G===jt()?[]:["Installed OpenClaw plugin is outdated; run install --openclaw to update"],se=E1(a.environment);if(se)return{platform:Io,status:"disabled",method:"plugin directory",configPath:p,errors:[se,...J]};return{platform:Io,status:"configured",method:"plugin directory",configPath:p,errors:J.length>0?J:void 0}}import{existsSync as N1,readFileSync as z1}from"node:fs";import{join as F1}from"node:path";import{existsSync as wi,readFileSync as df,rmSync as D1}from"node:fs";import{join as un}from"node:path";import{pathToFileURL as A1}from"node:url";var Oo="cc-safety-net",pf=`${Oo}@latest`,ff=["opencode.json","opencode.jsonc"],lf="CCSafetyNetPlugin",uf={stringError:"Unterminated string in OpenCode config",bracketError:"Unmatched plugin array in OpenCode config"};function jo(a){return un(a.env.get("XDG_CONFIG_HOME")||un(a.home,".config"),"opencode")}function T1(a){return un(jo(a),ff[0])}function I1(a){return ff.map((p)=>un(jo(a),p))}function mf(a){return un(a.env.get("XDG_CACHE_HOME")||un(a.home,".cache"),"opencode","packages",pf)}function xi(a){D1(mf(a),{recursive:!0,force:!0})}async function gf(a){let p=un(mf(a),"node_modules",Oo),v=un(p,"package.json");if(!wi(v))throw Error(`The OpenCode plugin cache at ${p} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f ${pf}\` for details.`);let w=_t(JSON.parse(df(v,"utf-8")),"main");if(typeof w!=="string")throw Error(`The cached OpenCode plugin at ${p} declares no "main" entry.`);let k=un(p,w);if(typeof(await import(A1(k).href))[lf]==="function")return;throw Error(`The cached OpenCode plugin at ${k} does not export a callable ${lf}, so OpenCode would load nothing and fail open.`)}function hf(a,p){try{return JSON.parse(qt(a))}catch(v){if(v instanceof SyntaxError)throw Error(`Failed to parse OpenCode config ${p}: ${v.message}`);throw v}}function O1(a){if(!a||typeof a!=="object"||Array.isArray(a))return!1;let p=a.plugin;if(!Array.isArray(p))return!1;return p.some((v)=>typeof v==="string"&&v.includes(Oo))}function j1(a,p){let v=sp(a,"plugin",uf);if(!v)throw Error(`Failed to locate OpenCode plugin array in ${p}`);let w=ip(a,v,uf.stringError).filter((k)=>k.value.includes(Oo)).map((k)=>k.range).reverse().reduce(wo,a);return hf(w,p),w}function yf(a){xi(a);let p=I1(a),v=p.find((k)=>wi(k)),w=[];for(let k of p){if(!wi(k))continue;try{let M=df(k,"utf-8");if(!O1(hf(M,k)))continue;return Nt(k,j1(M,k)),{path:k,alreadyInstalled:!0}}catch(M){w.push(M instanceof Error?M.message:String(M))}}if(w.length>0)throw Error(w.join(`
`));return{path:v??T1(a),alreadyInstalled:!1}}function vf(a){let p=[],v=jo(a.environment),w=["opencode.json","opencode.jsonc"];for(let k of w){let M=F1(v,k);if(N1(M))try{let G=z1(M,"utf-8"),B=qt(G);if((JSON.parse(B).plugin??[]).some((ce)=>ce.includes("cc-safety-net")))return{platform:"opencode",status:"configured",method:"plugin array",configPath:M,errors:p.length>0?p:void 0}}catch(G){p.push(`Failed to parse ${k}: ${G instanceof Error?G.message:String(G)}`)}}return{platform:"opencode",status:"n/a",errors:p.length>0?p:void 0}}import{join as M1}from"node:path";function ki(a){return M1(a.home,".pi","agent","settings.json")}function _i(a){if(typeof a!=="string")return!1;return a==="npm:cc-safety-net"||a.startsWith("npm:cc-safety-net@")}function bf(a){let p=ki(a.environment),v=nn(p);if(v.kind==="unreadable")return{platform:"pi",status:"not-inspected"};if(v.kind==="missing")return{platform:"pi",status:"n/a"};let w=_t(v.value,"packages");if(!Array.isArray(w))return{platform:"pi",status:"n/a"};let k=w.find((B)=>_i(typeof B==="string"?B:_t(B,"source")));if(k===void 0)return{platform:"pi",status:"n/a"};let M=_t(k,"extensions");if(Array.isArray(M)&&M.some((B)=>typeof B==="string"&&B.startsWith("-")))return{platform:"pi",status:"disabled",method:"package config",configPath:p,errors:["npm:cc-safety-net is installed but its extension is disabled in Pi settings"]};return{platform:"pi",status:"configured",method:"package config",configPath:p}}var U1={amp:Kd,"antigravity-cli":Yd,"claude-code":tp,codex:np,"copilot-cli":yp,cursor:Sp,"gemini-cli":Cp,"grok-build":jp,"hermes-agent":Vp,"kimi-code":kr,openclaw:cf,opencode:vf,pi:bf};function Yn(a,p,v){let w={...v,cwd:p,environment:a};return rt.map((k)=>H1(U1[k](w)))}function H1(a){if(a.status==="not-inspected")return{platform:a.platform,detected:!1,configured:!1,inspectionStatus:"not-inspected"};return{platform:a.platform,detected:a.status!=="n/a",configured:a.status==="configured",inspectionStatus:a.status!=="n/a"?"verified":a.errors&&a.errors.length>0?"failed":"not-applicable",method:a.method,configPath:a.configPath,configPaths:a.configPaths,errors:a.errors}}import{join as Z1}from"node:path";var G1=Object.freeze([{command:"git reset --hard",description:"git reset --hard",expectBlocked:!0},{command:"rm -rf /",description:"rm -rf /",expectBlocked:!0},{command:"rm -rf ./node_modules",description:"rm in cwd (safe)",expectBlocked:!1}]),B1=Object.freeze({state:"ready",diagnostics:Object.freeze([]),ruleMetadata:Object.freeze({}),policy:Object.freeze({rules:Object.freeze([]),transparentWrappers:Object.freeze([]),safety:Object.freeze({}),worktreeMode:!1,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:Object.freeze({}),destructiveCommandAllowPaths:Object.freeze([]),secretProtection:Object.freeze({enabled:!0,disabledRules:Object.freeze([]),denyPaths:Object.freeze([]),allowPaths:Object.freeze([])})})}),q1={strict:!1,paranoidRm:!1,paranoidInterpreters:!1,worktreeMode:!1,effectiveLevel:"standard",capabilities:{fail_closed:{enabled:!1,source:"preset",sources:[]},paranoid_rm:{enabled:!1,source:"preset",sources:[]},paranoid_interpreters:{enabled:!1,source:"preset",sources:[]}}};function Lf(a){let p=Z1(a.tmpdir,"cc-safety-net-self-test"),v=G1.map((w)=>{let k=j(a,f("self-test",{command:w.command},{kind:"command",shell:"auto"},{configCwd:p,executionCwd:p},w.command),{guard:{dependencies:{loadPolicySnapshot:()=>B1,getModes:()=>q1,findPolicyMutation:()=>null}},audit:{agent:"self-test",getSessionId:()=>{return}}}),M=w.expectBlocked?"blocked":"allowed",G=k.decision.kind==="deny"?"blocked":"allowed";return{command:w.command,description:w.description,expected:M,actual:G,passed:M===G,reason:k.decision.kind==="deny"?k.decision.reason:void 0,ruleId:k.decision.kind==="deny"?k.decision.ruleId:void 0}});return{passed:v.filter((w)=>w.passed).length,failed:v.filter((w)=>!w.passed).length,total:v.length,results:v}}function Si(a){let p=c({label:"doctor",booleans:{json:["--json"],skipUpdateCheck:["--skip-update-check"]}},a);if(oe(p.errors))return null;return{json:p.flags.json,skipUpdateCheck:p.flags.skipUpdateCheck}}async function wf(a,p={}){let v=await yr(!p.json,()=>{let w=V1(a,p);return{ready:w,finish:()=>w}},()=>hr(),{loadingMessage:"Checking system status…"});if(p.json)console.log(JSON.stringify(v,null,2));else J1(v);return v.engineSelfTest.failed>0||v.findings.some((w)=>w.severity==="error")?1:0}async function V1(a,p){let v=p.cwd??process.cwd(),w=await mr(),k=Yn(a,v,{ampPluginListOutput:w.ampPluginListOutput,codexPluginListOutput:w.codexPluginListOutput,copilotCliVersion:w.versions["copilot-cli"]}),M=pd(a,v),G=fd(a),B=O(a,{cwd:v}),J=B.policy,se=N(J,a.env),ae=te(J,se.capabilities),ce=Ur(a,7),le=Bd(a,v),he=p.skipUpdateCheck?{currentVersion:jt(),latestVersion:null,updateAvailable:!1}:await bn(),be={hooks:k,engineSelfTest:Lf(a),userConfig:M.userConfig,projectConfig:M.projectConfig,configState:Qe(B),effectiveRules:M.effectiveRules,shadowedRules:M.shadowedRules,environment:G,effectiveSafety:{selectedPreset:J.safety.level??"standard",level:se.effectiveLevel,capabilities:se.capabilities,ruleOverrides:J.destructiveCommandRuleOverrides,weakenedRuleOverrides:Object.entries(ae).filter(([,ve])=>ve.source==="rule_override"&&ve.override==="off"&&ve.inheritedEnabled&&ve.changesInherited).map(([ve])=>ve),ruleCounts:{stored:Object.keys(J.destructiveCommandRuleOverrides).length,effective:Object.values(ae).filter((ve)=>ve.changesInherited).length},...B.policyScopes?{policyScopes:B.policyScopes}:{}},...le.length>0?{v2Leftovers:le}:{},posture:Pd(a,M.userConfig.path),activity:ce,update:he,system:w};return{...be,findings:gd(be)}}function J1(a){console.log(),console.log(yd(a.hooks)),console.log(),console.log(vd(a.engineSelfTest)),console.log(),console.log(bd(a)),console.log(),console.log(Ld(a.environment)),console.log(),console.log(wd(a)),console.log(),console.log(xd(a.findings)),console.log(),console.log(kd(a.activity)),console.log(),console.log(Sd(a.system)),console.log(),console.log(_d(a.update)),console.log(Cd(a))}import{existsSync as W1}from"node:fs";var K1=/^[A-Za-z0-9_@%+=:,./-]+$/,xf="Usage: cc-safety-net explain [--json] [--cwd <path>] <command>";function Ci(a){let p=c({label:"explain",booleans:{json:["--json"]},values:{cwd:["--cwd"]},positionals:"tail"},a);if(oe(p.errors))return console.error(xf),console.error("Pass -- before a command that starts with dashes."),null;if(p.values.cwd!==void 0&&!W1(p.values.cwd))return console.error(`Error: --cwd path does not exist: ${p.values.cwd}`),null;let v=p.positionals.length===1?p.positionals[0]:p.positionals.map((w)=>K1.test(w)?w:`'${w.replaceAll("'","'\\''")}'`).join(" ");if(!v)return console.error("Error: No command provided"),console.error(xf),null;return{json:p.flags.json,cwd:p.values.cwd,command:v}}function kf(a){if(a)return{dh:"=",dv:"|",dtl:"+",dtr:"+",dbl:"+",dbr:"+",h:"-",v:"|",tl:"+",tr:"+",bl:"+",br:"+",sh:"="};return{dh:"═",dv:"║",dtl:"╔",dtr:"╗",dbl:"╚",dbr:"╝",h:"─",v:"│",tl:"┌",tr:"┐",bl:"└",br:"┘",sh:"━"}}function _f(a,p){let w=p-18;return[`${a.dtl}${a.dh.repeat(p)}${a.dtr}`,`${a.dv}  Command Analysis${" ".repeat(w)}${a.dv}`,`${a.dbl}${a.dh.repeat(p)}${a.dbr}`]}function Pi(a){return JSON.stringify(a)}function Sf(a,p=0){return`[${a.map((w,k)=>hd(w,k,p)).join(",")}]`}function Cr(a,p,v=70){let w=a.split(" "),k=[],M="";for(let G of w)if(M&&M.length+G.length+1>v)k.push(M),M=G;else M=M?`${M} ${G}`:G;if(M)k.push(M);return k.map((G,B)=>B===0?G:`${p}${G}`)}function Cf(a,p,v){let w=[];switch(a.type){case"parse":return null;case"env-strip":return w.push(""),w.push(`STEP ${p} ${v.h} Strip environment variables`),w.push(`  Removed: ${a.envVars.map((k)=>`${k}=<redacted>`).join(", ")}`),w.push(`  Tokens:  ${Pi(a.output)}`),{lines:w,incrementStep:!0};case"leading-tokens-stripped":return w.push(""),w.push(`STEP ${p} ${v.h} Strip wrappers`),w.push(`  Removed: ${a.removed.join(", ")}`),w.push(`  Tokens:  ${Pi(a.output)}`),{lines:w,incrementStep:!0};case"shell-wrapper":return w.push(""),w.push(`STEP ${p} ${v.h} Detect shell wrapper`),w.push(`  Wrapper: ${a.wrapper} -c`),w.push(`  Inner:   ${a.innerCommand}`),{lines:w,incrementStep:!0};case"interpreter":{if(w.push(""),w.push(`STEP ${p} ${v.h} Detect interpreter`),w.push(`  Interpreter: ${a.interpreter}`),w.push(`  Code:        ${a.codeArg}`),a.paranoidBlocked)w.push("  Result:      ✗ BLOCKED (paranoid mode)");return{lines:w,incrementStep:!0}}case"busybox":return w.push(""),w.push(`STEP ${p} ${v.h} Busybox wrapper`),w.push(`  Subcommand: ${a.subcommand}`),{lines:w,incrementStep:!0};case"transparent-wrapper":return w.push(""),w.push(`STEP ${p} ${v.h} Transparent wrapper`),w.push(`  Wrapper: ${a.wrapper}`),w.push(`  Tokens:  ${Pi(a.output)}`),{lines:w,incrementStep:!0};case"recurse":return{lines:[],incrementStep:!1};case"rule-check":{if(w.push(""),w.push(`STEP ${p} ${v.h} Match rules`),w.push(`  Rule:   ${a.rule}()`),a.matched)w.push("  Result: MATCHED");else w.push("  Result: No match");return{lines:w,incrementStep:!0}}case"worktree-relaxation":return w.push(""),w.push(`STEP ${p} ${v.h} Worktree relaxation`),w.push(`  Mode:   ${n.worktree.name}`),w.push(`  Git cwd: ${a.gitCwd}`),w.push("  Result: Allowed local discard in linked worktree"),{lines:w,incrementStep:!0};case"tmpdir-check":return null;case"fallback-scan":{if(a.embeddedCommandFound)return w.push(""),w.push(`STEP ${p} ${v.h} Fallback scan`),w.push(`  Found: ${a.embeddedCommandFound}`),{lines:w,incrementStep:!0};return null}case"custom-rules-check":{if(a.rulesChecked){if(w.push(""),w.push(`STEP ${p} ${v.h} Custom rules`),a.matched)w.push("  Result: MATCHED");else w.push("  Result: No match");return{lines:w,incrementStep:!0}}return null}case"cwd-change":return null;case"dangerous-text":{if(a.matched)return w.push(""),w.push(`STEP ${p} ${v.h} Dangerous text check`),w.push(`  Token:  ${a.token}`),w.push("  Result: MATCHED"),{lines:w,incrementStep:!0};return null}case"strict-unparseable":return w.push(""),w.push(`STEP ${p} ${v.h} Strict mode check`),w.push(`  Command: ${a.rawCommand}`),w.push("  Result:  ✗ UNPARSEABLE"),{lines:w,incrementStep:!0};case"segment-skipped":return null;case"error":return w.push(""),w.push(`ERROR: ${a.message}`),{lines:w,incrementStep:!1};default:return a}}function $i(a,p){let v=kf(p?.asciiOnly??!1),w=58,k=[],M=1;k.push(..._f(v,58)),k.push("");let G=a.trace.steps.find((be)=>be.type==="error");if(G&&G.type==="error"){k.push("ERROR"),k.push(`  ${G.message}`),k.push(""),k.push("RESULT"),k.push(`  Status: ${a.result==="blocked"?We.red("BLOCKED"):We.green("ALLOWED")}`),k.push(""),k.push("CONFIG");let be=a.configSource??"none";return k.push(`  Path: ${be}`),k.join(`
`)}let B=a.trace.steps.find((be)=>be.type==="parse");if(B&&B.type==="parse"){k.push("INPUT"),k.push(`  ${B.input}`),k.push(""),k.push(`STEP ${M} ${v.h} Split shell commands`),M++;for(let be=0;be<B.segments.length;be++){let ve=B.segments[be];if(ve){let _e=Math.random();k.push(`  Segment ${be+1}: ${Sf(ve,_e)}`)}}}let J=a.trace.segments,se=J.length>1;for(let be of J){if(se){k.push("");let Ue="";if(B&&B.type==="parse"){let is=B.segments[be.index];if(is)Ue=is.join(" ")}let Oe=54,Lt=Ue,Je=` Segment ${be.index+1}: `,Rt=" ";if(Ue){if(Je.length+Ue.length+Rt.length>Oe){let B2=Oe-Je.length-Rt.length;Lt=`${Ue.substring(0,B2-1)}…`}}let cn=Ue?`${Je}${Lt}${Rt}`:` Segment ${be.index+1} `,Kt=Ue?`${Je}${We.cyan(Lt)}${Rt}`:cn,da=58-cn.length,pa=Math.floor(da/2),G2=da-pa;k.push(`${v.sh.repeat(pa)}${Kt}${v.sh.repeat(G2)}`)}if(be.steps.find((Ue)=>Ue.type==="segment-skipped")){k.push(""),k.push("  (skipped — prior segment blocked)");continue}let _e=!1,Be=!1;for(let Ue of be.steps){let Oe=Cf(Ue,M,v);if(Oe){if(Be=!0,Ue.type==="recurse"){k.push("");let Lt=" RECURSING ",Je=58-Lt.length-4;k.push(`  ${v.tl}${v.h}${Lt}${v.h.repeat(Je)}`),k.push(`  ${v.v}`),_e=!0;continue}for(let Lt of Oe.lines)if(_e)k.push(`  ${v.v} ${Lt}`);else k.push(Lt);if(Oe.incrementStep)M++}}if(_e)k.push(`  ${v.v}`),k.push(`  ${v.bl}${v.h.repeat(56)}`),_e=!1;if(!Be)k.push(""),k.push(`  ${We.green("✓")} Allowed (no matching rules)`)}if(k.push(""),k.push("RESULT"),a.result==="blocked"){if(k.push(`  Status: ${We.red("BLOCKED")}`),a.customRule){if(k.push(`  Rule: ${a.customRule.id}`),a.customRule.rulebook)k.push(`  Rulebook: ${a.customRule.rulebook.name} ${a.customRule.rulebook.version}`);if(a.customRule.source)k.push(`  Source: ${a.customRule.source}`);if(a.customRule.override)k.push(`  Override: reason ${a.customRule.override.reason}`)}if(a.reason){let be=Cr(a.reason,"          ");k.push(`  Reason: ${be[0]}`);for(let ve=1;ve<be.length;ve++)k.push(be[ve]??"")}}else k.push(`  Status: ${We.green("ALLOWED")}`);k.push(""),k.push("CONFIG");let ae=a.configSource??"none",ce=a.configValid?"":" (invalid)";k.push(`  Path: ${ae}${ce}`);let le=a.safetyPresetScope;k.push(`  Safety preset: ${a.selectedPreset??"standard"}${le?` (${uo(le)})`:""}`),k.push(`  Effective capabilities: ${a.effectiveLevel}`);let he=Object.entries(a.destructiveCommandRuleOverrides??{});if(k.push(`  Rule customizations: ${he.length}`),a.ruleActivation)k.push(`  Rule activation: ${a.ruleActivation.id} — ${a.ruleActivation.enabled?"on":"off"} via ${a.ruleActivation.source}`);return k.join(`
`)}function Ei(a){return JSON.stringify(a,null,2)}import{resolve as nv}from"node:path";var Y1=["AKIA","ASIA","ghp_","gho_","ghu_","ghs_","ghr_","github_pat_","glpat-","xox","npm_","pypi-","rk_","sk-","sk_","gsk_","xai-","pplx-","bastn_","tgp_v1_","flp_","wfr_","fw_","fwp_","tp-","psk-"];function Pf(a){let p=0,v={allocateSegment(){return p++},getNextSegmentIndex(){return p},recordGlobal(w){a.record({kind:"step",scope:"global",step:w})},recordSegment(w,k=v.currentSegmentIndex){if(k===void 0)return;a.record({kind:"step",scope:"segment",segmentIndex:k,step:w})}};return v}function $f(a={}){let p=[],v=a.maxEvents??512,w={maxTextLength:a.maxTextLength??2048,maxListLength:a.maxListLength??128,maxObjectProperties:a.maxObjectProperties??a.maxListLength??128,maxDepth:a.maxDepth??16},k=0,M,G=new Set;return{record(B){if(M)return;try{if(!B||p.length>=v){k++;return}p.push(Di(X1(B,w,G)))}catch{k++}},finish(B){if(M)return M;try{M=Di({events:Object.freeze(p),droppedEvents:k,terminal:Q1(B,w,G)})}catch{k++,M=Object.freeze({events:Object.freeze(p),droppedEvents:k,terminal:Object.freeze({result:"blocked",reason:"trace unavailable".slice(0,w.maxTextLength),segment:"trace unavailable".slice(0,w.maxTextLength)})})}return M}}}function X1(a,p,v){if(a.kind!=="step")throw TypeError("invalid trace event");let{scope:w,step:k}=a;No(k,v,p);let M=Xn(k,p,v);if(w==="global")return{kind:"step",scope:"global",step:M};if(w!=="segment")throw TypeError("invalid trace event scope");return{kind:"step",scope:"segment",segmentIndex:a.segmentIndex,step:M}}function Q1(a,p,v){let w=a.result;if(w==="allowed")return Object.freeze({result:"allowed"});if(w!=="blocked")throw TypeError("invalid trace terminal");let k=a.ruleId;return Object.freeze({result:"blocked",reason:Xn(a.reason,p,v),segment:Xn(a.segment,p,v),...k?{ruleId:Xn(k,p,v)}:{}})}function No(a,p,v,w=0,k=new WeakSet){if(typeof a==="string"){let B=a.slice(0,v.maxTextLength);if(!st(B))return;for(let J of mt(B))for(let se of J.match(/[^\s"'()$]+/g)??[])p.add(Ef(se));return}if(!a||typeof a!=="object"||w>=v.maxDepth||k.has(a))return;if(k.add(a),Array.isArray(a)){let B=Math.min(a.length,v.maxListLength);for(let J=0;J<B;J++)No(a[J],p,v,w+1,k);return}let M=0,G=new Set;for(let B in a){if(!Object.hasOwn(a,B))continue;if(M>=v.maxObjectProperties)break;M++,No(B,p,v);let J=Ri(B,v,p);if(G.has(J))continue;G.add(J),No(a[B],p,v,w+1,k)}}function Xn(a,p,v,w=0,k=new WeakSet){if(typeof a==="string")return Ri(a,p,v);if(!a||typeof a!=="object")return a;if(w>=p.maxDepth)return;if(k.has(a))return;if(k.add(a),Array.isArray(a)){let B=[],J=Math.min(a.length,p.maxListLength);for(let se=0;se<J;se++)B.push(Xn(a[se],p,v,w+1,k));return B}let M={},G=0;for(let B in a){if(!Object.hasOwn(a,B))continue;if(G>=p.maxObjectProperties)break;G++;let J=Ri(B,p,v);if(Object.hasOwn(M,J))continue;Object.defineProperty(M,J,{value:Xn(a[B],p,v,w+1,k),enumerable:!0,configurable:!0,writable:!0})}return M}function Ri(a,p,v){let w=a.slice(0,p.maxTextLength),k=st(w)?it(w):w,M=v.size>0?tv(k,v):k;return(ev(M)?He(M):M).slice(0,p.maxTextLength)}function ev(a){return a.includes("PRIVATE KEY")||a.includes("://")||a.includes("eyJ")||a.includes(":")&&/(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(a)||a.length>=14&&Y1.some((p)=>a.includes(p))||a.length>=49&&/\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(a)}function tv(a,p){return a.replace(/[^\s"'()$]+/g,(v)=>p.has(Ef(v))?"<redacted>":v)}function Ef(a){let p=2166136261,v=2166136261;for(let w=0;w<a.length;w++)p=Math.imul(p^a.charCodeAt(w),16777619),v=Math.imul(v^a.charCodeAt(a.length-w-1),16777619);return`${p>>>0}:${v>>>0}:${a.length}`}function Di(a){if(a&&typeof a==="object"&&!Object.isFrozen(a)){for(let p of Object.values(a))Di(p);Object.freeze(a)}return a}function Pr(a,p={},v){let w=nv(p.cwd??process.cwd()),k=p.policySnapshot??O(v,{cwd:w,userConfigDir:p.userConfigDir}),M=N(k.policy,v.env),G=p.strict,B=et({policySnapshot:k,effectiveCapabilities:M.capabilities,strict:G??M.strict,paranoidRm:M.paranoidRm,paranoidInterpreters:M.paranoidInterpreters,worktreeMode:M.worktreeMode}),J={effectiveLevel:B.effectiveLevel,selectedPreset:k.policy.safety.level??"standard",...k.policyScopes?{safetyPresetScope:k.policyScopes.levelScope}:{},effectiveCapabilities:B.effectiveCapabilities,destructiveCommandRuleOverrides:k.policy.destructiveCommandRuleOverrides},{configSource:se,configValid:ae}=ov(v,{cwd:w,userConfigDir:p.userConfigDir});if(!a||!a.trim())return{trace:{steps:[{type:"error",message:"No command provided"}],segments:[]},result:"allowed",configSource:se,configValid:ae,...J};let ce=S(a,"auto");if(ce.status==="limited")throw new _;let le=ce.dialect==="powershell"?S(a,"posix"):ce,he=kt(le),be=$f(),ve=Pf(be);ve.recordGlobal({type:"parse",input:a,segments:he.map((Kt)=>[...Kt])});let _e=f("Bash",{command:a},{kind:"command",shell:"auto"},{configCwd:w,executionCwd:w},a),Be=re(_e,{environment:v,trace:ve,dependencies:{loadPolicySnapshot:()=>k,...G===void 0?{}:{getModes:()=>({...M,strict:G})}}}),Ue=Be.decision.kind==="deny"?Be.decision:null;if(Ue&&(Be.stage==="policy-protection"||Be.stage==="secret-protection")){let Kt=rv(Ue);return{trace:{steps:[],segments:[{index:0,steps:[{type:"rule-check",rule:Kt.rule,matched:!0,reason:Ue.reason}]}]},result:"blocked",reason:D(Ue.reason),segment:D(Ai(Ue,a)),...Kt.ruleId?{ruleId:D(Kt.ruleId)}:{},configSource:se,configValid:ae,...J}}let Oe=ve.getNextSegmentIndex();if(Ue&&Oe>0&&Oe<he.length)ve.recordSegment({type:"segment-skipped",index:Oe,reason:"prior-segment-blocked"},Oe);let Lt=be.finish(Ue?{result:"blocked",reason:Ue.reason,segment:Ai(Ue,a),...Ue.ruleId?{ruleId:Ue.ruleId}:{}}:{result:"allowed"}),Je=Ue?.ruleId??sv(_e,k,M,v),Rt=Q.find((Kt)=>Kt.id===Je&&Kt.activationCapability),cn=Rt?B.policy.effectiveDestructiveCommandRules[Rt.id]:void 0;return{trace:av(Lt),result:Ue?"blocked":"allowed",reason:Ue?D(Ue.reason):void 0,segment:Ue?D(Ai(Ue,a)):void 0,ruleId:Ue?.ruleId?D(Ue.ruleId):void 0,customRule:iv(cv(Ue?.ruleId,k)),configSource:se,configValid:ae,...J,...Rt&&cn?{ruleActivation:{id:Rt.id,...cn}}:{}}}function Ai(a,p){return a.evidence.find((v)=>v.kind==="command")?.segment??p}function rv(a){if(a.reason===nt)return{ruleId:"policy-protection",rule:"policy-protection:findPolicyConfigMutationTargetInSemanticFacts"};if(a.reason===tt)return{ruleId:"policy-apply-protection",rule:"policy-apply-protection:findPolicyApplyInvocationInSemanticFacts"};if(a.reason===R)return{ruleId:"git-metadata-protection",rule:"git-metadata-protection:findGitMetadataMutationTargetInSemanticFacts"};return{ruleId:a.ruleId,rule:"secret-protection:findSensitiveTargetInSemanticFacts"}}function ov(a,p){let v=H(p.cwd),w=p.userConfigPath??U(a,p),k=X(a,{cwd:p.cwd,userConfigDir:p.userConfigDir,userConfigPath:p.userConfigPath});try{if(r(k.projectConfigTarget)!==null){if(vn(k.projectConfigTarget).errors.length===0)return{configSource:v,configValid:!0};return{configSource:v,configValid:!1}}}catch(M){if(M instanceof o)return{configSource:v,configValid:!1};throw M}try{if(r(k.userConfigTarget)!==null){let M=vn(k.userConfigTarget);return{configSource:w,configValid:M.errors.length===0}}return{configSource:null,configValid:!0}}catch(M){if(M instanceof o)return{configSource:w,configValid:!1};throw M}}function sv(a,p,v,w){let k=p.policy,M=je({...k,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:{...k.destructiveCommandRuleOverrides,...Object.fromEntries(Q.flatMap((B)=>B.activationCapability?[[B.id,"on"]]:[]))}},p.state==="degraded"?{diagnostics:p.diagnostics,reason:p.reason}:void 0),G=re(a,{environment:w,dependencies:{loadPolicySnapshot:()=>M,getModes:()=>({...v,strict:!0,paranoidRm:!0,paranoidInterpreters:!0}),findSensitiveTarget:()=>null}});return G.decision.kind==="deny"?G.decision.ruleId:void 0}function iv(a){if(!a)return;return{id:D(a.id),...a.rulebook?{rulebook:{name:D(a.rulebook.name),version:D(a.rulebook.version)}}:{},...a.source?{source:D(a.source)}:{},...a.override?{override:{type:"reason",reason:D(a.override.reason)}}:{}}}function av(a){let p=a.events.flatMap((w)=>w.kind==="step"&&w.scope==="global"?[w.step]:[]),v=new Map;for(let w of a.events){if(w.kind!=="step"||w.scope!=="segment")continue;let k=v.get(w.segmentIndex)??{index:w.segmentIndex,steps:[]};k.steps.push(w.step),v.set(w.segmentIndex,k)}return{steps:p,segments:[...v.values()]}}function cv(a,p){let v=a?.replace(/^custom\./,"");if(!v||!p.policy.rules.some((w)=>w.name===v))return;return p.ruleMetadata[v]??Object.freeze({id:v})}function Rf(a){return new Promise((p)=>{process.stdout.write(`${a}
`,()=>p())})}async function Df(a,p){let v=Ci(p);if(!v)return 1;try{let w=Pr(v.command,{cwd:v.cwd},a),k=!!process.env.NO_COLOR||!process.stdout.isTTY;return await Rf(v.json?Ei(w):$i(w,{asciiOnly:k})),0}catch(w){let k=lv(w instanceof g?w.cause:w);if(k===void 0)throw w;if(v.json)return await Rf(JSON.stringify({error:k})),1;return console.error(k),1}}function lv(a){if(a instanceof _)return a.message;if(a instanceof u)return a.message;if(a instanceof s&&t[a.kind].errorCode==="path-canonicalization-limit")return"Path canonicalization work limit exceeded.";return}var Af="2.3.4",Wt="  ",Tn="cc-safety-net";function Tf(a){return a.argument?`${a.flags} ${a.argument}`:a.flags}function uv(a){return Math.max(...a.map((p)=>Tf(p).length))}function dv(a){return Math.max(...a.map((p)=>p.usage.length))}function pv(a){return Math.max(...a.map((p)=>`${Tn} ${p.usage}`.length))}function fv(a,p){let v=`${Tn} ${a.usage}`;return`${Wt}${v.padEnd(p+2)}${a.description}`}function dn(a,p){return`${Wt}${a.padEnd(Math.max(40,a.length+2))}${p}`}function Qn(a,p=console.log){let v=[];if(v.push(`${Tn} ${a.name}`),v.push(""),v.push(`${Wt}${a.description}`),v.push(""),v.push("USAGE:"),v.push(`${Wt}${Tn} ${a.usage}`),v.push(""),a.subcommands&&a.subcommands.length>0){v.push("SUBCOMMANDS:");let w=dv(a.subcommands);for(let k of a.subcommands)v.push(`${Wt}${k.usage.padEnd(w+2)}${k.description}`);v.push("")}if(a.options.length>0){v.push("OPTIONS:");let w=uv(a.options);for(let k of a.options){let M=Tf(k),G=k.default?`${k.description} (default: ${k.default})`:k.description;v.push(`${Wt}${M.padEnd(w+2)}${G}`)}v.push("")}if(a.examples&&a.examples.length>0){v.push("EXAMPLES:");for(let w of a.examples)v.push(`${Wt}${w}`)}p(v.join(`
`))}function Ti(){let a=pv(Fr),p=[];p.push(`${Tn} v${Af}`),p.push(""),p.push("Blocks destructive commands and secret access."),p.push(""),p.push("COMMANDS:");for(let v of Fr)p.push(fv(v,a));p.push(""),p.push("GLOBAL OPTIONS:"),p.push(`${Wt}-h, --help       Show help (use with command for command-specific help)`),p.push(`${Wt}-V, --version    Show version`),p.push(""),p.push("HELP:"),p.push(`${Wt}${Tn} help <command>     Show help for a specific command`),p.push(`${Wt}${Tn} <command> --help   Show help for a specific command`),p.push(""),p.push("ENVIRONMENT VARIABLES:"),p.push(dn(`${n.level.name}=standard|strict|paranoid`,"Set session safety level")),p.push(dn(`${n.worktree.name}=1`,"Allow local git discards in linked worktrees")),p.push(dn(`${n.debug.name}=1`,"Print diagnostic messages to stderr")),p.push(dn(`${n.auditScope.name}=all|blocked`,"Record all command decisions, or denials only")),p.push(dn("CC_SAFETY_NET_HOME","Override rule config home directory")),p.push(""),p.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"),p.push(dn(`${n.strict.name}=1`,"Force safety.overrides.fail_closed on")),p.push(dn(`${n.paranoid.name}=1`,"Force paranoid_rm and paranoid_interpreters on")),p.push(dn(`${n.paranoidRm.name}=1`,"Force safety.overrides.paranoid_rm on")),p.push(dn(`${n.paranoidInterpreters.name}=1`,"Force safety.overrides.paranoid_interpreters on")),p.push(""),p.push("Documentation:        https://ccsafetynet.com/docs"),console.log(p.join(`
`))}function If(){console.log(Af)}function $r(a,p=console.log){let v=Mr(a);if(!v)return!1;if(v.name.toLowerCase()!==a.toLowerCase())return!1;return Qn(v,p),!0}import{existsSync as Bi,readFileSync as Dm}from"node:fs";import{join as Zi}from"node:path";import*as wn from"node:readline";function mv(a){return a==="install"?"Install":"Uninstall"}function gv(a){return a==="install"?"Installing":"Uninstalling"}function hv(a){return a==="install"?"into":"from"}function Nf(a){return a?.available===!0}function yv(a,p){let v=new Set(p);return a.filter((w)=>v.has(w.target)).map((w)=>w.target)}function Of(a,p,v){if(a.length===0||a.every((w)=>!w.available))return p;return Array.from({length:a.length},(w,k)=>k+1).map((w)=>(p+w*v+a.length)%a.length).find((w)=>Nf(a[w]))}function vv(a,p,v){if(v.ctrl&&v.name==="c")return"interrupt";if(v.name==="escape"||p==="q")return"abort";if(a==="install"&&(p==="u"||p==="U"))return"update";if(v.name==="up"||p==="k")return"up";if(v.name==="down"||p==="j")return"down";if(v.name==="space"||p===" ")return"toggle";if(v.name==="return"||v.name==="enter")return"confirm";return null}function bv(a){return{cursor:a.findIndex((p)=>p.available),selected:[]}}function Lv(a,p,v){if(v==="confirm"||v==="update"||v==="abort"||v==="interrupt")return{state:a,done:v};if(v==="up")return{state:{...a,cursor:Of(p,a.cursor,-1)}};if(v==="down")return{state:{...a,cursor:Of(p,a.cursor,1)}};let w=p[a.cursor];if(!Nf(w))return{state:a};let k=a.selected.includes(w.target)?a.selected.filter((M)=>M!==w.target):yv(p,[...a.selected,w.target]);return{state:{...a,selected:k}}}var zf="◉",Ff="◯",Mf=">",Uf=" ";function wv(a,p,v,w={}){let k=w.color!==!1,M=k?We.dim:(J)=>J,G=k?We.green:(J)=>J,B=k?We.bold:(J)=>J;return["",`${mv(a)} CC Safety Net ${hv(a)}:`,"",...p.map((J,se)=>{let ae=v.selected.includes(J.target),ce=se===v.cursor,le=ae?zf:Ff,he=ce?Mf:Uf,be=J.available?"":` (${J.unavailableReason??"not installed"})`,ve=`${le} ${J.label}${be}`,_e=!J.available?M(ve):ae?G(ve):ce?B(ve):ve;return`${he} ${_e}`}),"",a==="install"?"Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel":p.some((J)=>J.available)?"Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel":`No selectable integrations found for ${a}. q/Esc: close`].join(`
`)}var jf=["global-hook","plugin"];function xv(a,p,v={}){let w=v.color!==!1?We.bold:(M)=>M;return["","Install the Kimi Code integration as:","",...[`Global hook — ${p?"already installed; selecting it reports the current state":"write the hook into ~/.kimi-code/config.toml now"}`,"Native Kimi plugin — print the steps to run inside Kimi Code"].map((M,G)=>{let B=G===a,J=`${B?zf:Ff} ${M}`;return`${B?Mf:Uf} ${B?w(J):J}`}),"","Enter: confirm  Up/Down: move  q/Esc: cancel"].join(`
`)}function Hf(a){let{input:p,output:v}=a;wn.emitKeypressEvents(p);let w=p.isRaw===!0;p.setRawMode(!0),p.resume();let k=0,M=()=>{if(k===0)return;wn.moveCursor(v,0,-k),wn.cursorTo(v,0),wn.clearScreenDown(v)},G=()=>{M();let B=a.render();v.write(`${B}
`),k=B.split(`
`).length};return new Promise((B)=>{let J=(ae)=>{p.off("keypress",se),p.setRawMode(w),p.pause(),M(),B(ae)};function se(ae,ce){a.onKey(ae,ce,{finish:J,draw:G})}p.on("keypress",se),G()})}function Zf(a={}){let p=0;return Hf({input:a.input??process.stdin,output:a.output??process.stdout,render:()=>xv(p,a.globalHookInstalled===!0),onKey:(v,w,k)=>{if(w.ctrl&&w.name==="c"){k.finish(null),(a.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(w.name==="escape"||v==="q")return k.finish(null);if(w.name==="return"||w.name==="enter")return k.finish(jf[p]);if(w.name==="up"||w.name==="down"||v==="k"||v==="j")p=(p+1)%jf.length,k.draw()}})}function Ii(a=process.stdin,p=process.stdout){return Boolean(a.isTTY&&p.isTTY&&typeof a.setRawMode==="function")}function Gf(a,p,v={}){let w=v.output??process.stdout,k=bv(p);return Hf({input:v.input??process.stdin,output:w,render:()=>wv(a,p,k),onKey:(M,G,B)=>{let J=vv(a,M,G);if(!J)return;let se=Lv(k,p,J);if(k=se.state,se.done==="interrupt"){B.finish(null),(v.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(se.done==="abort")return B.finish(null);if(se.done==="update")return B.finish("update");if(se.done==="confirm"){if(k.selected.length===0){w.write("\x07"),B.draw();return}B.finish([...k.selected]),w.write(`${gv(a)} selected integrations...
`);return}B.draw()}})}import{existsSync as qf,lstatSync as _v,mkdirSync as Sv,mkdtempSync as Cv,readdirSync as Pv,readFileSync as tr,rmSync as Fo}from"node:fs";import{basename as $v,dirname as Ev,join as Bt}from"node:path";import{fileURLToPath as Rv}from"node:url";var Oi="// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp",In="cc-safety-net",On="cc-safety-net/index.ts";import{spawn as kv}from"node:child_process";var ji=(a,p)=>{let v=En([...a],process.env);return new Promise((w)=>{let k=kv(v.cmd,v.args,{cwd:p,stdio:["ignore","pipe","pipe"]}),M=gi(k),G=!1,B=setTimeout(()=>{G=!0,k.kill()},120000);k.on("error",(J)=>{clearTimeout(B),w({status:null,errorCode:J.code,stdout:M.stdout,stderr:[J.message,M.stderr].filter(Boolean).join(`
`)})}),k.on("close",(J)=>{clearTimeout(B),w({status:G?null:J,errorCode:G?"ETIMEDOUT":void 0,stdout:M.stdout,stderr:M.stderr})})})};var er="cc-safety-net.ts",Bf=Bt("amp",On);function Dv(a){return Bt(a.home,".config","amp","plugins","cc-safety-net.ts")}function Av(){let a=Ev(Rv(import.meta.url));return[Bt(a,"..",Bf),Bt(a,"..","..","..","dist",Bf)]}function Tv(a=Av()){let p=a.find((v)=>qf(v)&&_v(v).isFile());if(!p)throw Error("Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.");return p}function Vf(a){try{return JSON.parse(a)}catch{return}}function Mo(a){return a.subarray(0,Buffer.byteLength(Oi)).toString("utf-8")===Oi}async function Er(a,p,v){let w=await a(p,v);if(w.status===0)return w;throw Error([`Failed to run ${p.join(" ")}${w.status===null?"":` (exit ${w.status})`}.`,[w.stdout,w.stderr].filter(Boolean).join(`
`).trim()].filter(Boolean).join(`
`))}async function Jf(a){let p=await a(["amp","plugins","repositories","--json"]);if(p.status===null)throw Error(`${p.errorCode==="ENOENT"?'Amp CLI not found. Install the amp CLI, sign in with "amp login", and rerun install --amp.':`amp plugins repositories --json did not finish (${p.errorCode??"terminated"}). Check that the amp CLI responds and rerun install --amp.`}
${p.stderr}`.trim());if(p.status!==0)throw Error(`Failed to run amp plugins repositories --json (exit ${p.status}). Sign in with "amp login" and rerun install --amp.
${[p.stdout,p.stderr].filter(Boolean).join(`
`)}`.trim());let v=Vf(p.stdout),w=(Array.isArray(v)?v:[]).filter((k)=>_t(k,"scope")==="user"&&_t(k,"exists")===!0&&_t(k,"viewerCanWrite")===!0).map((k)=>_t(k,"cloneRef")).find((k)=>typeof k==="string"&&k.length>0);if(!w)throw Error('Your Amp account has no writable Personal Plugins repository. Sign in with "amp login", open Amp once to create it, and rerun install --amp.');return w}async function Wf(a,p,v){let w=Cv(Bt(p.tmpdir,"cc-safety-net-amp-"));try{return await Er(a,["amp","clone","user-plugins",w]),await v(w)}finally{Fo(w,{recursive:!0,force:!0})}}function Ni(a){return`rerun ${a==="overwrite"?"install":"uninstall"} --amp`}function Kf(a,p,v){let w=Bt(a,p),k=Ot(w);if(!k)return;if(k.isSymbolicLink()||!k.isFile())throw Error(`Refusing to ${v} ${p} in your Amp personal plugins repository: not a regular file. Remove it there and ${Ni(v)}.`);let M=tr(w);if(Mo(M))return M;throw Error(`Refusing to ${v} unmanaged file ${p} in your Amp personal plugins repository. Remove it there and ${Ni(v)}.`)}function Yf(a,p){let v=Bt(a,In),w=Ot(v);if(!w)return;if(w.isSymbolicLink()||!w.isDirectory())throw Error(`Refusing to ${p} ${In} in your Amp personal plugins repository: not a regular directory. Remove it there and ${Ni(p)}.`);return Kf(a,On,p)}function Iv(a){let p=Bt(a,er),v=Ot(p);if(!v||v.isSymbolicLink()||!v.isFile())return;let w=tr(p);return Mo(w)?w:void 0}async function Xf(a,p,v,w){if(await Er(a,v,p),(await Er(a,["git","status","--porcelain"],p)).stdout.trim()==="")return!1;return await Er(a,["git","-c","commit.gpgsign=false","-c","user.name=cc-safety-net","-c","user.email=cc-safety-net@localhost","commit","-m",w],p),await Er(a,["git","push","origin","HEAD"],p),!0}function zo(a,p){Ov(a,p),jv(a,p)}function Qf(a,p){if(p==="keep")return;throw Error(`Local Amp plugin ${a} is not a managed copy and masks the personal plugin. Remove it and rerun install --amp.`)}function Ov(a,p){let v=Dv(a),w=Ot(v);if(!w)return;if(!w.isSymbolicLink()&&w.isFile()&&Mo(tr(v))){Fo(v);return}Qf(v,p)}function jv(a,p){let v=Bt(a.home,".config","amp","plugins",In),w=Ot(v);if(!w)return;if(!w.isSymbolicLink()&&w.isDirectory()&&Nv(v)){Fo(v,{recursive:!0});return}Qf(v,p)}function Nv(a){let p=$v(On);if(Pv(a).join("\x00")!==p)return!1;let v=Bt(a,p),w=Ot(v);return!!w&&!w.isSymbolicLink()&&w.isFile()&&Mo(tr(v))}function zv(a){let p=b(a);if(!qf(p))return"";let v=Vf(tr(p,"utf-8"));if(!v||typeof v!=="object"||Array.isArray(v))return"";return`;globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = ${JSON.stringify(m(v,a.home))};
`}async function em(a,p=Tv(),v=ji){let w=Buffer.concat([tr(p),Buffer.from(zv(a),"utf-8")]),k=await Jf(v);return Wf(v,a,async(M)=>{let G=`${k}/${In}`,B=Yf(M,"overwrite"),J=Kf(M,er,"overwrite");if(B?.equals(w)&&!J)return zo(a,"fail"),{path:G,alreadyInstalled:!0};if(Sv(Bt(M,In),{recursive:!0}),Nt(Bt(M,On),w),J)Fo(Bt(M,er));let se=await Xf(v,M,["git","add","--",On,...J?[er]:[]],`chore: update cc-safety-net plugin to v${jt()}`);return zo(a,"fail"),{path:G,alreadyInstalled:!se}})}async function tm(a,p=ji){let v=await Jf(p);return Wf(p,a,async(w)=>{let k=Yf(w,"remove"),M=Iv(w),G=`${v}/${M&&!k?er:In}`;if(!k&&!M)return zo(a,"keep"),{path:G,alreadyInstalled:!1};return await Xf(p,w,["git","rm","--",...k?[On]:[],...M?[er]:[]],`chore: remove cc-safety-net plugin v${jt()}`),zo(a,"keep"),{path:G,alreadyInstalled:!0}})}import{existsSync as nm,mkdirSync as Fv,readFileSync as Mv}from"node:fs";import{dirname as Uv}from"node:path";var zi=on["antigravity-cli"],jn="cc-safety-net";function Nn(a){return Boolean(a)&&typeof a==="object"&&!Array.isArray(a)}function Ho(){return{PreToolUse:[{hooks:[{type:"command",command:zi,timeout:30}]}]}}function rm(a){try{let p=JSON.parse(Mv(a,"utf-8"));if(!p||typeof p!=="object"||Array.isArray(p))throw Error("Antigravity hooks config must be a JSON object");return p}catch(p){if(p instanceof SyntaxError)throw Error(`Failed to parse Antigravity hooks config ${a}: ${p.message}`);throw p}}function om(a){let p=a[jn];if(p===void 0){let w=Ho();return a[jn]=w,{definition:w,preToolUse:w.PreToolUse??[]}}if(!Nn(p))throw Error(`Antigravity hooks config entry "${jn}" must be an object`);let v=Array.isArray(p.PreToolUse)?p.PreToolUse:[];return p.PreToolUse=v,{definition:p,preToolUse:v}}function sm(a){if(!Array.isArray(a.PreToolUse))return!1;return a.PreToolUse.some((p)=>Nn(p)&&Array.isArray(p.hooks)&&p.hooks.some((v)=>Nn(v)&&v.command===zi))}function Hv(a){return Object.values(a).some((p)=>Nn(p)&&p.enabled!==!1&&sm(p))}function Zv(a){if(a[jn]===void 0)return!1;let p=om(a);if(p.definition.enabled!==!1||!sm(p.definition))return!1;return p.definition.enabled=!0,!0}function Gv(a){if(a[jn]===void 0){a[jn]=Ho();return}let p=om(a);p.definition.enabled=!0,p.preToolUse.push(Ho().PreToolUse?.[0]??{hooks:[]})}function Bv(a){let p=!1;for(let v of Object.values(a)){if(!Nn(v)||!Array.isArray(v.PreToolUse))continue;v.PreToolUse=v.PreToolUse.flatMap((w)=>{if(!Nn(w)||!Array.isArray(w.hooks))return[w];let k=w.hooks.filter((M)=>!Nn(M)||M.command!==zi);if(k.length!==w.hooks.length)p=!0;return k.length===0?[]:[{...w,hooks:k}]})}return p}function Uo(a,p){Nt(a,`${JSON.stringify(p,null,2)}
`)}function im(a){let p=Ge(a.home);if(Fv(Uv(p),{recursive:!0}),!nm(p))return Uo(p,{[jn]:Ho()}),{path:p,alreadyInstalled:!1};let v=rm(p);if(Hv(v))return{path:p,alreadyInstalled:!0};if(Zv(v))return Uo(p,v),{path:p,alreadyInstalled:!1};return Gv(v),Uo(p,v),{path:p,alreadyInstalled:!1}}function am(a){let p=Ge(a.home);if(!nm(p))return{path:p,alreadyInstalled:!1};let v=rm(p);if(!Bv(v))return{path:p,alreadyInstalled:!1};return Uo(p,v),{path:p,alreadyInstalled:!0}}import{existsSync as qv,readdirSync as Vv,rmSync as Jv}from"node:fs";import{join as Wv}from"node:path";function cm(a,p=process.platform,v){if(!qv(a))return;let w=p==="win32"?/^bunx-\d+-cc-safety-net@/:new RegExp(`^bunx-${process.getuid?.()??0}-cc-safety-net@`);Vv(a).filter((k)=>k!==v&&w.test(k)).forEach((k)=>{Jv(Wv(a,k),{recursive:!0,force:!0})})}import{spawn as Kv}from"node:child_process";var an=W.map((a)=>({target:a.id,flag:a.flag,label:d(a.id),probeCommand:a.probeCommand}));function Fi(a){let p=new Set(a);return an.map((v)=>v.target).filter((v)=>p.has(v))}async function lm(a,p){for(let v of a)await p(v)}var Yv=5000;function Mi(a){return new Promise((p)=>{let v=En([...a],process.env),w=Kv(v.cmd,v.args,{env:process.env,stdio:"ignore"}),k=!1,M=(B)=>{if(k)return;k=!0,clearTimeout(G),p(B)},G=setTimeout(()=>{w.kill(),M(!1)},Yv);w.on("error",()=>M(!1)),w.on("close",(B)=>M(B===0))})}function um(a=Mi,p={}){let v=new Set(p.configuredTargets??[]);return Promise.all(an.map(async(w)=>({target:w.target,flag:w.flag,label:w.label,...pm(p.action,await a(w.probeCommand),v.has(w.target))})))}function dm(a,p){let v=new Set(p.configuredTargets??[]);return a.map((w)=>({...w,...pm(p.action,w.available,v.has(w.target))}))}function pm(a,p,v){if(a==="uninstall")return v?{available:!0}:{available:!1,unavailableReason:"not installed"};if(a==="install"&&v)return{available:!1,unavailableReason:"already installed"};if(!p)return{available:!1,unavailableReason:"CLI not installed"};return{available:!0}}import{existsSync as fm,readdirSync as Xv,rmSync as Qv}from"node:fs";import{join as nr}from"node:path";function Zo(a,p=process.platform){let v=nr(a.env.get("npm_config_cache")||(p==="win32"?nr(a.env.get("LOCALAPPDATA")||nr(a.home,"AppData","Local"),"npm-cache"):nr(a.home,".npm")),"_npx");if(!fm(v))return;Xv(v).filter((w)=>fm(nr(v,w,"node_modules","cc-safety-net"))).forEach((w)=>{Qv(nr(v,w),{recursive:!0,force:!0})})}import{existsSync as bm,mkdirSync as tb,readFileSync as Lm}from"node:fs";import{dirname as nb,join as vm}from"node:path";function eb(a,p){if(a[p]!=="#")return p;let v=a.indexOf(`
`,p+1);return v===-1?a.length:v+1}function Ui(a,p,v){let w=new RegExp(`^(\\s*)${p}\\s*=\\s*\\[`),k=0;for(let M of a.split(`
`)){if(/^\s*\[/.test(M))return;let G=w.exec(M);if(G){let B=k+G[0].lastIndexOf("[");return{start:B,end:Xs(a,B,{skipComment:eb,...v})}}k+=M.length+1}return}function mm(a,p,v){let w=a.slice(0,p.end).trimEnd(),k=op(a,p.end),M=k===""?"     ":`${k}  `,G=!w.endsWith("[")&&!w.endsWith(",");return`${w}${G?",":""}
${M}${v}${a.slice(p.end)}`}function gm(a,p,v){let w=a.indexOf(v,p.start);if(w===-1||w>p.end)return a;return wo(a,{start:w,end:w+v.length})}function hm(a,p){let v=new RegExp(`^\\s*${p}\\s*=\\s*\\[\\s*]\\s*(?:#.*)?$`),w=a.split(`
`),k=w.findIndex((B)=>/^\s*\[/.test(B)),M=k===-1?w:w.slice(0,k),G=k===-1?[]:w.slice(k);return[...M.filter((B)=>!v.test(B)),...G].join(`
`)}function ym(a,p,v){let w=new RegExp(`^\\s*\\[\\[${p}]]\\s*$`,"m");return a.split(/(?=^\s*\[)/m).filter((k)=>!w.test(k)||!k.includes(v)).join("").trimEnd()}var Rr=on["kimi-code"],Hi=`[[hooks]]
event = "PreToolUse"
command = "${Rr}"`,wm=`{ event = "PreToolUse", command = "${Rr}" }`,xm={stringError:"Unterminated string in Kimi Code config",bracketError:"Unmatched hooks array in Kimi Code config"};function km(a){return vm(a.env.get("KIMI_CODE_HOME")??vm(a.home,".kimi-code"),"config.toml")}function rb(a){let p=Ui(a,"hooks",xm);if(p&&a.slice(p.start+1,p.end).trim())return mm(a,p,wm);let v=hm(a,"hooks").trimEnd();if(v==="")return`${Hi}
`;return`${v}

${Hi}
`}function _m(a){let p=km(a);if(tb(nb(p),{recursive:!0}),!bm(p))return Nt(p,`${Hi}
`),{path:p,alreadyInstalled:!1};let v=Lm(p,"utf-8");if(v.includes(Rr))return{path:p,alreadyInstalled:!0};return Nt(p,rb(v)),{path:p,alreadyInstalled:!1}}function Sm(a){let p=km(a);if(!bm(p))return{path:p,alreadyInstalled:!1};let v=Lm(p,"utf-8");if(!v.includes(Rr))return{path:p,alreadyInstalled:!1};let w=Ui(v,"hooks",xm),k=w?gm(v,w,wm):`${ym(v,"hooks",Rr)}
`;return Nt(p,k),{path:p,alreadyInstalled:!0}}var Gi="safety-net@cc-marketplace",Cm=new Set(["claude-code","codex","copilot-cli","gemini-cli","hermes-agent","openclaw","opencode","pi"]),Pm=new Set(["antigravity-cli","cursor","grok-build","hermes-agent","kimi-code"]);function qi(a){return/^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(a??"")}function Am(a){return/^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(a??"")}function ob(a){return/^Marketplace `cc-marketplace`\s*$/m.test(a??"")}var Tm={"claude-code":{installCommands:(a)=>{let p=bo(a,"cc-safety-net@cc-marketplace");return{commands:[...p?[["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","update","cc-safety-net@cc-marketplace"]]:[["claude","plugin","marketplace","add","kenryu42/cc-marketplace"],["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","install","cc-safety-net@cc-marketplace"]],...Ks(a).status==="disabled"?[["claude","plugin","enable","cc-safety-net@cc-marketplace"]]:[]],cleanupCommands:bo(a,Gi)?[["claude","plugin","uninstall",Gi]]:[],update:p}},uninstallCommands:[["claude","plugin","uninstall","cc-safety-net@cc-marketplace"],["claude","plugin","marketplace","remove","cc-marketplace"]]},codex:{installCommands:async(a,p)=>{let v=p??await sn(["codex","plugin","list"]),w=Am(v);return{commands:[w||ob(v)?["codex","plugin","marketplace","upgrade","cc-marketplace"]:["codex","plugin","marketplace","add","kenryu42/cc-marketplace"],["codex","plugin","add","cc-safety-net@cc-marketplace"]],cleanupCommands:qi(v)?[["codex","plugin","remove","safety-net@cc-marketplace"]]:[],update:w}},uninstallCommands:[["codex","plugin","remove","cc-safety-net@cc-marketplace"],["codex","plugin","marketplace","remove","cc-marketplace"]],postInstallMessage:"Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it."},"copilot-cli":{installCommands:async()=>{let a=await sn(["copilot","plugin","list"]),p=[...pp(a)?[["copilot","plugin","uninstall","copilot-safety-net"]]:[],...fp(a)?[["copilot","plugin","uninstall",lp]]:[]];if(up(a))return{commands:[["copilot","plugin","marketplace","update","cc-marketplace"],["copilot","plugin","update",rn]],cleanupCommands:p,update:!0};return{commands:[dp(await sn(["copilot","plugin","marketplace","list"]))?["copilot","plugin","marketplace","update","cc-marketplace"]:["copilot","plugin","marketplace","add","kenryu42/cc-marketplace"],["copilot","plugin","install",rn]],cleanupCommands:p}},uninstallCommands:[["copilot","plugin","uninstall","cc-safety-net@cc-marketplace"],["copilot","plugin","marketplace","remove","cc-marketplace"]]},"gemini-cli":{installCommands:(a)=>{let p=si(a);if(p.status==="configured")return{commands:[["gemini","extensions","update","gemini-safety-net"]],update:!0};if(p.status==="disabled")return{commands:[["gemini","extensions","update","gemini-safety-net"],["gemini","extensions","enable","gemini-safety-net"]],update:!0};return{commands:[["gemini","extensions","install","https://github.com/kenryu42/gemini-safety-net","--consent"]]}},uninstallCommands:[["gemini","extensions","uninstall","gemini-safety-net"]]},openclaw:{beforeInstall:bi,installCommands:()=>({commands:tf()}),uninstallCommands:[["openclaw","plugins","uninstall",Tt,"--force"]],postInstallMessage:["Restart the OpenClaw Gateway to apply the change.","If plugins.allow is set in openclaw.json, it must also list cc-safety-net."].join(`
`)},opencode:{beforeInstall:xi,installCommands:[["opencode","plugin","-g","-f","cc-safety-net@latest"]]},pi:{installCommands:[["pi","install","npm:cc-safety-net"]],uninstallCommands:[["pi","uninstall","npm:cc-safety-net"]]}};function Im(a,p=(v)=>v){try{let v=JSON.parse(p(Dm(a,"utf-8")));if(!v||typeof v!=="object"||Array.isArray(v))throw Error(`Settings file ${a} must be a JSON object`);return v}catch(v){if(v instanceof SyntaxError)throw Error(`Failed to parse ${a}: ${v.message}`);throw v}}function sb(a){let p=Zi(vr(a),"settings.json");if(!Bi(p))return;let v=Im(p,qt),w=v.enabledPlugins;if(!w||typeof w!=="object"||Array.isArray(w))return;if(w[rn]!==!1)return;let k=Dm(p,"utf-8"),M=k.replace(new RegExp(`("${rn}"\\s*:\\s*)false`),"$1true");return w[rn]=!0,Nt(p,M!==k?M:`${JSON.stringify(v,null,2)}
`),`Enabled ${rn} plugin in ${p}`}function ib(a){let p=ki(a);if(!Bi(p))return;let v=Im(p);if(!Array.isArray(v.packages))return;let w=v.packages.find((k)=>!!k&&typeof k==="object"&&!Array.isArray(k)&&_i(k.source)&&("extensions"in k));if(!w)return;return delete w.extensions,Nt(p,`${JSON.stringify(v,null,2)}
`),`Enabled npm:cc-safety-net extensions in ${p}`}function $m(a,p){let v=c({label:p,booleans:Object.fromEntries(an.map((M)=>[M.target,[M.flag]]))},a),w=v.errors[0];if(w)throw Error(w);let k=an.filter((M)=>v.flags[M.target]).map((M)=>M.target);if(k.length!==1)throw Error(`Choose exactly one ${p} target: ${an.map((M)=>M.flag).join(", ")}`);return k[0]}async function Om(a,p=Bn){let[v,w,k]=await Promise.all([p(["amp","plugins","list"],30000),p(["codex","plugin","list"],30000),p(["copilot","--binary-version"])]);return{codexPluginListOutput:w,hooks:Yn(a,process.cwd(),{ampPluginListOutput:v,codexPluginListOutput:w,copilotCliVersion:k})}}async function ab(a,p,v=Bn){let w=await Om(a,v);return w.hooks.filter((k)=>p==="install"?k.configured:k.detected||k.inspectionStatus==="not-inspected").filter((k)=>k.platform!=="codex"||!qi(w.codexPluginListOutput)||Am(w.codexPluginListOutput)).map((k)=>k.platform)}function cb(a,p,v,w){if(v.length>0)return{finish:async()=>[$m(v,p)]};if(!w.selectTargets&&!Ii(w.input,w.output))return{finish:async()=>[$m(v,p)]};let k=w.detectConfiguredTargets??(()=>ab(a,p,w.fetchVersion)),M=Promise.all([um(w.probeTargets),k()]);return{ready:M,finish:async()=>{let[G,B]=await M,J=dm(G,{action:p,configuredTargets:B}),se=w.selectTargets?await w.selectTargets(p,Rm(p,J)):await Gf(p,Rm(p,J),{input:w.input,output:w.output});if(se==="update")return se;if(!se||se.length===0)return null;return Fi(se)}}}async function zn(a,p,v=!1,w){let k=Tm[a];k.beforeInstall?.(p);let M=typeof k.installCommands==="function"?await k.installCommands(p,w):{commands:k.installCommands};return await hi(M.commands),await Wp(M.cleanupCommands??[]),[`${M.update||v?"Updated":"Installed"} ${d(a)} integration`,k.postInstallMessage].filter(Boolean).join(`
`)}async function rr(a){let p=Tm[a];if(!p.uninstallCommands)throw Error(`${d(a)} uninstall is not supported`);return await hi(p.uninstallCommands),`Uninstalled ${d(a)} integration`}function lb(a){let p=yf(a);return p.alreadyInstalled?`Uninstalled OpenCode plugin from ${p.path}`:`OpenCode plugin not installed in ${p.path}`}var ub={"antigravity-cli":{install:im,uninstall:am},cursor:{install:kp,uninstall:_p},"grok-build":{install:Ip,uninstall:Op},"kimi-code":{install:_m,uninstall:Sm}};function xn(a,p,v,w=!1){if(a==="install"&&!w)Zo(v);let k=ub[p][a](v),M=d(p),G=a!=="install"?"Uninstalled":w?"Updated":"Installed";return a==="install"&&k.alreadyInstalled?w?`${M} hook up to date in ${k.path}`:`${M} hook already installed in ${k.path}`:a==="uninstall"&&!k.alreadyInstalled?`${M} hook not installed in ${k.path}`:`${G} ${M} hook ${a==="install"?"in":"from"} ${k.path}`}var db={amp:{install:em,uninstall:tm,restartNote:'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.'},"hermes-agent":{install:Fp,uninstall:Mp,afterInstall:async(a)=>{let p=fi(a);return await sn(["hermes","plugins","enable",Vt,"--no-allow-tool-override"]),!p},beforeUninstall:async(a)=>{pi(a);try{await sn(["hermes","plugins","disable",Vt])}catch(p){console.warn(`${p instanceof Error?p.message:String(p)}
Removing the plugin files anyway; ${Vt} may still be listed in the Hermes config.`)}},restartNote:"Restart Hermes to apply the change."}};async function Go(a,p,v,w=!1){let k=db[p];if(a==="uninstall")await k.beforeUninstall?.(v);let M=a==="install"?await k.install(v):await k.uninstall(v),G=a==="install"&&await k.afterInstall?.(v),B=d(p),J=!G&&(a==="install"&&M.alreadyInstalled||a==="uninstall"&&!M.alreadyInstalled);return[J?a==="install"?`${B} plugin ${w?"up to date":"already installed"} at ${M.path}`:`${B} plugin not installed at ${M.path}`:`${a!=="install"?"Uninstalled":w?"Updated":"Installed"} ${B} plugin ${a==="install"?"at":"from"} ${M.path}`,J?void 0:k.restartNote].filter(Boolean).join(`
`)}var pb={amp:{install:(a,p)=>Go("install","amp",a,p),uninstall:(a)=>Go("uninstall","amp",a)},"antigravity-cli":{install:(a,p)=>xn("install","antigravity-cli",a,p),uninstall:(a)=>xn("uninstall","antigravity-cli",a)},"claude-code":{install:(a,p)=>zn("claude-code",a,p),uninstall:()=>rr("claude-code")},codex:{install:(a,p,v)=>zn("codex",a,p,v),uninstall:()=>rr("codex")},"copilot-cli":{install:async(a,p)=>[await zn("copilot-cli",a,p),sb(a)].filter(Boolean).join(`
`),uninstall:()=>rr("copilot-cli")},cursor:{install:(a,p)=>xn("install","cursor",a,p),uninstall:(a)=>xn("uninstall","cursor",a)},"gemini-cli":{install:(a,p)=>zn("gemini-cli",a,p),uninstall:()=>rr("gemini-cli")},"grok-build":{install:(a,p)=>xn("install","grok-build",a,p),uninstall:(a)=>xn("uninstall","grok-build",a)},"hermes-agent":{install:(a,p)=>{if(!p)Zo(a);return Go("install","hermes-agent",a,p)},uninstall:(a)=>Go("uninstall","hermes-agent",a)},"kimi-code":{install:(a,p)=>xn("install","kimi-code",a,p),uninstall:(a)=>xn("uninstall","kimi-code",a)},openclaw:{install:async(a,p)=>{let v=await zn("openclaw",a,p);return await nf(),v},uninstall:(a)=>(bi(a),rr("openclaw"))},opencode:{install:async(a,p)=>{let v=await zn("opencode",a,p);return await gf(a),v},uninstall:(a)=>lb(a)},pi:{install:async(a,p)=>[await zn("pi",a,p),ib(a)].filter(Boolean).join(`
`),uninstall:()=>rr("pi")}},Em=["Install CC Safety Net as a native Kimi Code plugin:","","  1. Start Kimi Code and run: /plugins install https://github.com/kenryu42/cc-safety-net","     Confirm the trust prompt; it defaults to cancel.","  2. Run /reload, or start a new session.","","Note: Kimi Code hooks are fail-open. When the hook process cannot start, crashes, or times","out, Kimi Code allows the tool call."].join(`
`);function fb(a){if(kr({environment:a,cwd:process.cwd()}).status!=="configured")return Em;return[Em,"",We.red(["CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.","After the plugin is active, remove it with: cc-safety-net uninstall --kimi-code"].join(`
`))].join(`
`)}function Rm(a,p){return p.map((v)=>a==="install"&&v.target==="kimi-code"&&v.unavailableReason==="already installed"?{...v,available:!0,unavailableReason:void 0,label:`${v.label} (global hook installed)`}:v)}function mb(a,p){if(a.selectKimiInstallMethod)return a.selectKimiInstallMethod();if(!Ii(a.input,a.output))return Promise.resolve("global-hook");return Zf({input:a.input,output:a.output,globalHookInstalled:kr({environment:p,cwd:process.cwd()}).status==="configured"})}async function jm(a,p,v,w=!1,k){return pb[p][a](v,w,k)}function gb(a){let p=c({label:"update"},a).errors[0];if(p)throw Error(p)}async function hb(a,p=Bn){let v=await Om(a,p),w=Zi(vr(a),"installed-plugins");return{targets:Fi([...v.hooks.filter((M)=>M.platform!=="copilot-cli"&&M.detected).map((M)=>M.platform),...[xo,cp,ap].flatMap((M)=>Bi(Zi(w,...M))?["copilot-cli"]:[]),...bo(a,Gi)?["claude-code"]:[],...qi(v.codexPluginListOutput)?["codex"]:[]]),codexPluginListOutput:v.codexPluginListOutput}}async function yb(a){let p=l(),v=a.output??process.stdout,w=(a.scriptPath??process.argv[1]??"").split(/[\\/]/),k=w.find((he)=>/^bunx-\d+-/.test(he)),M=k!==void 0||w.includes("_npx")?null:(a.checkLatestVersion??bn)(),G=async()=>{let he=M&&await M;if(he?.updateAvailable)v.write(`
Update available: cc-safety-net ${he.currentVersion} → ${he.latestVersion}. Update this CLI with your package manager, e.g. \`npm i -g cc-safety-net@latest\` for a global install.
`)},B=hb(p,a.fetchVersion??Bn).then(async(he)=>{let be=new Set(he.targets);return{targets:he.targets,codexPluginListOutput:he.codexPluginListOutput,available:new Map(await Promise.all(an.filter((ve)=>be.has(ve.target)&&Cm.has(ve.target)).map(async(ve)=>[ve.target,await Mi(ve.probeCommand)])))}}),J=await yr(a.showBanner??!0,()=>({ready:B,finish:()=>B}),()=>hr({input:a.input??process.stdin,output:v}),{loadingMessage:"Checking installed integrations…",output:v}),se=await Promise.resolve().then(()=>(cm(p.tmpdir,process.platform,k),null)).catch((he)=>Dr(he));if(J.targets.length===0){if(v.write("No installed integrations found. Run `cc-safety-net install` to set one up.\n"),se!==null)console.error(se);return await G(),se===null?0:1}let ae=J.targets.some((he)=>Pm.has(he))?await Promise.resolve().then(()=>(Zo(p),null)).catch((he)=>Dr(he)):null,ce=await ho(Promise.all(J.targets.map((he)=>{if(Cm.has(he)&&!J.available.get(he))return Promise.resolve({message:`${d(he)} not found; skipped`,failed:!1});if(ae!==null&&Pm.has(he))return Promise.resolve({message:ae,failed:!0});return jm("install",he,p,!0,J.codexPluginListOutput).then((be)=>({message:be,failed:!1}),(be)=>({message:Dr(be),failed:!0}))})),{loadingMessage:`Updating ${J.targets.length} integration${J.targets.length===1?"":"s"}…`,output:v}),le=se===null?ce:[...ce,{message:se,failed:!0}];return le.forEach((he)=>{he.failed?console.error(he.message):v.write(`${he.message}
`)}),await G(),le.some((he)=>he.failed)?1:0}function Vi(a,p={}){return Promise.resolve().then(()=>gb(a)).then(()=>yb(p)).catch((v)=>(console.error(Dr(v)),1))}async function Ar(a,p,v={}){try{let w=l(),k=await yr(!0,()=>cb(w,a,p,v),()=>hr({input:v.input??process.stdin,output:v.output??process.stdout}),{loadingMessage:a==="install"?"Checking available integrations…":"Checking installed integrations…",output:v.output??process.stdout});if(!k)return(v.output??process.stdout).write(`Cancelled: nothing was ${a}ed.
`),0;if(k==="update")return(v.runUpdate??(()=>Vi([],{fetchVersion:v.fetchVersion,input:v.input,output:v.output,showBanner:!1})))();let M=v.output??process.stdout;return await lm(k,async(G)=>{if(G==="kimi-code"&&a==="install"){let J=await mb(v,w);if(J===null){M.write(`Cancelled: Kimi Code integration was not installed.
`);return}if(J==="plugin"){M.write(`${fb(w)}
`);return}}let B=await ho(jm(a,G,w),{loadingMessage:`${a==="install"?"Installing":"Uninstalling"} ${d(G)} integration…`,output:M});M.write(`${B}
`)}),0}catch(w){return console.error(Dr(w)),1}}function Dr(a){let p=a instanceof Error?a.message:String(a),v=typeof a==="object"&&a!==null&&"code"in a?a.code:null;if(v==="EACCES"||v==="EPERM")return`${p}
Check file permissions for the target config file and parent directory.`;if(v==="ENOENT")return`${p}
Check that the target config path and parent directory exist.`;if(v==="ENOTDIR")return`${p}
Check that every parent path component is a directory.`;return p}import{mkdirSync as Lb}from"node:fs";import{dirname as wb}from"node:path";import{createInterface as xb}from"node:readline";import{existsSync as zm,readFileSync as vb}from"node:fs";function Nm(a,p){return{"safety.level":a.safety.level,...Ji("safety.overrides",a.safety.overrides),"workflow.worktree_mode":String(a.workflow.worktree_mode),"destructive_command_protection.enabled":String(a.destructive_command_protection.enabled),...Ji("destructive_command_protection.overrides",a.destructive_command_protection.overrides),"destructive_command_protection.allow_paths":Wi(a.destructive_command_protection.allow_paths),"secret_protection.enabled":String(a.secret_protection.enabled),...Ji("secret_protection.overrides",a.secret_protection.overrides),"secret_protection.deny_paths":Wi(a.secret_protection.deny_paths),"secret_protection.allow_paths":Wi(a.secret_protection.allow_paths),...p?{"audit.retention_days":String(a.audit.retention_days)}:{}}}function Bo(a,p,v){let w=Nm(a,v),k=Nm(p,v);return[...new Set([...Object.keys(w),...Object.keys(k)])].flatMap((M)=>w[M]===k[M]?[]:[{field:M,before:w[M],after:k[M]}])}function Tr(a,p){let v=b(a,p);if(!zm(v))return{baseline:m(globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__,a.home),diagnostics:[]};let w=Fn(v);return{baseline:m(w.value,a.home),diagnostics:w.errors.length>0?w.errors:z(w.value,a.home)}}function Fn(a){if(!zm(a))return{errors:[`${a}: file not found`]};try{return{value:JSON.parse(vb(a,"utf-8")),errors:[]}}catch(p){let v=p instanceof Error?p.message:String(p);return{errors:[`${a}: ${p instanceof SyntaxError?`Invalid JSON: ${v}`:v}`]}}}function qo(a,p){let v=bb(a)?a:{};return{version:p.version,...Object.fromEntries(["safety","workflow","destructive_command_protection","secret_protection"].filter((w)=>v[w]!==void 0).map((w)=>[w,v[w]]))}}function Ji(a,p){return Object.fromEntries(Object.entries(p).flatMap(([v,w])=>w===void 0?[]:[[`${a}.${v}`,String(w)]]))}function Wi(a){return a.length===0?"(none)":a.join(", ")}function bb(a){return!!a&&typeof a==="object"&&!Array.isArray(a)}var Fm=new Set(["check","apply"]),Mm="(unset)";async function Hm(a,p,v={}){let w=c({label:"policy",booleans:{global:["-g","--global"]},positionals:"list"},p),k=w.positionals[0],M=[...w.errors,...k&&!Fm.has(k)?[`Unknown policy subcommand: ${k}`]:[],...k&&Fm.has(k)&&!w.positionals[1]?[`policy ${k} requires a file`]:[],...w.positionals.slice(2).map((be)=>`Unexpected policy argument: ${be}`)];if(M.length>0){for(let be of M)console.error(be);return 1}let G=w.positionals[1];if(!k||!G)return Qn(zr,console.error),1;let B=w.flags.global?b(a):L(v.cwd??process.cwd()),J=Fn(G),se=[...J.errors,...z(J.value,a.home).map((be)=>`${G}: ${be}`),...!w.flags.global&&Sb(J.value)&&J.value.audit!==void 0?[`${G}: audit settings are user scope only; remove the audit section from a project proposal`]:[]];if(se.length>0){for(let be of se)console.error(be);return 1}let ae=m(J.value,a.home);if(console.log(`Scope: ${w.flags.global?"user":"project"} (${B})`),console.log(`Proposal: ${G}`),w.flags.global)Um(m(Fn(B).value,a.home),ae,!0);if(!w.flags.global){let be=Tr(a).baseline;console.log("Effective policy (user + project merged):"),Um(me(be,Se(Fn(B).value,a.home).policy).policy,me(be,Se(J.value,a.home).policy).policy,!1)}if(k==="check")return 0;let ce=v.input??process.stdin,le=v.output??process.stdout;if(!ce.isTTY||!le.isTTY)return console.error("policy apply confirms interactively; run this yourself in a terminal:"),console.error(`  cc-safety-net policy apply ${G}${w.flags.global?" --global":""}`),1;if(!await kb(`Apply this policy to ${B}? [y/N] `,ce,le))return console.log("Cancelled; nothing was written."),0;return _b(a,B,J.value,ae,w.flags.global),console.log(`Policy applied: ${B}`),0}function kb(a,p,v){let w=xb({input:p,output:v,terminal:!1});return new Promise((k)=>{w.once("close",()=>k(!1)),w.question(a,(M)=>{k(/^y(es)?$/i.test(M.trim())),w.close()})})}function _b(a,p,v,w,k){if(k){ne(a,w);return}Lb(wb(p),{recursive:!0}),Ut(p,qo(v,w))}function Um(a,p,v){let w=Bo(a,p,v);if(w.length===0){console.log("No changes.");return}console.log(`Changes (${w.length}):`);for(let k of w)console.log(`  ${k.field}: ${k.before??Mm} -> ${k.after??Mm}`)}function Sb(a){return!!a&&typeof a==="object"&&!Array.isArray(a)}import{join as FL}from"node:path";var Zm="# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Priority |\n|-------|-------------|---------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | First |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | Second |\n| GitHub source | Listed in a local `rule.json` | Vendored into the consumer's `<rulebook-name>/rulebook.json` by `rule add` | Source order |\n\nEvery rulebook is a live file: the runtime reads it on each tool call, so an edit applies to the next command with no publishing step.\n\nUser scope is evaluated before project scope; within a scope, sources apply in `rules` array order. A duplicate active rulebook name keeps the first claim and ignores the later rulebook with a warning, so a user-scoped name shadows a project-scoped one.\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook. `CC_SAFETY_NET_HOME` overrides the `~/.cc-safety-net` user root.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `$schema`: Optional. `cc-safety-net rule verify` inserts it into a valid `rule.json` that lacks it.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- `overrides` values are either `\"off\"` to disable a rule or an object with a required `reason` (replacement block reason) and an optional `intent` (one of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain`).\n- A project override cannot target a user-scoped rule: only that override is ignored, the user rule keeps its configured state, and `rule verify` reports the diagnostic as a failure.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- Run `cc-safety-net rule add owner/repo` to add every rulebook currently present on the repository's default branch.\n- Use `--only` to select one or more rulebooks while preserving their order: `cc-safety-net rule add owner/repo --only aws gcloud`.\n- Use `--ref` to select a branch, tag, or commit instead of the default branch: `cc-safety-net rule add owner/repo --ref v2 --only aws`.\n- GitHub sources are stored in canonical form as `owner/repo#ref/<rulebook-name>`. That form remains valid in `rule.json` and as direct CLI input.\n- GitHub refs may contain `/`-separated path segments, such as `feature/rulebook-v2`.\n- The GitHub source name, the repository directory name, and the rulebook `name` must match exactly.\n- Rulebook source strings must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` or `2` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | Free text; not type-checked at runtime |\n| `author` | No | Free text; not type-checked at runtime |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | No | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook (case-insensitive); same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `intent` | No | One of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain` |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Rule Fields (`rulebook_version` 2)\n\nVersion 2 replaces `subcommand` and `block_args` with an exact-token `match` object. Version 1 rulebooks keep their fields and their behavior; a client that does not support version 2 rejects the rulebook instead of applying broader version 1 semantics.\n\n```json\n{\n  \"name\": \"block-terraform-apply-destroy\",\n  \"command\": \"terraform\",\n  \"match\": {\n    \"command_path\": [\"apply\"],\n    \"any_args\": [\"-destroy\", \"--destroy\"]\n  },\n  \"reason\": \"Review a destroy plan first with 'terraform plan -destroy'.\",\n  \"intent\": \"use_alternative\"\n}\n```\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Same as version 1 |\n| `command` | Yes | Same as version 1 |\n| `match.command_path` | Yes | Non-empty array of non-empty command words |\n| `match.any_args` | No | Non-empty array of unique non-empty argument tokens |\n| `match.exclude_args` | No | Non-empty array of unique non-empty argument tokens |\n| `intent` | No | Same as version 1 |\n| `reason` | Yes | Same as version 1 |\n\n### Matching Behavior (`rulebook_version` 2)\n\n- **Command**: Normalized to lowercase basename, as in version 1.\n- **Command path**: After recognized global options and their values are skipped, the next command words must equal `command_path` exactly. AWS, gcloud, and Azure CLI value-taking global options are built in; Terraform's `-chdir=dir` is `=`-joined and is skipped with its own token.\n- **Unrecognized options**: A token starting with `-` that is not a recognized global option is skipped without consuming a value, so an unlisted value-taking option with a separate value (`--newflag value`) makes the rule miss. This fails open deliberately; document such gaps in the rulebook.\n- **`any_args`**: At least one listed token must appear literally among the arguments.\n- **`exclude_args`**: Any listed token appearing literally among the arguments prevents the match, which is how a safe preview such as `aws s3 rm --dryrun` stays allowed.\n- **No short-option expansion**: Arguments compare as exact tokens, so list every accepted spelling (`\"-destroy\"` and `\"--destroy\"`).\n- **Literal and case-sensitive**: No regex, glob, or substring matching. The first matching rule wins.\n- Release channels are separate rules: `gcloud beta compute instances delete` needs its own `command_path`.\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nFixtures are optional documentation of intended behavior. Version 1 fixtures are shape-validated only. Version 2 fixtures are evaluated against the rulebook's own rules when a source is fetched by `rule add` or `rule update`, and by `rule verify`; a failing fixture rejects that source before it is written. Loading a rulebook does not re-evaluate fixtures. CC Safety Net never executes fixture commands; they are analyzer inputs only.\n\n## Matching Behavior\n\nThe subcommand, argument, and option rules below describe `rulebook_version` 1 rules; version 2 rules match as described in Matching Behavior (`rulebook_version` 2). Execution order and transparent wrappers apply to both.\n\n- **Command**: Normalized to lowercase basename with any trailing `.exe` removed (`/usr/bin/git` → `git`).\n- **Subcommand**: The first command token after recognized Git and Docker global options and their values; `--` ends option parsing. An unrecognized option without `=` may consume the following token as its value.\n- **Arguments**: Each `block_args` value is compared literally against every command token, including expanded short options. The command is blocked if **any** item matches.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source; add `--only <rulebook...>` or `--ref <ref>` for repository selection. The command adds the selected sources and syncs them.\n5. Edit a local rulebook whenever you like: the edit is enforced on the next command, so there is nothing to run afterwards.\n6. Run `cc-safety-net rule update [source]` to re-fetch remote sources and rewrite the vendored copies; the command prints what changed. A source with an ordinary update failure keeps its vendored copy while the other selected sources still update. Resource-limit failures remain fatal for the whole update.\n7. Run `cc-safety-net rule verify` to validate config, local rulebooks, and shareable GitHub-source rulebook directories in the current repository (it does not fetch remote content).\n8. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nA missing or invalid rulebook file makes that source inactive, and an unreadable or invalid `rule.json` makes every source in its scope inactive. Inactive sources stop applying their rules while other custom rules and all built-in protections stay active. Fix the file named in the diagnostic, or run `cc-safety-net rule update` when a remote source has not been vendored yet. Run `cc-safety-net status` to see degraded sources.\n";function Vo(a,p){if(!a.ok){Jm(a);return}qm(a,p)}function Bm(a,p,v){if(a.ok)console.log(v);if(!a.add){Vo(a,`Added rulebook source: ${p}`);return}if(!a.ok){Jm(a);return}if(a.add.added.length>0)console.log(`Added ${a.add.added.length} ${a.add.added.length===1?"rulebook":"rulebooks"} from ${a.add.source} at ${a.add.ref}:`),a.add.added.forEach((w)=>{console.log(`  - ${w}`)});if(a.add.alreadyConfigured.length>0)console.log(`Rulebooks already configured from ${a.add.source} at ${a.add.ref}: ${a.add.alreadyConfigured.join(", ")}`);if(a.add.commits.length>0)console.log(`Vendored at ${a.add.commits.map((w)=>w.slice(0,7)).join(", ")}.`);qm(a,"Rule config updated.")}function qm(a,p){for(let v of a.changes??[])console.log(v);console.log(p),console.log(""),Cb(a.entries)}function Cb(a){if(a.length===0){console.log("Active rulebooks: (none)");return}console.log(`Active rulebooks (${a.length}):`);for(let p of a)console.log(`  - ${p.name} ${p.version} (${Pb(p.ruleCount)})`),console.log(`    Source: ${p.spec}`)}function Pb(a){return`${a} ${a===1?"rule":"rules"}`}function Vm(a){Mn("Active sources",a.rulebooks,(p)=>[`[${p.source}] ${p.name} ${p.version}`,`  Source: ${p.spec}`]),Mn("Active rules",a.rules,(p)=>[`[${Eb(a,p.name)}] ${p.name}`,...$b(p),`  Reason: ${p.reason}`]),Mn("Disabled rules",Gm(a,"off"),(p)=>[p.key]),Mn("Reason overrides",Gm(a,"reason"),(p)=>[p.key,`  Reason: ${p.value.reason}`]),Mn("Transparent wrappers",a.transparent_wrappers,(p)=>[p]),Mn("Issues",a.errors,(p)=>[p]),Mn("Warnings",a.warnings,(p)=>[p])}function Mn(a,p,v){if(p.length===0){console.log(`${a}: (none)`);return}console.log(`${a} (${p.length}):`);for(let w of p){let[k,...M]=v(w);console.log(`  - ${k}`);for(let G of M)console.log(`    ${G}`)}}function $b(a){if(!a.match)return[`  Command: ${a.subcommand?`${a.command} ${a.subcommand}`:a.command}`,`  Block args: ${a.block_args.join(", ")}`];return[`  Command: ${[a.command,...a.match.command_path].join(" ")}`,...a.match.any_args?[`  Any args: ${a.match.any_args.join(", ")}`]:[],...a.match.exclude_args?[`  Exclude args: ${a.match.exclude_args.join(", ")}`]:[]]}function Eb(a,p){return a.rulebooks.find((v)=>v.rules.includes(p))?.source??"project"}function Gm(a,p){return Object.entries({...a.userConfig?.overrides??{},...a.projectConfig?.overrides??{}}).filter((v)=>{if(p==="off")return v[1]==="off";return!!v[1]&&typeof v[1]==="object"}).map(([v,w])=>({key:v,value:w}))}function Jm(a){for(let p of a.errors)console.error(p)}import{dirname as y2,join as ts}from"node:path";import{join as ta,resolve as Ub}from"node:path";function Ki(a){let p=x(a);if(p.errors.length>0)return{ok:!1,result:{ok:!1,errors:p.errors,entries:[]}};return{ok:!0,config:p.config??wt}}function Wm(a,p=[]){Ut(a,{version:1,rules:p,overrides:{},transparent_wrappers:[]})}function Km(a,p="project-rules"){Ut(a,{rulebook_version:1,name:p,version:"1.0.0",description:p==="project-rules"?"Project-specific CC Safety Net rules.":"User-specific CC Safety Net rules.",author:p==="project-rules"?"project":"user",allowed_commands:["docker"],rules:[{name:"block-docker-system-prune",command:"docker",subcommand:"system",block_args:["prune"],reason:"Use targeted cleanup instead."}],tests:[{command:"docker system prune",expect:"blocked",rule:"block-docker-system-prune"}]})}import{dirname as Yo}from"node:path";var Rb="custom.";function Jo(a){if(a.rulebook_version!==2)return[];let p=a.rules.map((v)=>({name:v.name,command:v.command,block_args:[],match:v.match,reason:v.reason,intent:v.intent}));return(a.tests??[]).flatMap((v,w)=>{let k=Yi(S(v.command));if(k.length===0)return[`tests[${w}]: could not parse fixture command: ${v.command}`];let M=k.reduce((G,B)=>G??y(B,p)?.id.slice(Rb.length),void 0);if(v.expect==="blocked"){if(M===v.rule)return[];let G=M?`"${M}" matched first`:"no rule matched";return[`tests[${w}]: expected "${v.rule}" to block "${v.command}" but ${G}`]}return M?[`tests[${w}]: expected "${v.command}" to be allowed but "${M}" matched`]:[]})}function Yi(a){return a.nodes.flatMap((p)=>{if(p.kind==="group"||p.kind==="function")return Yi(p.body);if(p.kind!=="command")return[];let v=Ie(ge(p.dialect,p.words)).words.map(e);return[...v.length>0?[v]:[],...p.nested.flatMap((w)=>Yi(w))]})}var Xi="Rule synchronization exceeds CC Safety Net's safe resource limits.",Wo=Object.freeze({maxSources:I,concurrency:4,maxRequests:131,maxResponseBytes:67108864});function Ko(a={}){return{requests:0,responseBytes:0,maxRequests:a.maxRequests??Wo.maxRequests,maxResponseBytes:a.maxResponseBytes??Wo.maxResponseBytes}}function pn(a){return{controller:new AbortController,budget:Ko(),resolveUrl:a}}function Ym(a){return a instanceof Error&&a.message===Xi}function Xm(a){if(a.requests>=a.maxRequests)throw Error(Xi);a.requests++}function Qm(a,p){if(p>a.maxResponseBytes-a.responseBytes)throw a.responseBytes+=p,Error(Xi);a.responseBytes+=p}var n2=Object.freeze({timeoutMs:15000,metadataBytes:524288,commitBytes:262144,treeBytes:16777216,rawBytes:4194304});async function e2(a,p,v=A(Yo(Yo(p)),"rules policy"),w=pn()){if(T(a))return Ib(a,w);return Tb(a,p,v)}async function r2(a,p,v,w,k,M){if(!T(a))return e2(a,p,v,w);let G=k?null:Db(a,p,v);if(G)return G;if(!k&&!M)throw Error(`${a} is not vendored; run rule update ${a} to vendor it`);return e2(a,p,v,w)}function Db(a,p,v=A(Yo(Yo(p)),"rules policy")){let w=Z(a),k=q(p,w.name),M=r(i(v,k));if(M===null)return null;let G=xe(Qi(M,`Invalid rulebook ${k}.`));if(G.name!==w.name)throw Error(`rulebook name "${G.name}" in ${k} must match "${w.name}"`);return{spec:a,rulebook:G,content:M}}async function o2(a,p={}){if(!de(a))throw Error(`Invalid GitHub repository source: ${a}`);let[v,w]=a.split("/");if(!v||!w)throw Error(`Invalid GitHub repository source: ${a}`);if(p.ref!==void 0&&!we(p.ref))throw Error(`GitHub rulebook refs must use valid path segments: ${p.ref}`);let k=p.operation??pn(),M=p.ref??await Ab(v,w,a,k),G=await i2(v,w,M,a,k),B=await Xo(`https://api.github.com/repos/${v}/${w}/git/trees/${G}?recursive=1`,"tree",k),J=B.response;if(!J.ok)throw Error(`Failed to inspect ${a}: GitHub tree returned ${J.status}`);let se=JSON.parse(B.content);if(!Array.isArray(se?.tree))throw Error(`Failed to inspect ${a}: unexpected GitHub tree response`);let ae=se.tree,ce=[...new Set(ae.flatMap((le)=>{if(!le||typeof le!=="object")return[];let he=le;if(he.type!=="blob"||typeof he.path!=="string")return[];let be=he.path.match(vt);return be?.[1]?[be[1]]:[]}))].sort();if(ce.length===0)throw Error(`No rulebooks found in ${a} under ${Re}/`);return{source:a,owner:v,repo:w,ref:M,commit:G,names:ce}}async function Ab(a,p,v,w){let k=await Xo(`https://api.github.com/repos/${a}/${p}`,"metadata",w),M=k.response;if(!M.ok)throw Error(`Failed to inspect ${v}: GitHub returned ${M.status}`);let B=JSON.parse(k.content)?.default_branch;if(typeof B!=="string"||B==="")throw Error(`Failed to inspect ${v}: missing default branch`);if(!we(B))throw Error(`GitHub returned an invalid default branch: ${B}`);return B}function Tb(a,p,v){bt(a);let w=q(p,a),k=r(i(v,w));if(k===null)throw Error(`Rulebook source not found: ${a}`);let M=s2(Qi(k,"Invalid local rulebook source."));if(M.name!==a)throw Error(`rulebook name "${M.name}" must match local source "${a}"`);return{spec:a,rulebook:M,content:k}}async function Ib(a,p){let v=Z(a),w=await i2(v.owner,v.repo,v.ref,a,p),k=await Xo(`https://raw.githubusercontent.com/${v.owner}/${v.repo}/${w}/${v.path}`,"raw",p),M=k.response;if(!M.ok)throw Error(`Failed to fetch ${a}: GitHub raw returned ${M.status}`);let G=k.content,B=s2(Qi(G,"Invalid GitHub rulebook response."));if(B.name!==v.name)throw Error(`rulebook name "${B.name}" must match GitHub source "${v.name}"`);return{spec:a,rulebook:B,content:G}}function s2(a){let p=xe(a),v=Jo(p);if(v.length>0)throw Error(v.join("; "));return p}function Qi(a,p){try{return JSON.parse(a)}catch{throw Error(p)}}async function i2(a,p,v,w,k){let M=await Xo(`https://api.github.com/repos/${a}/${p}/commits/${encodeURIComponent(v)}`,"commit",k),G=M.response;if(!G.ok)throw Error(`Failed to resolve ${w}: GitHub returned ${G.status}`);let B=JSON.parse(M.content);if(typeof B?.sha!=="string"||B.sha==="")throw Error(`Failed to resolve commit for ${w}`);return B.sha}async function Ob(a,p,v={}){if(v.signal?.aborted)throw v.signal.reason;let w=v.budget??Ko(),k=new AbortController,M=()=>k.abort(v.signal?.reason);v.signal?.addEventListener("abort",M,{once:!0});let G=!1,B=setTimeout(()=>{if(k.signal.aborted)return;G=!0,k.abort()},v.timeoutMs??n2.timeoutMs);try{if(v.signal?.aborted)throw v.signal.reason;Xm(w);let J=await(v.fetch??fetch)(a,{signal:k.signal,redirect:"error"});if(!J.ok)return a2(J),{response:J,content:""};return{response:J,content:await jb(J,p,w,()=>k.abort())}}catch(J){if(G)throw Error("GitHub request timed out",{cause:J});if(v.signal?.aborted)throw v.signal.reason;throw J}finally{clearTimeout(B),v.signal?.removeEventListener("abort",M)}}function Xo(a,p,v){return Ob(v.resolveUrl?.(a)??a,p,{budget:v.budget,signal:v.controller.signal})}async function jb(a,p,v=Ko(),w){let k=n2[`${p}Bytes`],M=Number(a.headers.get("content-length"));if(Number.isFinite(M)&&M>k)throw a2(a),Error(`GitHub ${p} response exceeds ${k} bytes`);if(!a.body)return"";let G=a.body.getReader(),B=[],J=0;while(!0){let se=await G.read();if(se.done)break;try{Qm(v,se.value.byteLength)}catch(ae){throw w?.(),t2(G),ae}if(J+=se.value.byteLength,J>k)throw w?.(),t2(G),Error(`GitHub ${p} response exceeds ${k} bytes`);B.push(Buffer.from(se.value))}return Buffer.concat(B,J).toString("utf-8")}function a2(a){if(!a.body)return;c2(()=>a.body?.cancel())}function t2(a){c2(()=>a.cancel())}function c2(a){try{Promise.resolve(a()).catch(()=>{})}catch{}}var Nb=/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;function l2(a,p){let v=p2(a.rules,p);if(v.length>0)return{ok:!0,specs:v};return d2(a.rules,p)}function u2(a,p){let v=p2(a,p);if(v.length>0)return{ok:!0,specs:v};let w=Fb(a,p);if(w.length>0)return{ok:!0,specs:w};let k=Mb(a,p);if(!k.ok)return k;if(k.specs.length>0)return{ok:!0,specs:k.specs};return d2(a,p)}function d2(a,p){let v=a.filter((w)=>ea(w)?.name===p);if(v.length===1)return{ok:!0,specs:v};return zb(p,v)}function zb(a,p){return{ok:!1,result:{ok:!1,errors:p.length===0?[`No configured rulebook matches ${a}`]:[`Ambiguous rulebook match ${a}: ${p.join(", ")}`],entries:[]}}}function p2(a,p){return a.filter((v)=>v===p)}function Fb(a,p){let v=p.match(Nb),w=v?.[1],k=v?.[2],M=v?.[3];if(!w||!k||!M||!we(M))return[];return f2(a,(G)=>G.owner===w&&G.repo===k&&G.ref===M)}function Mb(a,p){if(!de(p))return{ok:!0,specs:[]};let[v,w]=p.split("/"),k=f2(a,(G)=>G.owner===v&&G.repo===w);if(new Set(k.map((G)=>ea(G)?.ref).filter((G)=>!!G)).size<2)return{ok:!0,specs:k};return{ok:!1,result:{ok:!1,errors:[`Multiple refs are configured for ${p}. Use an explicit ref:`,`  cc-safety-net rule remove ${p}#<ref>`],entries:[]}}}function ea(a){try{return Z(a)}catch{return null}}function f2(a,p){return a.filter((v)=>{let w=ea(v);return w?p(w):!1})}async function es(a,p={}){let v=na(p);return Hb(a,v,await Qo(a,v,pn()))}function Hb(a,p,v){if(!v.ok)return v;let w=Ht(a,p),k=[...new Set(ee(w.configPath,w.filesystemScope))];if(k.length===0)return v;return{ok:!1,errors:k,entries:v.entries}}async function Qo(a,p,v,w={},k=new Set,M=new Set){try{let G=Ht(a,p),B=Ki(G.configTarget);if(!B.ok)return B.result;let J=B.config;if(p.check)return oL(J,G,p);let se=p.only?l2(J,p.only):{ok:!0,specs:J.rules};if(!se.ok)return se.result;let ae=new Set([...p.refresh?se.specs:[],...k]),ce=(Je)=>r2(Je,G.configDir,G.filesystemScope,v,ae.has(Je),!p.refresh||ae.has(Je)),le=await Qb(J.rules,p.refresh?(Je)=>ce(Je).then((Rt)=>({ok:!0,item:Rt})).catch((Rt)=>{if(Ym(Rt))throw Rt;return{ok:!1,spec:Je,message:Rt instanceof Error?Rt.message:String(Rt)}}):async(Je)=>({ok:!0,item:await ce(Je)}),v),he=le.filter((Je)=>!Je.ok),be=le.filter((Je)=>Je.ok).map((Je)=>Je.item),ve=be.flatMap((Je)=>Zb(Je,J.rules)),_e=be.flatMap((Je)=>Gb(Je,M,G)),Be=new Set([...ve,..._e].map((Je)=>Je.spec)),Ue=[...he,...ve,..._e],Oe=[],Lt=qb(Oe,()=>be.flatMap((Je)=>Be.has(Je.spec)||Ue.length>0&&M.has(Je.spec)?[]:Bb(Je,G,w,Oe)));return{ok:Ue.length===0,errors:Ue.map((Je)=>`Failed to update ${Je.spec}: ${Je.message}`),entries:be.map(Jb),changes:Lt}}catch(G){return Or(G)}}function Zb(a,p){if(!T(a.spec))return[];let v=Ke(a.spec),w=p.filter((k)=>k!==a.spec&&Ke(k).toLowerCase()===v.toLowerCase());if(w.length===0)return[];return[{ok:!1,spec:a.spec,message:`rulebook name "${v}" is also claimed by ${w.join(", ")}; rename one of them`}]}function Gb(a,p,v){if(!p.has(a.spec)||!T(a.spec))return[];let w=q(v.configDir,a.rulebook.name),k=r(i(v.filesystemScope,w));if(k===null||k===a.content)return[];return[{ok:!1,spec:a.spec,message:`${w} already exists and no configured source claims it; remove or rename the file, then re-run rule add`}]}function Bb(a,p,v,w){if(!T(a.spec))return[];let k=q(p.configDir,a.rulebook.name),M=i(p.filesystemScope,k),G=r(M);if(G===a.content)return[];return w?.push({target:M,previous:G}),C(M,a.content,void 0,v._testAfterPolicyRename),Vb(a,G)}function qb(a,p){try{return p()}catch(v){for(let w of[...a].reverse()){if(w.previous===null){Y(w.target);continue}C(w.target,w.previous)}throw v}}function Vb(a,p){if(p===null)return[`Vendored ${a.spec} (${a.rulebook.version})`];let v=Te(p),w="problem"in v?null:v.rulebook,k=new Map(w?.rules.map((G)=>[G.name,JSON.stringify(G)])??[]),M=new Set(a.rulebook.rules.map((G)=>G.name));return[`Updated ${a.spec} (${w?.version??"unreadable"} -> ${a.rulebook.version})`,...[...M].filter((G)=>!k.has(G)).map((G)=>`  + ${G}`),...[...k.keys()].filter((G)=>!M.has(G)).map((G)=>`  - ${G}`),...a.rulebook.rules.filter((G)=>{let B=k.get(G.name);return B!==void 0&&B!==JSON.stringify(G)}).map((G)=>`  ~ ${G.name}`)]}function Jb(a){return{spec:a.spec,name:a.rulebook.name,version:a.rulebook.version,ruleCount:a.rulebook.rules.length}}async function m2(a,p,v={}){return Wb(a,p,tL(v),pn())}async function Wb(a,p,v,w,k={}){let M=null,G=!1;try{let B=Ht(a,v),J=r(B.configTarget);M={target:B.configTarget,content:J};let se=Ki(B.configTarget);if(!se.ok)return se.result;let ae=se.config,ce=de(p);Kb(p,v,ce);let le=ce?await o2(p,{ref:v.ref,operation:w}):null,he=le?Yb(le,v.rulebooks):[],be=le?he.map((Oe)=>Xb(ae.rules,le,Oe)??`${p}#${le.ref}/${Oe}`):[p],ve=be.filter((Oe)=>!ae.rules.includes(Oe)),_e=[...ae.rules,...ve];if(_e.length>I)return eL();if(_e.length!==ae.rules.length)G=!0,Ut(B.configTarget,{version:1,rules:_e,overrides:ae.overrides??{},transparent_wrappers:ae.transparent_wrappers??[]},void 0,k._testAfterPolicyRename);let Be=await Qo(a,v,w,k,new Set(ve),new Set(ve));if(!Be.ok)Ir(B.configTarget,J);if(!Be.ok||!le)return Be;let Ue=he.filter((Oe,Lt)=>ve.includes(be[Lt]??""));return{...Be,add:{source:p,ref:le.ref,selected:he,added:Ue,alreadyConfigured:he.filter((Oe)=>!Ue.includes(Oe)),commits:ve.length>0?[le.commit]:[]}}}catch(B){if(G&&M)try{Ir(M.target,M.content)}catch(J){return Or(J)}return Or(B)}}function Kb(a,p,v){if(!v&&p.rulebooks!==void 0)throw Error("--only can only select rulebooks from an owner/repo source");if(!v&&p.ref)throw Error(`--ref can only select a ref for an owner/repo source: ${a}`);if(p.rulebooks?.length===0)throw Error("--only requires at least one rulebook name");let w=p.rulebooks?.filter((k)=>!h.test(k))??[];if(w.length>0)throw Error(`Invalid rulebook names: ${w.join(", ")}`)}function Yb(a,p){let v=p?[...new Set(p)]:a.names,w=v.filter((k)=>!a.names.includes(k));if(w.length>0)throw Error(`Rulebooks not found in ${a.source} at ${a.ref}: ${w.join(", ")}
Available rulebooks: ${a.names.join(", ")}`);return v}function Xb(a,p,v){let w=`${p.source}#${p.ref}/${v}`;if(a.includes(w))return w;let k=`${p.source}#${p.commit}/${v}`;return a.find((M)=>M===k)}async function Qb(a,p,v=pn()){if(a.length>I)throw Error(pe);let w=Array(a.length),k=0,M,G=Array.from({length:Math.min(a.length,Wo.concurrency)},async()=>{while(!M){let B=k;if(B>=a.length)return;k++;try{w[B]=await p(a[B],B,v.controller.signal)}catch(J){if(!M)M={value:J},k=a.length,v.controller.abort(J);return}}});if(await Promise.all(G),M)throw M.value;return w}function eL(){return{ok:!1,errors:[pe],entries:[]}}function na(a){return{cwd:a.cwd,userConfigDir:a.userConfigDir,userConfigPath:a.userConfigPath,projectConfigPath:a.projectConfigPath,global:a.global,check:a.check,only:a.only,refresh:a.refresh}}function tL(a){return{...na(a),ref:a.ref,rulebooks:a.rulebooks}}function nL(a){return{...na(a),deleteSource:a.deleteSource}}async function g2(a,p,v={}){try{return await rL(a,p,nL(v),{})}catch(w){return Or(w)}}async function rL(a,p,v,w){let k=Ht(a,v),M=x(k.configTarget);if(M.errors.length>0)return{ok:!1,errors:M.errors,entries:[]};if(!M.config)return{ok:!1,errors:[`No config found at ${k.configPath}`],entries:[]};let G=u2(M.config.rules,p);if(!G.ok)return G.result;let B=v.deleteSource?sL(k.configDir,G.specs,k.filesystemScope):{ok:!0,dirs:[]};if(!B.ok)return B.result;let J=r(k.configTarget);if(J===null)return Or(Error("Rules config is unavailable."));try{Ut(k.configTarget,{version:1,rules:M.config.rules.filter((ce)=>!G.specs.includes(ce)),overrides:M.config.overrides??{},transparent_wrappers:M.config.transparent_wrappers??[]},void 0,w._testAfterPolicyRename)}catch(ce){throw Ir(k.configTarget,J),ce}let se=await Qo(a,v,pn(),w);if(!se.ok)return Ir(k.configTarget,J),se;let ae=iL(B.dirs,w,k.filesystemScope);if(!ae.ok){Ir(k.configTarget,J);let ce=await Qo(a,v,pn(),w);if(!ce.ok)return{ok:!1,errors:[...ae.result.errors,...ce.errors],entries:ce.entries};return ae.result}return se}async function oL(a,p,v){let w=ze(a,p.configDir,v.global?"user":"project",p.filesystemScope);return{ok:w.errors.length===0&&w.warnings.length===0,errors:[...w.errors,...w.warnings],entries:w.entries}}function sL(a,p,v){let w=p.flatMap((B)=>h.test(B)?[]:["--delete-source can only delete local rulebook sources"]),k=p.map((B)=>ta(a,B)),M=w.length>0?[]:k.flatMap((B)=>h2(B,v)),G=[...w,...M];return G.length>0?{ok:!1,result:{ok:!1,errors:G,entries:[]}}:{ok:!0,dirs:k}}function h2(a,p){let v=Ub(a),w=i(p,v),k=Le(w);if(!k)return[`Local rulebook source directory not found: ${a}`];let M=k.find((G)=>G.name==="rulebook.json");if(!M)return[`Local rulebook source directory is missing rulebook.json: ${a}`];if(M.kind!=="file")throw new o(p.label);if(r(i(p,ta(v,"rulebook.json"))),k.length>1)return[`Local rulebook source directory contains extra files: ${a}. delete manually if you really want to remove the directory.`];return[]}function iL(a,p,v){let w=a.flatMap((k)=>{try{if(!Le(i(v,k)))return[];let M=h2(k,v);if(M.length>0)return M;return aL(k,p,v),[]}catch(M){return[`Failed to delete local rulebook source ${k}: ${M instanceof Error?M.message:String(M)}`]}});return w.length>0?{ok:!1,result:{ok:!1,errors:w,entries:[]}}:{ok:!0}}function aL(a,p,v){if(p._testDeleteLocalSourceDir){p._testDeleteLocalSourceDir(a);return}Y(i(v,ta(a,Ee))),yt(i(v,a))}function Ir(a,p){if(p===null){Y(a);return}C(a,p)}function Or(a){return{ok:!1,errors:[a instanceof Error?a.message:String(a)],entries:[]}}var cL=".safety-net.json",lL="~/.cc-safety-net/config.json";async function L2(a,p){return[await v2(a,{legacyPath:Ud({cwd:p.cwd}),configPath:H(p.cwd),defaultRulebookName:"project-rules",migratedFrom:cL,cleanup:p.cleanup,syncOptions:{cwd:p.cwd}}),await v2(a,{legacyPath:lo(a),configPath:U(a),defaultRulebookName:"user-rules",migratedFrom:lL,cleanup:p.cleanup,syncOptions:{cwd:p.cwd,global:!0}})].every((w)=>w)?0:1}async function v2(a,p){let v=Ht(a,p.syncOptions),w=i(v.filesystemScope,p.legacyPath),k=r(w);if(k===null)return console.log(`No legacy config found at ${p.legacyPath}`),!0;let M=dL(k);if(!M.ok){for(let he of M.errors)console.error(he);return!1}let G=x(v.configTarget);if(G.errors.length>0){for(let he of G.errors)console.error(he);return!1}let B=G.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},J=pL(y2(p.configPath),B.rules,p.defaultRulebookName,p.migratedFrom,v.filesystemScope),se=ts(y2(p.configPath),J,"rulebook.json"),ae=i(v.filesystemScope,se),ce=[b2(v.configTarget),b2(ae)],le=await uL(a,p,v.configTarget,ae,J,M.config.rules,B.rules.includes(J)?B.rules:[...B.rules,J],B.overrides??{},B.transparent_wrappers??[]);if(!le.ok){gL(ce);for(let he of le.errors)console.error(he);return!1}if(!p.cleanup)return console.log(`Migrated legacy config at ${p.legacyPath}. Legacy file is no longer used.`),!0;if(!mL(v.configTarget,ae,J,p.migratedFrom,M.config.rules))return console.error(`Migration cleanup verification failed for ${p.legacyPath}`),!1;return Y(w),console.log(`Deleted legacy config at ${p.legacyPath}`),!0}async function uL(a,p,v,w,k,M,G,B,J){try{return Ut(v,{version:1,rules:G,overrides:B,transparent_wrappers:J}),Ut(w,fL(k,p.migratedFrom,M)),await es(a,p.syncOptions)}catch(se){return{ok:!1,errors:[se instanceof Error?se.message:String(se)]}}}function dL(a){try{let p=JSON.parse(a),v=Fs(p);if(v.errors.length>0)return{ok:!1,errors:v.errors};return{ok:!0,config:{version:1,rules:p.rules??[]}}}catch{return{ok:!1,errors:["Invalid JSON"]}}}function pL(a,p,v,w,k){let M=p.find((G)=>hL(i(k,ts(a,G,"rulebook.json")))===w);if(M)return M;if(r(i(k,ts(a,v,"rulebook.json")))===null)return v;for(let G=2;;G++){let B=`${v}-${G}`;if(r(i(k,ts(a,B,"rulebook.json")))===null)return B}}function fL(a,p,v){return{rulebook_version:1,name:a,version:"1.0.0",description:"Migrated CC Safety Net rules.",author:"project",migrated_from:p,allowed_commands:[...new Set(v.map((w)=>w.command))],rules:v,tests:v.map((w)=>({command:[w.command,w.subcommand,w.block_args[0]].filter(Boolean).join(" "),expect:"blocked",rule:w.name}))}}function mL(a,p,v,w,k){if(!x(a).config?.rules.includes(v))return!1;try{let G=r(p);if(G===null)return!1;let B=JSON.parse(G);return B.migrated_from===w&&JSON.stringify(B.rules)===JSON.stringify(k)}catch{return!1}}function b2(a){return{target:a,content:r(a)}}function gL(a){for(let p of a){if(p.content===null){Y(p.target);continue}C(p.target,p.content)}}function hL(a){let p=r(a);if(p===null)return null;try{let v=JSON.parse(p);return typeof v.migrated_from==="string"?v.migrated_from:null}catch{return null}}import{mkdir as yL,readFile as vL,writeFile as bL}from"node:fs/promises";import{dirname as LL,join as wL}from"node:path";var xL=86400000,kL=604800000;async function x2(a,p=Date.now()){if(a.env.get("CC_SAFETY_NET_NO_UPDATE_CHECK"))return null;let v=ot(a);if(!v)return null;let w=wL(v,".cc-safety-net","update-check.json"),k=await _L(w,p);if(!k.lastCheck||p-k.lastCheck>xL){let B=await bn();if(k.lastCheck=p,B.latestVersion)k.latestVersion=B.latestVersion;if(!await w2(w,k))return null;if(B.error)return null}let M=k.latestVersion,G=jt();if(!M||!Bs(M,G))return null;if(k.notifiedVersion===M&&k.notifiedAt!==void 0&&p-k.notifiedAt<kL)return null;if(k.notifiedVersion=M,k.notifiedAt=p,!await w2(w,k))return null;return`UPDATE_AVAILABLE: cc-safety-net v${M} is available (running v${G}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`}async function _L(a,p){let v=await vL(a,"utf8").then((M)=>JSON.parse(M)).catch(()=>{return});if(!v||typeof v!=="object"||Array.isArray(v))return{};let w=v,k=(M)=>typeof M==="number"&&Number.isFinite(M)&&M<=p?M:void 0;return{lastCheck:k(w.lastCheck),latestVersion:typeof w.latestVersion==="string"?w.latestVersion:void 0,notifiedVersion:typeof w.notifiedVersion==="string"?w.notifiedVersion:void 0,notifiedAt:k(w.notifiedAt)}}async function w2(a,p){return yL(LL(a),{recursive:!0,mode:448}).then(()=>bL(a,JSON.stringify(p),{mode:384})).then(()=>!0).catch(()=>!1)}import{join as SL,resolve as ra}from"node:path";var k2="CC Safety Net Config",CL="═".repeat(k2.length),PL="https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json",$L=new Set(["rule.json","rule.lock","cache"]);function _2(a,p={}){try{return EL(a,p)}catch(v){if(v instanceof o)return console.error(v.message),1;throw v}}function EL(a,p){let v=p.cwd??process.cwd(),w=p.userConfigPath??U(a),k=p.projectConfigPath??H(v),M=p.legacyUserConfigPath??lo(a),G=p.legacyProjectConfigPath??ud(v),B=ra(v,Re),J=X(a,{cwd:v,userConfigPath:w,projectConfigPath:k}),se=X(a,{cwd:v}),ae=i(J.userScope,w),ce=i(J.projectScope,k),le=p.legacyUserConfigPath?V(p.legacyUserConfigPath,"user policy"):i(se.userScope,M),he=p.legacyProjectConfigPath?V(p.legacyProjectConfigPath,"project policy"):i(se.projectScope,G),be=!1,ve=!1,_e=[],Be=[],Ue=RL(i(se.projectScope,B));if(AL(),r(ae)!==null){let Oe=vn(ae);if(Oe.errors.push(...ee(w,J.userScope)),_e.push({scope:"User",path:w,result:Oe,schema:"rules",target:ae}),Oe.errors.length>0)be=!0}if(r(le)!==null)if(ve=!0,r(ae)!==null)Be.push(ns("user","cleanup"));else{let Oe=Ms(le);if(_e.push({scope:"User",path:M,result:Oe,schema:"legacy",inactive:!0,target:le}),Be.push(ns("user",Oe.errors.length>0?"fix-or-delete":"migrate")),Oe.errors.length>0)be=!0}if(r(ce)!==null){let Oe=vn(ce);if(Oe.errors.push(...ee(k,J.projectScope)),_e.push({scope:"Project",path:ra(k),result:Oe,schema:"rules",target:ce}),Oe.errors.length>0)be=!0;if(r(he)!==null)ve=!0,Be.push(ns("project","cleanup"))}else if(r(he)!==null){ve=!0,be=!0;let Oe=Ms(he);_e.push({scope:"Project",path:ra(G),result:Oe,schema:"legacy",inactive:!0,target:he}),Be.push(ns("project",Oe.errors.length>0?"fix-or-delete":"migrate"))}if(Ue?.result.errors.length)be=!0;if(_e.length===0&&!Ue)return console.log(`
No config files found. Using built-in rules only.`),0;for(let Oe of _e)if(Oe.inactive)IL(Oe.scope,Oe.path,Oe.result);else if(Oe.result.errors.length>0)OL(Oe.scope,Oe.path,Oe.result.errors);else{if(Oe.schema==="rules"&&zL(Oe.target))console.log(`
Added $schema to ${Oe.scope.toLowerCase()} config.`);TL(Oe.scope,Oe.path,Oe.result,Oe.schema)}for(let Oe of Be)console.error(`
${We.red(Oe)}`);if(Ue)if(Ue.result.errors.length>0)NL(Ue.path,Ue.result.errors);else jL(Ue.path,Ue.result);if(be)return console.error(`
Config validation failed.`),1;return console.log(ve?`
Configs valid with warnings.`:`
All configs valid.`),0}function ns(a,p){let v=`legacy ${a} config`;if(p==="cleanup")return`Warning: Legacy ${a} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;if(p==="migrate")return`Warning: Legacy ${a} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;return`Warning: Legacy ${a} config is no longer supported. Fix or delete the ${v}, then run \`npx -y cc-safety-net rule migrate\`.`}function RL(a){if(Le(a)===null)return null;let p=DL(a);if(p.ruleNames.size===0&&p.errors.length===0)return null;return{path:a.path,result:p}}function DL(a){let p=[],v=new Set,w=(Le(a)??[]).filter((k)=>!$L.has(k.name)).sort((k,M)=>k.name.localeCompare(M.name));if(w.length===0)return{errors:p,ruleNames:v};for(let k of w){if(!h.test(k.name)){p.push(`rulebook directory names must match ${h}: ${k.name}`);continue}if(k.kind!=="directory"){p.push(`${k.name} must be a rulebook directory`);continue}let M=i(a.scope,SL(a.path,k.name,"rulebook.json")),G=r(M);if(G===null){p.push(`${k.name}/rulebook.json is required`);continue}try{let B;try{B=JSON.parse(G)}catch{p.push(`${k.name}/rulebook.json: invalid JSON`);continue}let J=xe(B);if(J.name!==k.name){p.push(`rulebook name "${J.name}" must match folder "${k.name}"`);continue}let se=Jo(J);if(se.length>0){p.push(...se.map((ae)=>`${k.name}/rulebook.json: ${ae}`));continue}v.add(k.name)}catch(B){p.push(B instanceof Error?`${k.name}/rulebook.json: ${B.message}`:`${k.name}/rulebook.json: ${String(B)}`)}}return{errors:p,ruleNames:v}}function AL(){console.log(k2),console.log(CL)}function TL(a,p,v,w){if(console.log(`
✓ ${a} config: ${p}`),console.log(`  Schema: ${w==="rules"?"rulebook sources":"legacy inline rules"}`),v.ruleNames.size>0){console.log(`  ${w==="rules"?"Sources":"Rules"}:`);let k=1;for(let M of v.ruleNames)console.log(`    ${k}. ${M}`),k++}else console.log(`  ${w==="rules"?"Sources":"Rules"}: (none)`)}function IL(a,p,v){if(console.error(`
✗ Legacy ${a.toLowerCase()} config: ${p}`),console.error("  Schema: legacy inline rules"),console.error("  Status: ignored by CC Safety Net"),v.errors.length>0){console.error("  Errors:");let w=1;for(let k of v.errors)for(let M of k.split("; "))console.error(`    ${w}. ${M}`),w++;return}if(v.ruleNames.size>0){console.error("  Rules:");let w=1;for(let k of v.ruleNames)console.error(`    ${w}. ${k}`),w++;return}console.error("  Rules: (none)")}function OL(a,p,v){S2(`${a} config`,p,v)}function jL(a,p){console.log(`
✓ GitHub source rules: ${a}`),console.log("  Rulebooks:");let v=1;for(let w of p.ruleNames)console.log(`    ${v}. ${w}`),v++}function NL(a,p){S2("GitHub source rules",a,p)}function S2(a,p,v){console.error(`
✗ ${a}: ${p}`),console.error("  Errors:");let w=1;for(let k of v)for(let M of k.split("; "))console.error(`    ${w}. ${M}`),w++}function zL(a){try{let p=r(a);if(p===null)return!1;let v=JSON.parse(p);if(v.$schema)return!1;return C(a,JSON.stringify({$schema:PL,...v},null,2)),!0}catch(p){if(p instanceof o)throw p;return!1}}var C2=new Set(["init","add","remove","update","sync","list","wrapper","migrate","doc","verify"]),ML=new Set(["add","remove","list"]),UL="cc-safety-net/rulebooks";async function P2(a,p){try{return await HL(a,p)}catch(v){if(v instanceof o)return console.error(v.message),1;throw v}}async function HL(a,p){let v=GL(p),w=v.help?ZL(v.positionals):null;if(w)return Qn(w),0;if(v.errors.length>0){for(let B of v.errors)console.error(B);return 1}let k=v.positionals[0];if(!k)return Qn(Hn,console.error),1;let M=v.positionals[1],G={global:v.global};if(k==="init"){let B=Ht(a,G);JL(B.configTarget);let J=FL(B.configDir,"example-rules","rulebook.json"),se=i(B.filesystemScope,J);if(v.example&&r(se)===null)Km(se,"example-rules");let ae=ee(B.configPath,B.filesystemScope);for(let ce of ae)console.error(ce);if(ae.length>0)return 1;return console.log("Rule config initialized."),0}if(k==="add"){let B=$2(v);if(!B)return console.error("rule add requires a source (pass --only <rulebook...> to select from cc-safety-net/rulebooks)"),1;let J=Ht(a,G),se=await m2(a,B,{...G,ref:v.ref,rulebooks:v.only.length>0?v.only:void 0});return Bm(se,B,`Scope: ${v.global?"user":"project"} (${J.configDir})`),se.ok?0:1}if(k==="remove"){if(!M)return console.error("rule remove requires a source"),1;let B=await g2(a,M,{...G,deleteSource:v.deleteSource});return Vo(B,`Removed rulebook source: ${M}`),B.ok?0:1}if(k==="update"){let B=await es(a,{...G,only:M,refresh:!0});return Vo(B,"Rule config updated."),B.ok?0:1}if(k==="sync")return Gd(a,{global:v.global});if(k==="list"){let B=fe(a,{cwd:process.cwd()});return Vm(B),B.errors.length>0?1:0}if(k==="wrapper")return WL(a,v);if(k==="migrate")return L2(a,{cleanup:v.cleanup,cwd:process.cwd()});if(k==="doc"){console.log(Zm);let B=await x2(a);if(B)console.error(B);return 0}if(k==="verify")return _2(a);return 1}function ZL(a){if(a.length===0)return Hn;let p=Hn.subcommands.filter((w)=>w.usage.split(" ")[0]===a[0]);if(p.length===0)return null;if(a.length===1&&p.length>1)return{name:`rule ${a[0]}`,description:`Subcommands of rule ${a[0]}`,usage:`rule ${a[0]} <subcommand>`,subcommands:p,options:[]};let v=a.length===1?p[0]:p.find((w)=>w.usage.split(" ")[1]===a[1]);if(!v)return null;return{name:`rule ${a[0]}`,description:v.description,usage:`rule ${v.usage}`,options:a[0]==="add"?as:[],examples:a[0]==="add"?cs:void 0}}function GL(a){let p=c({label:"rule",booleans:{global:["-g","--global"],check:["--check"],cleanup:["--cleanup"],deleteSource:["--delete-source"],example:["--example"]},values:{ref:["--ref"]},lists:{only:["--only"]},positionals:"list"},a),v={...p.flags,ref:p.values.ref,only:p.lists.only??[],help:p.help,positionals:p.positionals,errors:p.errors};return BL(v),v}function BL(a){let[p]=a.positionals;if(p&&!C2.has(p))a.errors.push(`Unknown rule subcommand: ${p}`);if(a.deleteSource&&p!=="remove")if(p&&C2.has(p))a.errors.push(`Unknown option for rule ${p}: --delete-source`);else a.errors.push("--delete-source is only valid with 'rule remove'");if(a.check&&p)a.errors.push(or(p,"--check"));if(a.cleanup&&p!=="migrate")a.errors.push(or(p,"--cleanup"));if(a.example&&p!=="init")a.errors.push(or(p,"--example"));if(a.ref&&p!=="add")a.errors.push(or(p,"--ref"));if(a.only.length>0&&p!=="add")a.errors.push(or(p,"--only"));if(p==="add")qL(a);if(p==="migrate"){if(a.global)a.errors.push(or(p,"--global"));if(a.positionals.length>1)a.errors.push(`Unexpected rule migrate argument: ${a.positionals[1]}`)}else if(p==="wrapper")VL(a);else if(a.positionals.length>2)a.errors.push(`Unexpected rule argument: ${a.positionals[2]}`);if(p==="list"&&a.global)a.errors.push("Unknown option for rule list: --global")}function $2(a){if(a.positionals[1])return a.positionals[1];if(a.ref||a.only.length>0)return UL;return}function qL(a){let p=$2(a);if(!p)return;if((a.ref||a.only.length>0)&&!de(p)){if(a.ref)a.errors.push(`--ref can only select a ref for an owner/repo source: ${p}`);if(a.only.length>0)a.errors.push("--only can only select rulebooks from an owner/repo source");return}if(a.ref&&!we(a.ref))a.errors.push(`--ref must use valid path segments: ${a.ref}`);let v=a.only.filter((w)=>!h.test(w));if(v.length>0)a.errors.push(`Invalid rulebook names: ${v.join(", ")}`)}function or(a,p){return a?`Unknown option for rule ${a}: ${p}`:`Unknown option for rule: ${p}`}function VL(a){let p=a.positionals[1],v=a.positionals[2];if(!p){a.errors.push("rule wrapper requires add, remove, or list");return}if(!ML.has(p)){a.errors.push(`Unknown rule wrapper action: ${p}`);return}if(p==="list"){if(v)a.errors.push(`Unexpected rule wrapper argument: ${v}`);return}if(!v){a.errors.push(`rule wrapper ${p} requires a command`);return}if(a.positionals.length>3)a.errors.push(`Unexpected rule wrapper argument: ${a.positionals[3]}`)}function JL(a){if(r(a)===null){Wm(a);return}let p=x(a);if(!p.config)return;Ut(a,{version:1,rules:p.config.rules,overrides:p.config.overrides??{},transparent_wrappers:p.config.transparent_wrappers??[]})}async function WL(a,p){let v=p.positionals[1],w=p.positionals[2],k=Ht(a,{global:p.global}).configTarget;if(v==="list"){let J=x(k);if(J.errors.length>0){for(let se of J.errors)console.error(se);return 1}return KL(J.config?.transparent_wrappers??[]),0}if(!w||!E.test(w))return console.error("transparent wrapper must match command pattern"),1;if(Ae(w))return console.error(`reserved command "${w}" cannot be a wrapper`),1;let M=x(k);if(M.errors.length>0){for(let J of M.errors)console.error(J);return 1}let G=M.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},B=v==="add"?[...new Set([...G.transparent_wrappers??[],w])]:(G.transparent_wrappers??[]).filter((J)=>J!==w);return Ut(k,{version:1,rules:G.rules,overrides:G.overrides??{},transparent_wrappers:B}),console.log(v==="add"?`Added transparent wrapper: ${w}`:`Removed transparent wrapper: ${w}`),0}function KL(a){if(a.length===0){console.log("Transparent wrappers: (none)");return}console.log(`Transparent wrappers (${a.length}):`);for(let p of a)console.log(`  - ${p}`)}import{sep as nw}from"node:path";import{existsSync as YL,readFileSync as XL}from"node:fs";import{join as QL}from"node:path";async function ew(a){if(a.isTTY)return null;return(await $e(a).catch(()=>null))?.trim()||null}function tw(a){let p=a.env.get("CLAUDE_SETTINGS_PATH");if(p)return p;return QL(a.home,".claude","settings.json")}function oa(a){let p=tw(a);if(!YL(p))return!1;try{let v=XL(p,"utf-8"),w=JSON.parse(v);if(!w.enabledPlugins)return!1;let k="cc-safety-net@cc-marketplace";if(!(k in w.enabledPlugins))return!1;return w.enabledPlugins[k]===!0}catch(v){if(P(n.debug,a.env))console.error(`CC Safety Net debug: failed to read Claude settings: ${p}: ${v instanceof Error?v.message:String(v)}`);return!1}}async function sa(a,p=process.stdin){let v=oa(a),w;if(!v)w="\uD83D\uDEE1️ CC Safety Net ❌";else{let M=O(a,{cwd:process.cwd()}),G=M.policy,B=N(G,a.env),J=Object.values(te(G,B.capabilities)).some((ce)=>ce.changesInherited),se={standard:"✅",strict:"\uD83D\uDD12",paranoid:"\uD83D\uDC41️",custom:"\uD83D\uDD27"}[J?"custom":B.effectiveLevel],ae=(M.policyScopes?.weakenings.length??0)>0?"\uD83D\uDD3B":"";w=`\uD83D\uDEE1️ CC Safety Net ${se}${B.worktreeMode?"\uD83C\uDF33":""}${ae}${M.state==="degraded"?"⚠️":""}`}let k=await ew(p);if(k&&!k.startsWith("{"))console.log(`${k} | ${w}`);else console.log(w)}function E2(a){let p=O(a,{cwd:process.cwd()}),v=p.policy,w=N(v,a.env),k=!!process.env.NO_COLOR||!process.stdout.isTTY,M=Math.min(process.stdout.columns||80,100),G=k?"ok":"✔",B=k?"OFF":"✘",J=(ve,_e)=>{let Be=`  ${ve.padEnd(13)}${_e}`;return(Be.length>M?`${Be.slice(0,M-1)}…`:Be).replaceAll(B,We.red(B))},se=Object.values(te(v,w.capabilities)).some((ve)=>ve.changesInherited),ae=(ve)=>ve===a.home||ve.startsWith(`${a.home}${nw}`)?`~${ve.slice(a.home.length)}`:ve,ce={ready:We.green,degraded:We.yellow}[p.state],le=p.policyScopes?.weakenings??[],he=[...oa(a)?[]:["plugin cc-safety-net@cc-marketplace is disabled in Claude Code; nothing is enforced in Claude Code until it is re-enabled. Other integrations are not affected."],...p.diagnostics],be=k?"-":"·";console.log([`${k?"":"\uD83D\uDEE1️  "}CC Safety Net — ${ce(p.state)}`,"",J("Protection",`destructive ${v.destructiveCommandProtectionEnabled?G:B}   secrets ${v.secretProtection.enabled?G:B}`),J("Level",se?`${w.effectiveLevel} (customised)`:w.effectiveLevel),J("Rules",v.rules.length===0?"none active":`${v.rules.length} active`),J("Policy",ae(b(a))),...p.policyScopes?[J("Project",ae(L(process.cwd())))]:[],...w.worktreeMode?[J("Worktree","relaxations active")]:[],"",...le.length===0?[]:["  Project policy",...le.flatMap((ve)=>Cr(ve,"      ",M-6).map((_e,Be)=>Be===0?`    ${_e}`:_e)),""],...he.length===0?["  Everything configured is active."]:["  Not active",...he.flatMap((ve)=>Cr(ve,"      ",M-6).map((_e,Be)=>Be===0?`    ${be} ${_e}`:_e)),"","  Full report: cc-safety-net doctor"]].join(`
`))}import{spawn as M2}from"node:child_process";import{randomBytes as pw}from"node:crypto";import{existsSync as fw}from"node:fs";import{createServer as mw}from"node:http";import{Writable as gw}from"node:stream";var rs=500;function rw(a){let p=a.filter((k)=>k.decision!=="allow"),v=a.filter((k)=>k.decision==="allow"),w=Math.min(p.length,Math.max(rs-v.length,Math.ceil(rs/2)));return[...p.slice(0,w),...v.slice(0,rs-w)]}function R2(a,p,v=K(a)){if(v)ie(a,v);let w=(_e)=>new Date(_e.getFullYear(),_e.getMonth(),_e.getDate()).getTime(),k=w(new Date),M=new Date(k);M.setDate(M.getDate()-(p-1));let G=M.getTime(),B=[],J={count:0};for(let _e of v?kn(v,J):[])for(let Be of Un(_e,J)){if(!Be||typeof Be.ts!=="string"||typeof Be.command!=="string")continue;let Ue=new Date(Be.ts).getTime();if(!Number.isFinite(Ue))continue;if(Ue>=G)B.push(Be)}B.sort((_e,Be)=>new Date(Be.ts).getTime()-new Date(_e.ts).getTime());let se=Array.from({length:p},()=>0),ae=Array.from({length:p},()=>0),ce={},le={},he={},be=0,ve=0;for(let _e of B){let Be=_e.agent||"unknown";ce[Be]=(ce[Be]??0)+1;let Ue=Math.round((k-w(new Date(_e.ts)))/86400000),Oe=p-1-Ue,Lt=Ue>=0&&Ue<p;if(Lt)ae[Oe]=(ae[Oe]??0)+1;if(_e.decision!=="allow"){if(be++,_e.ruleId)le[_e.ruleId]=(le[_e.ruleId]??0)+1;let Je=Nr(_e.segment||_e.command);if(Je)he[Je]=(he[Je]??0)+1;if(_e.failureStage)ve++;if(Lt)se[Oe]=(se[Oe]??0)+1}}return{days:p,logsDir:v,homeDir:a.home,totalInWindow:B.length,truncated:B.length>rs,unreadable:J.count,counts:{blocked:be,allowed:B.length-be,agents:ce,blockedByDay:se,analyzedByDay:ae,rules:le,commands:he,errors:ve},entries:rw(B).sort((_e,Be)=>new Date(Be.ts).getTime()-new Date(_e.ts).getTime())}}import{spawn as ow}from"node:child_process";import{existsSync as sw,statSync as D2}from"node:fs";import{delimiter as iw,join as aw}from"node:path";var cw=120000,os="Choose the project folder",lw=`try
  return POSIX path of (choose folder with prompt "${os}")
on error number -128
  return ""
end try`,uw=`Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${os}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }`,A2=[{binary:"zenity",args:["--file-selection","--directory",`--title=${os}`]},{binary:"kdialog",args:["--getexistingdirectory",".","--title",os]}],T2=(a,p)=>(p.PATH??"").split(iw).some((v)=>{if(v.length===0)return!1;try{let w=D2(aw(v,a));return w.isFile()&&(w.mode&73)!==0}catch{return!1}});function ia(a,p){if(a==="darwin"||a==="win32")return!0;if(a!=="linux")return!1;if(!p.DISPLAY&&!p.WAYLAND_DISPLAY)return!1;return A2.some((v)=>T2(v.binary,p))}function dw(a,p){if(a==="darwin")return{cmd:"osascript",args:["-e",lw]};if(a==="win32")return{cmd:"powershell.exe",args:["-NoProfile","-STA","-Command",uw]};let v=A2.find((w)=>T2(w.binary,p));return v?{cmd:v.binary,args:v.args}:null}function aa(a=process.platform,p=process.env){let v=dw(a,p);if(!v)return Promise.resolve({error:"No folder dialog is available on this system"});return new Promise((w)=>{let k=ow(v.cmd,v.args,{env:p,stdio:["ignore","pipe","pipe"]}),M="",G=!1,B=(se)=>{if(G)return;G=!0,clearTimeout(J),w(se)},J=setTimeout(()=>{k.kill(),B({error:"The folder dialog timed out"})},cw);k.stdout.on("data",(se)=>{M+=se.toString()}),k.on("error",()=>B({error:`Could not open the folder dialog (${v.cmd})`})),k.on("close",()=>{let se=M.trim().replace(/\/+$/,"");if(!se)return B({cancelled:!0});if(!sw(se)||!D2(se).isDirectory())return B({error:"That selection is not a folder on disk"});B({path:se})})})}var I2=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net</title>
  <link rel="icon" href="data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221254%22%20height%3D%221254%22%20viewBox%3D%2254%2023%201140%201140%22%20role%3D%22img%22%20aria-label%3D%22Safety%20net%20logo%20mesh%20variant%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-0%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.68%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-1%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.58%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-2%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-3%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.9%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.38%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22edge%22%20x1%3D%2214%25%22%20y1%3D%228%25%22%20x2%3D%2288%25%22%20y2%3D%2294%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23bae6fd%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%231e293b%22%20stop-opacity%3D%220.86%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3Cmask%20id%3D%22net-mask%22%20maskUnits%3D%22userSpaceOnUse%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22black%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%3C%2Fmask%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Cg%3E%0A%20%20%20%20%3Cg%20mask%3D%22url(%23net-mask)%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22%2307090d%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22360%22%20cy%3D%22240%22%20r%3D%22430%22%20fill%3D%22url(%23spot-0)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22820%22%20cy%3D%22300%22%20r%3D%22430%22%20fill%3D%22url(%23spot-1)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22760%22%20cy%3D%22830%22%20r%3D%22500%22%20fill%3D%22url(%23spot-2)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22300%22%20cy%3D%22780%22%20r%3D%22390%22%20fill%3D%22url(%23spot-3)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22url(%23edge)%22%20opacity%3D%220.18%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22url(%23edge)%22%20stroke-width%3D%2214%22%20stroke-linejoin%3D%22round%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.2%22%20stroke-width%3D%225%22%20stroke-linejoin%3D%22round%22%20transform%3D%22translate(-10%20-14)%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A">
  <script>
    (() => {
      const stored = localStorage.getItem('cc-safety-net-theme');
      if (stored === 'light' || stored === 'dark') document.documentElement.style.colorScheme = stored;
    })();
  </script>
  <style>
/* cc-safety-net-gui-custom-css */
:root {
  color-scheme: light dark;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --bg: light-dark(#f3f4f6, #0c0e11);
  --surface: light-dark(#ffffff, #16191d);
  --surface-2: light-dark(#f6f7f9, #1c2025);
  --btn-hover-fill: light-dark(#e9ebef, #282c33);
  --field-bg: light-dark(#ffffff, #101317);

  --ink: light-dark(#171a1f, #e7eaed);
  --muted: light-dark(#5b626c, #99a1ac);
  --meta: light-dark(#6b7280, #838b95);

  --border: light-dark(#e3e6ea, #292d33);
  --border-strong: light-dark(#cfd4da, #363b42);

  /* Both track tones clear 3:1 against --surface so an off switch, and the knob
     inside it, stay visible without relying on the accent. */
  --switch-track: light-dark(#8b929c, #626973);
  --switch-track-hover: #767d87;
  --switch-knob: #ffffff;

  /* Neutral, not accent-tinted: the ring is a position indicator, not a state.
     Solid rather than a translucent mix so its contrast does not depend on
     whichever surface the focused control happens to sit on. */
  --focus-ring: var(--ink);

  --accent: light-dark(#166534, #3fb950);
  --safe: #14532d;
  --safe-hover: #0f3d20;
  --danger: #7f1d1d;
  --danger-hover: #641414;

  --star: light-dark(#b7791f, #f2c94c);

  --ok-fg: light-dark(#15803d, #4ade80);
  --ok-bg: light-dark(#edfaf1, #10251a);
  --ok-border: light-dark(#b7e4c7, #1f5133);

  --err-fg: light-dark(#b42318, #ff8078);
  --err-bg: light-dark(#fef2f1, #2b1512);
  --err-border: light-dark(#f2c9c4, #5c2620);

  --warn-fg: light-dark(#b45309, #fbbf24);
  --warn-bg: light-dark(#fefaf0, #2a2008);
  --warn-border: light-dark(#f2ddb0, #5c4a1d);

  --master: light-dark(#1d4ed8, #4c8dff);
  --master-fg: light-dark(#1e40af, #9ec3ff);
  --master-bg: light-dark(#eef4fe, #101a2b);
  --master-border: light-dark(#c5d6f6, #23446e);

  --strict-fg: light-dark(#1e40af, #9ec3ff);
  --strict-bg: light-dark(#eef4fe, #101a2b);
  --strict-border: light-dark(#c5d6f6, #23446e);
  --paranoid-fg: light-dark(#6b21a8, #d8b4fe);
  --paranoid-bg: light-dark(#faf5ff, #21152c);
  --paranoid-border: light-dark(#e4ccf4, #513064);

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  --topbar-h: 58px;

  font-family: var(--font-sans);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 14px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  padding: 0 10px;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-logo {
  display: flex;
  color: var(--ink);
}

.brand-home {
  display: flex;
  color: inherit;
}

.brand-logo svg {
  width: auto;
  height: 30px;
}

.sidenav {
  display: grid;
  gap: 2px;
}

.sidenav a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidenav a:hover {
  background: var(--surface-2);
  color: var(--ink);
}

/* One step above the hover fill, so the selected item stays readable while a
   sibling is hovered. */
.sidenav a[aria-current="page"] {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.sidenav svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.sidebar-foot {
  margin-top: auto;
  display: grid;
  gap: 10px;
  padding: 0 10px;
}

.sidebar-links {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.sidebar-links a {
  color: var(--meta);
  text-decoration: none;
}

.sidebar-links a:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sidebar-links a:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-foot {
  display: none;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  min-height: var(--topbar-h);
  padding: 12px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  max-width: 1040px;
  margin: 0 auto;
}

.topbar-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-status {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.app-status:empty {
  display: none;
}

.app-status.ok {
  color: var(--ok-fg);
  border-color: var(--ok-border);
  background: var(--ok-bg);
}

.app-status.error {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.dirty-chip {
  padding: 6px 12px;
  border: 1px solid var(--warn-border);
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.view-search {
  display: flex;
  align-items: center;
  flex: 1 1 240px;
  min-width: 180px;
  max-width: 380px;
}

.topbar-search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 440px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Everything clickable gets the pointer cursor. Links already get it from the
   user agent; buttons, selects, and the label rows that wrap a control do not. */
button:not(:disabled),
select,
label.row:not(.row-disabled),
label.rule-control,
input[type="checkbox"]:not(:disabled),
input[type="radio"]:not(:disabled) {
  cursor: pointer;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 14px;
  background: var(--surface);
  color: var(--ink);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

button:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--muted);
}

/* Borderless ghost buttons with a soft filled-square hover. */
#theme-toggle,
#raw-copy,
#activity-refresh,
#integrations-refresh,
#rules-refresh,
#tester-run,
#reset-rule-customizations,
#reset-secret-customizations,
.rule-example-button {
  border-color: transparent;
}

#theme-toggle:hover:not(:disabled),
#raw-copy:hover:not(:disabled),
#activity-refresh:hover:not(:disabled),
#integrations-refresh:hover:not(:disabled),
#rules-refresh:hover:not(:disabled),
#tester-run:hover:not(:disabled),
#reset-rule-customizations:hover:not(:disabled),
#reset-secret-customizations:hover:not(:disabled),
.rule-example-button:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

button:disabled {
  opacity: 0.6;
  cursor: progress;
}

button.primary {
  background: var(--safe);
  border-color: var(--safe);
  color: #fff;
}

button.primary:hover:not(:disabled) {
  background: var(--safe-hover);
  border-color: var(--safe-hover);
}

button.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

button.danger:hover:not(:disabled) {
  background: var(--danger-hover);
  border-color: var(--danger-hover);
}

#theme-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  gap: 7px;
  color: var(--muted);
}

#theme-toggle:hover {
  color: var(--ink);
}

#theme-toggle svg {
  width: 15px;
  height: 15px;
}

button.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--muted);
}

button.icon-button:hover:not(:disabled) {
  color: var(--ink);
}

button.icon-button.copied {
  color: var(--ok-fg);
}

button.icon-button.copied:hover:not(:disabled) {
  color: var(--ok-fg);
}

button.icon-button svg {
  width: 16px;
  height: 16px;
}

:where(button, input, textarea):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

main {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.view {
  display: grid;
  gap: 18px;
}

.view[hidden] {
  display: none;
}

.view-head .panel-sub {
  margin-top: 0;
}

.policy-savebar {
  position: sticky;
  top: var(--topbar-h);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.savebar-actions {
  display: flex;
  gap: 8px;
}

.retention-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12.5px;
  font-weight: 600;
}

.retention-row input {
  width: 84px;
  text-align: right;
}

.retention-note {
  margin: 8px 0 0;
  font-size: 12px;
}

/* States the window once for the row, so each tile label stays a single word. */
.tiles-window {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.tiles-window:empty {
  display: none;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.tiles:empty {
  display: none;
}

/* Count and label stack on the left, series on the right: seven bars stretched
   across a half-width tile read as blocks rather than a trend. */
.tile {
  display: grid;
  grid-template-columns: 1fr minmax(0, 168px);
  grid-template-areas:
    "value spark"
    "label spark";
  align-items: center;
  gap: 3px 16px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.tile strong {
  grid-area: value;
  align-self: end;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.tile span {
  grid-area: label;
  align-self: start;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

.view-all-link {
  align-self: center;
  padding: 8px 14px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.view-all-link:hover {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.protection-warning {
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

.dual-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 720px) {
  .dual-panels {
    grid-template-columns: 1fr;
  }
}

/* minmax(0, 1fr), not the implicit auto track: rule IDs are nowrap, and their
   min-content would otherwise widen the whole Overview grid past the viewport. */
#top-rules,
#top-commands {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.top-rule,
.top-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border-color: transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  text-align: left;
}

.top-rule:hover:not(:disabled),
.top-command:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

.top-rule .rule-id,
.top-command .rule-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guard-errors {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--warn-border);
  border-radius: var(--radius);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
}

.activity-controls {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.activity-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-days {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--muted);
}

.activity-refresh {
  margin-left: auto;
}

@keyframes activity-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.activity-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

.integrations-refresh,
.rules-refresh {
  margin-left: auto;
}

.integrations-refresh.spinning svg,
.rules-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

#integrations-list {
  display: grid;
  gap: 8px;
}

.integration-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.integration-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.integration-row .status {
  grid-column: 1 / -1;
}

.integration-row button.primary,
.integration-row button.danger {
  min-width: 88px;
  background: transparent;
  border-color: transparent;
  color: var(--ink);
}

.integration-row button.primary:hover:not(:disabled),
.integration-row button.danger:hover:not(:disabled) {
  color: #fff;
}

/* The panel stacks bare .field blocks rather than wrapping them in a gapped
   grid, so each label would otherwise sit flush against the control above it. */
#rules-composer-panel .field + .field,
.rules-composer-actions {
  margin-top: 14px;
}

.rules-path-row {
  display: flex;
  gap: 8px;
}

.rules-path-row input {
  flex: 1 1 auto;
  min-width: 0;
}

.rules-path-row button {
  flex: none;
}

/* Picked, not typed: the value is a dialog result, so it reads as a fact rather
   than an editable field until the picker turns out to be unusable. */
#rules-project-path[readonly] {
  border-color: var(--border);
  color: var(--muted);
}

.rules-composer-actions {
  display: flex;
  justify-content: flex-end;
}

#rules-list,
#rules-diagnostics {
  display: grid;
  gap: 8px;
}

.rulebook-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.rulebook-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
}

/* minmax(0, 1fr), not the implicit auto track: nowrap custom.<name> ids would
   otherwise widen the card past the viewport. */
.rulebook-rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.rulebook-head code,
.rulebook-rule code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.rulebook-rule .rule-id {
  color: var(--muted);
}

.rulebook-rule p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

/* The jumped-to rule is scrolled to the middle of a list of near-identical
   rows, so the marker needs an edge, not just a surface shade. */
.rulebook-rule.rules-focus {
  margin: 0 -8px;
  padding: 10px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

select {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row:empty {
  display: none;
}

button.chip {
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

button.chip[aria-pressed="true"] {
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

.chip-count {
  font-variant-numeric: tabular-nums;
}

button.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

button.filter-pill code {
  font-family: var(--font-mono);
}

.filter-pill-x {
  opacity: 0.7;
}

.feed-list {
  display: grid;
  gap: 8px;
}

.feed-item {
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--meta);
}

.feed-meta time {
  margin-left: auto;
  white-space: nowrap;
}

.feed-copy,
.feed-report {
  width: 26px;
  height: 26px;
  margin: -4px 0;
  border: 0;
  background: transparent;
}

.feed-copy:hover:not(:disabled),
.feed-report:hover:not(:disabled) {
  background: transparent;
}

.feed-copy svg,
.feed-report svg {
  width: 14px;
  height: 14px;
}

.feed-copy.copied svg {
  width: 12px;
  height: 12px;
}

.feed-meta .rule-id {
  font-family: var(--font-mono);
  color: var(--muted);
  overflow-wrap: anywhere;
}

/* button.rule-id drops to font: inherit, and the tester renders a custom rule
   id as a button next to a <code> built-in id, so the face has to be restored
   or the same slot changes typeface with the rule that fired. */
#tester-result .rule-id {
  font-family: var(--font-mono);
}

button.rule-id {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
}

button.rule-id:hover {
  color: var(--ink);
  text-decoration: underline;
}

.decision-badge {
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.decision-badge.deny {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.decision-badge.allow {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.decision-badge.error {
  color: var(--warn-fg);
  background: var(--warn-bg);
  border-color: var(--warn-border);
}

.agent-badge {
  padding: 1px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
}

.feed-command,
.rule-example-popover code {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feed-command {
  padding: 8px 10px;
  max-width: 85ch;
  max-height: 7.2em;
  overflow: hidden;
}

.feed-command.clamped {
  mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent);
}

.feed-command.expanded {
  max-height: none;
  mask-image: none;
}

.feed-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* .feed-toggle is sized for its usual slot below the command. In .feed-meta it
   has to drop to the row's 11px and stop overriding the row's centre alignment. */
.feed-block {
  align-self: center;
  font-size: 11px;
}

.feed-day-sep {
  padding-top: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.tile-spark {
  grid-area: spark;
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  height: 40px;
}

/* Full-height hover column so short bars are easy to target; the visible bar
   sits at the bottom and the tooltip anchors at a consistent height. */
.spark-col {
  position: relative;
  display: flex;
  align-items: flex-end;
  flex: 1 1 0;
  min-width: 1px;
}

.spark-bar {
  width: 100%;
  background: var(--accent);
  border-radius: 1px;
}

.spark-bar.spark-zero {
  background: var(--border-strong);
}

.spark-col::after {
  content: attr(data-count);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.spark-col:hover::after,
.spark-col:focus-visible::after {
  opacity: 1;
}

.spark-col:focus-visible {
  border-radius: var(--radius-sm);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.feed-reason {
  margin: 0;
  max-width: 85ch;
  font-size: 12px;
}

.activity-count {
  margin: 12px 0 0;
  font-size: 12px;
}

.activity-count:empty {
  display: none;
}

.info-rows {
  display: grid;
  gap: 10px;
}

.info-row {
  display: grid;
  gap: 3px;
}

.info-row > span {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}

.info-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.danger-row strong {
  font-size: 13px;
}

.danger-row p {
  margin: 4px 0 0;
  font-size: 12px;
}

.status {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.status:empty {
  display: none;
}

.protection-banner {
  padding: 10px 14px;
  border: 1px solid var(--err-fg);
  border-radius: var(--radius);
  background: var(--err-bg);
  color: var(--err-fg);
  font-weight: 600;
}

.status.ok {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.status.error {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.health-strip strong {
  color: var(--ink);
  font-weight: 650;
}

.recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--err-border);
  border-radius: var(--radius);
  background: var(--surface);
}

.recovery[hidden] {
  display: none;
}

.recovery strong {
  display: block;
  font-size: 13px;
}

.recovery p {
  margin: 4px 0 0;
}

.muted {
  color: var(--muted);
  line-height: 1.45;
}

.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
}

.rule-example-popover {
  position: fixed;
  inset: auto;
  width: min(360px, calc(100vw - 24px));
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 4px 8px rgb(0 0 0 / 18%);
}

.rule-example-popover::backdrop {
  background: transparent;
}

.rule-example-popover > * {
  display: block;
}

.rule-example-label {
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 11px;
}

.rule-example-popover strong {
  margin-bottom: 10px;
  font-size: 13px;
}

.rule-example-popover code {
  padding: 9px 10px;
}

.confirm-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
}

.confirm-dialog form {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.confirm-dialog h2 {
  margin: 0;
}

.confirm-dialog p {
  margin: 0;
}

.dialog-detail {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  overflow-wrap: anywhere;
}

.dialog-detail code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.report-dialog {
  width: min(680px, calc(100vw - 32px));
}

/* The before/after rows need more room than a text-only confirmation. */
.confirm-dialog:has(.dialog-rows:not([hidden])) {
  width: min(620px, calc(100vw - 32px));
}

.dialog-rows {
  max-height: 46vh;
  overflow: auto;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.diff-table th {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 600;
}

.diff-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
  vertical-align: top;
}

.diff-table code {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.diff-before {
  color: var(--muted);
  text-decoration: line-through;
}

.diff-after {
  color: var(--ink);
  font-weight: 650;
}

.diff-warning {
  margin: 8px 0 0;
  padding: 7px 10px;
  border-left: 3px solid var(--warn-border);
  border-radius: var(--radius-sm);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
}

.view-head-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.project-draft-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--master-border);
  border-radius: var(--radius);
  background: var(--master-bg);
}

.project-draft-bar[hidden] {
  display: none;
}

.project-draft-target strong {
  display: block;
  font-size: 13px;
}

.project-draft-target code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.project-draft-target p {
  margin: 4px 0 0;
  font-size: 12px;
}

/* Says whose value a control is showing: the project's, or the one it inherits
   from each member's own user policy. */
.project-chip {
  flex: none;
  align-self: center;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--master-border);
  border-radius: 999px;
  background: var(--master-bg);
  color: var(--master-fg);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.project-chip.inherited {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-weight: 600;
}

.rule-row > .project-chip {
  grid-column: 1 / -1;
  justify-self: end;
  margin-left: 0;
}

.project-field-line {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.project-chip-slot:empty {
  display: none;
}

/* An inherited control is showing someone else's value, so it reads quieter. */
.row:has(.project-chip.inherited) strong {
  color: var(--muted);
}

.report-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.panel-title {
  min-width: 0;
}

.raw-json-head {
  flex-wrap: nowrap;
}

.raw-json-head .panel-title {
  flex: 1 1 auto;
}

.raw-json-head #raw-copy {
  flex: none;
}

.panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0;
  padding: 4px 6px 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
}

.panel-toggle:hover {
  background: transparent;
  color: var(--ink);
}

.panel-chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s ease;
}

.panel-toggle[aria-expanded="false"] .panel-chevron,
:is(.rule-tier-head, .tier-collapse)[aria-expanded="false"] .panel-chevron {
  transform: rotate(-45deg);
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

label.row {
  display: flex;
  gap: 12px;
}

label.row,
.rule-row {
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

label.row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

label.row.row-disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

label.row.row-disabled:hover {
  border-color: var(--border);
  background: var(--surface);
}

:is(label.row, .rule-control) input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  margin: 1px 0 0;
  width: 34px;
  height: 20px;
  flex: none;
  border: 1px solid var(--switch-track);
  border-radius: 999px;
  background: var(--switch-track);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

:is(label.row, .rule-control) input[type="checkbox"]::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

:is(label.row, .rule-control) input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

:is(label.row, .rule-control) input[type="checkbox"]:checked::before {
  transform: translateX(14px);
}

:is(label.row, .rule-control):hover input[type="checkbox"]:not(:checked) {
  border-color: var(--switch-track-hover);
  background: var(--switch-track-hover);
}

label.row.safety-override-row {
  display: grid;
  gap: 8px;
}

label.row.safety-override-row select {
  width: 100%;
}

:is(label.row, .rule-control) span {
  display: block;
  min-width: 0;
}

:is(label.row, .rule-control) strong {
  font-weight: 650;
  font-size: 13px;
}

:is(label.row, .rule-control) .rule-id {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  word-break: break-all;
}

:is(label.row, .rule-control) small {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
}

#destructive-command > label.row {
  margin-bottom: 16px;
}

.preset-status {
  margin-bottom: 10px;
  font-weight: 700;
}

#safety-preset-status:empty {
  display: none;
}

.preset-status.customized {
  color: var(--master-fg);
}

/* The picker is the most consequential control in the console, and it named
   the same three tiers the rule sections below already color. The selected
   card now speaks that vocabulary; unselected cards stay neutral. */
.preset-standard {
  --preset-fg: var(--ok-fg);
  --preset-bg: var(--ok-bg);
  --preset-border: var(--ok-border);
}

.preset-strict {
  --preset-fg: var(--strict-fg);
  --preset-bg: var(--strict-bg);
  --preset-border: var(--strict-border);
}

.preset-paranoid {
  --preset-fg: var(--paranoid-fg);
  --preset-bg: var(--paranoid-bg);
  --preset-border: var(--paranoid-border);
}

#safety-level label.row:has(input:checked),
#safety-level label.row:has(input:checked):hover {
  border-color: var(--preset-border);
  background: var(--preset-bg);
  accent-color: var(--preset-fg);
}

#safety-level label.row:has(input:checked) strong {
  color: var(--preset-fg);
}

.panel-head-action {
  flex: none;
}

.rule-tier {
  overflow: clip;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.rule-tier + .rule-tier,
#destructive-command-rules + .rule-tier {
  margin-top: 10px;
}

.rule-tier-enforced {
  border-color: var(--ok-border);
}

.rule-tier-strict {
  border-color: var(--strict-border);
}

.rule-tier-paranoid {
  border-color: var(--paranoid-border);
}

.rule-tier-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-2);
  color: var(--ink);
  text-align: left;
}

.rule-tier-head:hover:not(:disabled) {
  background: var(--surface-2);
}

/* The secret group head carries a bulk action, so the collapse control is a
   button inside the head rather than the head itself. The negative margin
   cancels the head's padding and the stretch spans the taller switch beside it,
   so the button covers the whole head band and the layout stays where it was;
   without them the head's padding is a dead zone. */
.tier-collapse {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  align-self: stretch;
  gap: 12px;
  margin: -9px -10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  text-align: left;
}

/* A thin track with a knob that overhangs it. The rule switches are a filled
   pill, so the group control does not read as one more rule. */
.tier-switch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  width: 30px;
  height: 16px;
  flex: none;
  padding: 0;
  border: 0;
  background: none;
}

.tier-switch::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--switch-track);
  transition: background-color 0.18s ease;
}

/* Above the track, which paints later in the pseudo-element order. */
.tier-switch::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

.tier-switch:checked::after {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}

.tier-switch:checked::before {
  transform: translateX(14px);
  background: var(--accent);
}

/* The tiers that can be switched off carried the only hues, leaving the tier
   that can never be switched off as the quietest thing on the panel. */
.rule-tier-enforced .rule-tier-head,
.rule-tier-enforced .rule-tier-head:hover:not(:disabled) {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.rule-tier-strict .rule-tier-head,
.rule-tier-strict .rule-tier-head:hover:not(:disabled) {
  background: var(--strict-bg);
  color: var(--strict-fg);
}

.rule-tier-paranoid .rule-tier-head,
.rule-tier-paranoid .rule-tier-head:hover:not(:disabled) {
  background: var(--paranoid-bg);
  color: var(--paranoid-fg);
}

.tier-label {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.tier-label small,
.tier-counts {
  color: inherit;
  font-size: 11px;
}

.tier-counts {
  flex: none;
  font-weight: 500;
  text-align: right;
}

.tier-counts .count-off {
  color: var(--warn-fg);
}

.tier-content {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.rule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.rule-row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.rule-row.row-disabled {
  background: var(--surface);
}

.rule-control {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
}

.rule-row.row-disabled .rule-control {
  cursor: not-allowed;
  opacity: 0.62;
}

.rule-example-button {
  position: relative;
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
}

.rule-example-button::before {
  content: "";
  position: absolute;
  inset: -9px;
}

.rule-example-button:hover:not(:disabled) {
  color: var(--ink);
}

.inherit-button {
  grid-column: 1 / -1;
  justify-self: end;
  padding: 5px 8px;
  font-size: 11px;
}

label.row.master {
  align-items: center;
  padding: 12px 14px;
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

label.row.master:hover {
  border-color: color-mix(in srgb, var(--err-fg) 34%, var(--err-border));
  background: var(--err-bg);
}

label.row.master:not(:has(input:checked)) {
  border-left: 3px solid var(--err-fg);
}

label.row.master:has(input:checked) {
  border-color: var(--master-border);
  background: color-mix(in srgb, var(--master-bg) 72%, var(--surface));
}

label.row.master:has(input:checked):hover {
  border-color: color-mix(in srgb, var(--master) 42%, var(--master-border));
  background: var(--master-bg);
}

label.row.master strong {
  font-size: 15px;
}

label.row.master input[type="checkbox"] {
  margin: 0;
  width: 44px;
  height: 24px;
}

label.row.master input[type="checkbox"]:checked {
  background: var(--master);
  border-color: var(--master);
}

label.row.master input[type="checkbox"]::before {
  width: 18px;
  height: 18px;
}

label.row.master input[type="checkbox"]:checked::before {
  transform: translateX(20px);
}

.master-badge {
  flex: none;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--err-border);
  border-radius: 999px;
  background: var(--err-bg);
  color: var(--err-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

label.row.master:has(input:checked) .master-badge {
  border-color: var(--master-border);
  background: var(--master-bg);
  color: var(--master-fg);
}

.state-active {
  color: var(--ok-fg);
  font-weight: 700;
}

.state-disabled {
  color: var(--err-fg);
  font-weight: 700;
}

.destructive-command-group + .destructive-command-group {
  margin-top: 24px;
}

.destructive-command-group h3 {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--muted);
  text-align: center;
}

#secret {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 4px;
}

.field-toggle .panel-toggle {
  justify-self: start;
  margin: -2px 0;
  padding: 2px 6px 2px 0;
  font-weight: 650;
}

#safety-level + .field,
.foldable-field-content + .field {
  margin-top: 14px;
}

#safety-overrides,
#workflow {
  margin-top: 4px;
}

.foldable-field-content {
  display: grid;
  gap: 4px;
}

.foldable-field-content > p {
  margin: 0;
  font-size: 12px;
}

.paths-content:not([hidden]) {
  display: grid;
  gap: 10px;
}

.paths-content > p.muted {
  margin: 0;
  font-size: 12px;
}

.field > span {
  font-size: 13px;
  font-weight: 650;
}

.field small {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 400;
  line-height: 1.45;
}

input[type="search"],
input[type="text"],
textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 9px 11px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
  transition: border-color 0.15s ease;
}

input[type="search"]:hover,
input[type="text"]:hover,
textarea:hover {
  border-color: var(--muted);
}

/* Text fields carry no focus ring. \`outline: none\` is load-bearing rather than
   redundant: without it these fall back to the browser's default focus-visible
   outline. Buttons, links, and the sparkline columns keep theirs. */
input[type="search"]:focus,
input[type="text"]:focus,
textarea:focus {
  border-color: var(--muted);
  outline: none;
}

input[type="text"]:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.tester-row {
  display: flex;
  gap: 8px;
}

.tester-row input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.tester-row button {
  flex: none;
  align-self: center;
}

#tester-result {
  margin-top: 12px;
}

.tester-segment {
  margin-top: 6px;
}

.paths-add {
  display: flex;
  gap: 8px;
}

.paths-add input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.paths-add button {
  flex: none;
  align-self: center;
}

.paths-hint {
  margin: -6px 0 0;
  color: var(--err-fg);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.paths-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-item code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.path-item button:hover:not(:disabled) {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.path-item.row-disabled {
  opacity: 0.62;
}

.path-item.row-disabled button {
  cursor: not-allowed;
}

.path-item button {
  flex: none;
}

textarea {
  min-height: 96px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
}

#raw {
  min-height: 280px;
}

.star-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 0 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.star-pitch {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  line-height: 1.45;
}

.star-pitch strong {
  font-variant-numeric: tabular-nums;
}

.star-mechanism {
  display: block;
  margin-top: 2px;
  color: var(--meta);
  font-size: 11.5px;
}

#star-slot {
  display: inline-flex;
  flex: none;
}

.star-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  white-space: nowrap;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.star-cta:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--star) 45%, var(--border-strong));
  background: var(--surface-2);
  color: var(--ink);
}

.star-cta:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.star-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  color: var(--star);
}

.star-icon svg {
  width: 15px;
  height: 15px;
}

.star-count {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.star-cta.starred:disabled {
  opacity: 1;
  cursor: default;
}

/* !important and the pseudo-element selectors are load-bearing: the universal
   selector loses to every class-level transition in this file, and does not
   match the switch knob's ::before at all. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* biome-ignore lint/complexity/noImportantStyles: reduced-motion must win over every class-level transition */
    transition: none !important;
  }

  .activity-refresh.spinning svg,
  .integrations-refresh.spinning svg,
  .rules-refresh.spinning svg {
    animation: none;
  }
}

@media (max-width: 900px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .sidebar {
    z-index: 100;
    height: var(--topbar-h);
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 0 16px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  /* The bar's six nav items sit at their minimum width, so the wordmark is
     what has to give for the row to fit a 320px viewport. */
  .brand-logo svg {
    height: 20px;
  }

  .topbar {
    position: static;
    z-index: auto;
  }

  /* On views with a search, the top bar becomes a slim sticky search row
     pinned directly below the nav bar. */
  .topbar.has-search {
    position: sticky;
    top: var(--topbar-h);
    z-index: 95;
  }

  .policy-savebar {
    top: calc(var(--topbar-h) * 2);
  }

  .brand {
    flex: none;
    padding: 0;
  }

  main {
    flex: 1;
  }

  .app-foot {
    display: flex;
    justify-content: center;
    gap: 28px;
    padding: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .app-foot a {
    color: var(--meta);
    text-decoration: none;
  }

  .app-foot a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sidenav {
    display: flex;
    flex: 1;
    justify-content: flex-end;
    gap: 2px;
  }

  /* Vertical padding fills the bar for a taller touch target; the horizontal
     side stays tight because the row already has no width to spare at 320px. */
  .sidenav a {
    padding: 15px 7px;
  }

  .sr-only-collapse {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sidebar-foot {
    display: none;
  }
}

@media (max-width: 640px) {
  .topbar {
    padding: 10px 16px;
  }

  .topbar-row {
    flex-wrap: wrap;
  }

  .topbar.has-search .topbar-row {
    flex-wrap: nowrap;
  }

  main {
    padding: 18px 16px 40px;
  }

  .topbar-search {
    max-width: none;
  }

  .panel {
    padding: 16px;
  }

  .star-row {
    flex-wrap: wrap;
  }

  .star-row .star-cta,
  .star-row #star-slot {
    flex: 1 1 100%;
    justify-content: center;
  }

  .panel-head {
    flex-direction: column;
  }

  .raw-json-head,
  .panel-head:has(.view-all-link) {
    flex-direction: row;
    align-items: center;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* The counts wrap to their own line below the label. The destructive tiers
     and secret groups nest the label and counts inside .tier-collapse, so the
     wrap must be enabled there as well, not only on the head. */
  .rule-tier-head,
  .tier-collapse {
    flex-wrap: wrap;
  }

  .rule-row {
    align-items: start;
  }

  .tier-counts {
    flex: 1 1 100%;
    padding-left: 20px;
    text-align: left;
  }

  .inherit-button {
    align-self: flex-start;
  }
}

@media (min-width: 1440px) {
  body[data-view="overview"] main,
  body[data-view="overview"] .topbar-row {
    max-width: 1200px;
  }
}

[hidden] {
  display: none;
}

  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="brand-logo"><a class="brand-home" href="#overview" title="Overview"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 512" role="img" aria-label="CC Safety Net">
  <path d="M 1439 165 L 1411 165 L 1409 166 L 1408 168 L 1403 173 L 1403 174 L 1398 179 L 1398 180 L 1395 183 L 1394 183 L 1394 184 L 1385 194 L 1385 195 L 1381 199 L 1381 200 L 1378 202 L 1378 203 L 1374 207 L 1374 208 L 1367 215 L 1367 216 L 1358 226 L 1358 227 L 1352 233 L 1352 234 L 1347 239 L 1347 240 L 1341 246 L 1341 247 L 1336 252 L 1336 253 L 1332 257 L 1332 258 L 1325 265 L 1325 266 L 1319 272 L 1319 273 L 1314 278 L 1314 279 L 1309 284 L 1309 285 L 1303 291 L 1303 292 L 1299 296 L 1299 297 L 1294 302 L 1291 299 L 1290 300 L 1290 301 L 1293 301 L 1294 302 L 1288 309 L 1287 308 L 1288 309 L 1286 312 L 1285 311 L 1285 306 L 1286 305 L 1286 303 L 1288 299 L 1288 296 L 1289 295 L 1289 292 L 1290 291 L 1290 287 L 1291 286 L 1291 284 L 1293 280 L 1293 277 L 1294 276 L 1294 272 L 1295 271 L 1295 269 L 1297 265 L 1297 262 L 1298 261 L 1298 258 L 1299 257 L 1299 253 L 1300 252 L 1300 250 L 1301 249 L 1301 247 L 1303 243 L 1303 238 L 1304 237 L 1304 235 L 1305 234 L 1305 232 L 1307 228 L 1307 224 L 1308 223 L 1308 221 L 1309 220 L 1309 217 L 1310 216 L 1310 214 L 1312 210 L 1312 205 L 1314 202 L 1314 199 L 1316 195 L 1317 188 L 1318 187 L 1318 185 L 1319 184 L 1319 182 L 1321 178 L 1321 173 L 1323 169 L 1323 166 L 1296 166 L 1296 168 L 1294 171 L 1294 174 L 1293 175 L 1293 178 L 1292 179 L 1291 186 L 1290 187 L 1290 189 L 1289 190 L 1289 192 L 1287 196 L 1287 200 L 1285 204 L 1285 207 L 1283 211 L 1283 215 L 1282 216 L 1282 218 L 1281 219 L 1281 222 L 1279 226 L 1279 229 L 1278 230 L 1278 234 L 1277 235 L 1277 237 L 1276 238 L 1276 240 L 1274 244 L 1274 249 L 1273 250 L 1273 252 L 1271 256 L 1271 259 L 1270 260 L 1270 263 L 1269 264 L 1269 268 L 1268 269 L 1268 271 L 1266 275 L 1266 278 L 1265 279 L 1265 284 L 1264 285 L 1264 287 L 1262 291 L 1262 294 L 1261 295 L 1261 298 L 1260 299 L 1259 306 L 1258 307 L 1258 309 L 1257 310 L 1257 313 L 1256 314 L 1256 318 L 1254 322 L 1254 325 L 1273 325 L 1274 327 L 1273 328 L 1272 327 L 1273 328 L 1269 332 L 1269 333 L 1265 337 L 1265 338 L 1261 341 L 1261 342 L 1252 352 L 1252 353 L 1247 358 L 1247 359 L 1242 364 L 1242 365 L 1239 367 L 1239 368 L 1224 385 L 1224 386 L 1220 390 L 1220 391 L 1216 395 L 1216 396 L 1214 397 L 1214 399 L 1247 399 L 1249 397 L 1249 396 L 1259 385 L 1259 384 L 1263 380 L 1263 379 L 1265 377 L 1266 377 L 1266 376 L 1271 371 L 1271 370 L 1278 363 L 1278 362 L 1283 357 L 1283 356 L 1294 344 L 1294 343 L 1298 339 L 1298 338 L 1305 331 L 1305 330 L 1309 326 L 1309 325 L 1312 323 L 1313 320 L 1315 319 L 1316 317 L 1321 312 L 1322 312 L 1321 311 L 1330 301 L 1330 300 L 1335 295 L 1335 294 L 1337 292 L 1338 292 L 1339 289 L 1342 287 L 1342 286 L 1346 282 L 1346 281 L 1352 275 L 1352 274 L 1361 264 L 1361 263 L 1370 253 L 1370 252 L 1375 247 L 1375 246 L 1380 241 L 1380 240 L 1387 233 L 1387 232 L 1402 215 L 1402 214 L 1406 210 L 1406 209 L 1408 207 L 1409 207 L 1409 206 L 1413 202 L 1413 201 L 1418 196 L 1418 195 L 1422 191 L 1422 190 L 1427 185 L 1427 184 L 1431 180 L 1431 179 L 1440 169 L 1441 167 Z
M 1129 179 L 1126 178 L 1125 176 L 1124 176 L 1116 170 L 1114 170 L 1107 166 L 1105 166 L 1104 165 L 1101 165 L 1100 164 L 1096 164 L 1095 163 L 1091 163 L 1090 162 L 1081 162 L 1080 161 L 1076 161 L 1075 162 L 1066 162 L 1065 163 L 1061 163 L 1060 164 L 1057 164 L 1056 165 L 1051 165 L 1050 166 L 1045 167 L 1040 170 L 1038 170 L 1028 175 L 1023 179 L 1021 179 L 1017 183 L 1016 183 L 1012 187 L 1011 187 L 999 199 L 999 200 L 996 203 L 996 204 L 994 205 L 993 208 L 990 211 L 981 229 L 981 231 L 980 232 L 980 234 L 979 235 L 979 237 L 977 241 L 977 244 L 976 245 L 976 254 L 975 255 L 975 265 L 976 266 L 976 273 L 977 274 L 977 277 L 980 283 L 981 288 L 984 292 L 985 295 L 988 298 L 989 301 L 998 310 L 1001 311 L 1004 314 L 1007 315 L 1009 317 L 1013 319 L 1015 319 L 1018 321 L 1020 321 L 1024 323 L 1027 323 L 1028 324 L 1035 324 L 1036 325 L 1054 325 L 1055 324 L 1062 324 L 1063 323 L 1067 323 L 1068 322 L 1071 322 L 1077 319 L 1080 319 L 1087 315 L 1089 315 L 1093 313 L 1095 311 L 1098 310 L 1103 306 L 1106 305 L 1116 296 L 1117 296 L 1115 292 L 1113 290 L 1112 290 L 1111 288 L 1109 286 L 1108 286 L 1107 284 L 1100 278 L 1098 279 L 1090 286 L 1089 286 L 1086 289 L 1074 295 L 1072 295 L 1068 297 L 1065 297 L 1064 298 L 1061 298 L 1060 299 L 1041 299 L 1040 298 L 1037 298 L 1036 297 L 1031 296 L 1028 294 L 1026 294 L 1024 292 L 1020 290 L 1010 280 L 1008 275 L 1006 273 L 1005 271 L 1005 268 L 1004 267 L 1004 264 L 1003 263 L 1003 248 L 1004 247 L 1005 238 L 1008 233 L 1008 231 L 1010 227 L 1012 225 L 1013 222 L 1018 216 L 1018 215 L 1030 203 L 1031 203 L 1044 194 L 1046 194 L 1053 190 L 1056 190 L 1057 189 L 1060 189 L 1061 188 L 1064 188 L 1065 187 L 1071 187 L 1072 186 L 1076 186 L 1077 187 L 1083 187 L 1084 188 L 1087 188 L 1088 189 L 1090 189 L 1091 190 L 1096 191 L 1100 194 L 1103 195 L 1106 198 L 1107 198 L 1109 200 L 1109 201 L 1114 206 L 1114 207 L 1116 209 L 1118 213 L 1118 216 L 1120 220 L 1120 225 L 1116 227 L 1111 227 L 1110 228 L 1103 228 L 1102 229 L 1097 229 L 1096 230 L 1091 230 L 1090 231 L 1086 231 L 1085 232 L 1077 232 L 1076 233 L 1072 233 L 1071 234 L 1066 234 L 1065 235 L 1061 235 L 1060 236 L 1053 236 L 1052 237 L 1047 237 L 1047 240 L 1046 241 L 1046 243 L 1045 244 L 1045 247 L 1044 248 L 1044 250 L 1043 251 L 1043 254 L 1042 255 L 1042 260 L 1041 261 L 1041 263 L 1044 263 L 1045 262 L 1050 262 L 1051 261 L 1058 261 L 1059 260 L 1063 260 L 1064 259 L 1068 259 L 1069 258 L 1073 258 L 1074 257 L 1080 257 L 1081 256 L 1086 256 L 1087 255 L 1092 255 L 1093 254 L 1097 254 L 1098 253 L 1103 253 L 1104 252 L 1111 252 L 1112 251 L 1116 251 L 1117 250 L 1121 250 L 1122 249 L 1126 249 L 1127 248 L 1133 248 L 1134 247 L 1139 247 L 1140 246 L 1144 246 L 1146 243 L 1146 240 L 1147 239 L 1147 231 L 1148 230 L 1148 220 L 1147 219 L 1147 211 L 1146 210 L 1146 207 L 1144 204 L 1144 202 L 1143 201 L 1143 199 L 1141 195 L 1139 193 L 1138 190 L 1134 186 L 1133 183 L 1132 183 L 1129 180 Z
M 1779 171 L 1767 165 L 1765 165 L 1764 164 L 1762 164 L 1758 162 L 1755 162 L 1754 161 L 1747 161 L 1746 160 L 1729 160 L 1728 161 L 1722 161 L 1721 162 L 1718 162 L 1717 163 L 1715 163 L 1711 165 L 1707 165 L 1687 175 L 1685 177 L 1681 179 L 1672 187 L 1671 187 L 1661 197 L 1661 198 L 1657 202 L 1657 203 L 1652 209 L 1651 212 L 1649 214 L 1644 224 L 1643 229 L 1640 235 L 1640 238 L 1639 239 L 1639 244 L 1638 245 L 1638 250 L 1637 251 L 1637 267 L 1638 268 L 1638 273 L 1639 274 L 1639 278 L 1640 279 L 1640 282 L 1648 298 L 1652 302 L 1652 303 L 1655 306 L 1657 307 L 1657 308 L 1659 310 L 1660 310 L 1663 313 L 1669 316 L 1671 318 L 1673 319 L 1675 319 L 1676 320 L 1678 320 L 1684 323 L 1688 323 L 1689 324 L 1696 324 L 1697 325 L 1715 325 L 1716 324 L 1723 324 L 1724 323 L 1728 323 L 1729 322 L 1732 322 L 1738 319 L 1741 319 L 1748 315 L 1750 315 L 1754 313 L 1758 310 L 1759 311 L 1760 309 L 1761 309 L 1764 306 L 1765 306 L 1771 301 L 1772 301 L 1778 295 L 1761 278 L 1760 278 L 1756 282 L 1755 282 L 1751 286 L 1750 286 L 1745 290 L 1737 294 L 1732 295 L 1729 297 L 1726 297 L 1725 298 L 1721 298 L 1720 299 L 1703 299 L 1702 298 L 1698 298 L 1697 297 L 1692 296 L 1684 292 L 1682 290 L 1681 290 L 1673 282 L 1671 278 L 1668 275 L 1668 273 L 1667 272 L 1667 270 L 1666 269 L 1666 267 L 1664 263 L 1664 246 L 1665 245 L 1665 242 L 1666 241 L 1666 239 L 1668 235 L 1668 232 L 1670 228 L 1672 226 L 1673 224 L 1673 222 L 1680 214 L 1680 213 L 1690 203 L 1691 203 L 1694 200 L 1695 200 L 1700 196 L 1712 190 L 1715 190 L 1716 189 L 1718 189 L 1722 187 L 1725 187 L 1726 186 L 1744 186 L 1745 187 L 1747 187 L 1748 188 L 1750 188 L 1751 189 L 1756 190 L 1758 191 L 1761 194 L 1764 195 L 1773 204 L 1773 205 L 1777 210 L 1777 212 L 1778 213 L 1778 215 L 1780 219 L 1780 223 L 1781 225 L 1780 226 L 1775 226 L 1774 227 L 1768 227 L 1767 228 L 1759 228 L 1758 229 L 1753 229 L 1752 230 L 1747 230 L 1746 231 L 1742 231 L 1741 232 L 1733 232 L 1732 233 L 1727 233 L 1726 234 L 1722 234 L 1721 235 L 1717 235 L 1716 236 L 1709 236 L 1707 238 L 1707 241 L 1706 242 L 1706 246 L 1705 247 L 1705 250 L 1703 254 L 1703 258 L 1702 259 L 1702 262 L 1706 262 L 1707 261 L 1714 261 L 1715 260 L 1724 259 L 1725 258 L 1728 258 L 1729 257 L 1735 257 L 1736 256 L 1742 256 L 1743 255 L 1747 255 L 1748 254 L 1752 254 L 1753 253 L 1757 253 L 1758 252 L 1765 252 L 1766 251 L 1771 251 L 1772 250 L 1776 250 L 1777 249 L 1781 249 L 1782 248 L 1789 248 L 1790 247 L 1794 247 L 1795 246 L 1804 245 L 1805 243 L 1805 240 L 1806 239 L 1807 240 L 1807 243 L 1809 244 L 1809 241 L 1808 241 L 1806 238 L 1806 232 L 1807 231 L 1807 217 L 1806 216 L 1806 210 L 1805 209 L 1805 206 L 1802 200 L 1802 198 L 1800 194 L 1798 192 L 1797 189 L 1790 181 L 1790 180 L 1788 179 Z
M 714 187 L 712 189 L 712 190 L 708 193 L 708 194 L 704 198 L 704 199 L 700 203 L 700 204 L 695 210 L 695 212 L 693 214 L 690 220 L 690 222 L 686 229 L 686 233 L 684 237 L 684 240 L 683 241 L 683 245 L 682 246 L 682 268 L 683 269 L 683 273 L 684 274 L 684 276 L 686 280 L 686 283 L 692 295 L 699 303 L 699 304 L 701 306 L 702 306 L 704 308 L 704 309 L 707 310 L 711 314 L 716 316 L 718 318 L 720 319 L 722 319 L 725 321 L 730 322 L 731 323 L 734 323 L 735 324 L 740 324 L 741 325 L 749 325 L 750 326 L 759 326 L 760 325 L 767 325 L 768 324 L 775 324 L 776 323 L 780 323 L 788 319 L 791 319 L 792 318 L 794 318 L 798 315 L 800 315 L 810 309 L 812 310 L 812 313 L 811 314 L 811 319 L 810 320 L 809 325 L 836 325 L 839 319 L 839 316 L 840 315 L 840 310 L 841 309 L 841 307 L 842 306 L 842 303 L 844 299 L 844 295 L 845 294 L 846 287 L 847 286 L 847 284 L 849 280 L 849 275 L 850 274 L 850 271 L 851 270 L 851 268 L 853 264 L 854 255 L 855 254 L 855 252 L 856 251 L 856 248 L 857 247 L 857 244 L 858 243 L 858 217 L 857 216 L 857 212 L 854 206 L 853 201 L 851 197 L 849 195 L 849 193 L 846 190 L 844 186 L 835 177 L 834 177 L 831 174 L 830 174 L 825 170 L 823 170 L 814 165 L 811 165 L 808 163 L 805 163 L 804 162 L 800 162 L 799 161 L 793 161 L 792 160 L 773 160 L 772 161 L 765 161 L 764 162 L 757 163 L 753 165 L 750 165 L 743 169 L 741 169 L 735 172 L 733 174 L 730 175 L 728 177 L 724 179 L 715 187 Z
M 806 192 L 808 194 L 811 195 L 815 199 L 816 199 L 822 206 L 822 207 L 824 209 L 827 215 L 827 217 L 829 221 L 829 226 L 830 227 L 830 240 L 829 241 L 829 246 L 828 247 L 828 250 L 827 251 L 827 253 L 825 256 L 825 258 L 823 262 L 821 264 L 820 267 L 817 270 L 817 271 L 808 281 L 807 281 L 803 285 L 799 287 L 796 290 L 794 290 L 788 294 L 786 294 L 785 295 L 783 295 L 782 296 L 780 296 L 776 298 L 773 298 L 772 299 L 748 299 L 747 298 L 744 298 L 743 297 L 738 296 L 735 294 L 733 294 L 731 292 L 727 290 L 717 280 L 717 279 L 715 277 L 712 271 L 712 269 L 710 265 L 710 262 L 709 261 L 709 245 L 710 244 L 710 240 L 711 239 L 711 237 L 712 236 L 713 231 L 717 223 L 719 221 L 720 218 L 724 214 L 724 213 L 734 203 L 735 203 L 739 199 L 742 198 L 744 196 L 756 190 L 758 190 L 762 188 L 765 188 L 766 187 L 769 187 L 770 186 L 788 186 L 789 187 L 792 187 L 796 189 L 799 189 L 800 190 L 802 190 Z
M 1192 121 L 1190 122 L 1190 124 L 1189 125 L 1189 129 L 1188 130 L 1188 132 L 1186 136 L 1186 139 L 1185 140 L 1184 147 L 1183 148 L 1183 150 L 1181 154 L 1181 157 L 1180 158 L 1180 162 L 1179 163 L 1179 165 L 1178 166 L 1178 168 L 1176 172 L 1176 176 L 1175 177 L 1175 179 L 1173 183 L 1173 186 L 1172 187 L 1171 194 L 1170 195 L 1170 197 L 1168 201 L 1168 204 L 1167 205 L 1167 209 L 1166 210 L 1166 212 L 1164 216 L 1164 219 L 1163 220 L 1162 227 L 1160 231 L 1160 234 L 1159 235 L 1158 242 L 1157 243 L 1157 245 L 1155 249 L 1155 252 L 1154 253 L 1154 259 L 1153 260 L 1153 276 L 1154 277 L 1154 282 L 1155 283 L 1155 286 L 1158 292 L 1158 294 L 1161 298 L 1162 301 L 1173 313 L 1174 313 L 1182 319 L 1184 319 L 1189 322 L 1191 322 L 1195 324 L 1199 324 L 1200 325 L 1236 325 L 1236 323 L 1237 322 L 1237 319 L 1238 318 L 1238 315 L 1239 314 L 1239 311 L 1240 310 L 1240 307 L 1241 306 L 1241 303 L 1242 302 L 1242 300 L 1241 299 L 1209 299 L 1208 298 L 1205 298 L 1195 293 L 1187 285 L 1186 282 L 1183 278 L 1183 275 L 1182 274 L 1182 271 L 1181 270 L 1181 257 L 1182 256 L 1182 253 L 1183 252 L 1183 248 L 1184 247 L 1184 245 L 1186 241 L 1186 238 L 1187 237 L 1187 233 L 1188 232 L 1188 230 L 1189 229 L 1189 227 L 1191 223 L 1191 220 L 1192 219 L 1192 215 L 1193 214 L 1193 211 L 1195 207 L 1195 204 L 1196 203 L 1196 199 L 1197 198 L 1197 195 L 1198 194 L 1198 192 L 1200 190 L 1278 190 L 1279 189 L 1279 187 L 1281 183 L 1281 180 L 1282 179 L 1282 177 L 1283 176 L 1283 174 L 1285 170 L 1285 166 L 1286 165 L 1285 164 L 1269 164 L 1268 165 L 1239 165 L 1238 164 L 1221 164 L 1220 165 L 1210 165 L 1209 164 L 1207 164 L 1206 163 L 1207 162 L 1207 159 L 1209 155 L 1209 152 L 1210 151 L 1210 147 L 1211 146 L 1211 144 L 1213 140 L 1214 133 L 1216 129 L 1217 122 L 1216 121 Z
M 997 121 L 978 121 L 977 122 L 960 122 L 959 123 L 952 124 L 948 126 L 945 126 L 938 130 L 936 130 L 931 134 L 928 135 L 925 138 L 922 139 L 917 144 L 916 144 L 907 153 L 907 154 L 903 158 L 903 159 L 897 166 L 888 184 L 888 186 L 886 190 L 886 193 L 884 197 L 884 200 L 882 204 L 882 209 L 881 210 L 881 213 L 880 214 L 880 216 L 878 220 L 878 224 L 877 225 L 876 232 L 875 233 L 875 235 L 873 239 L 873 244 L 871 248 L 871 251 L 869 255 L 869 259 L 868 260 L 868 263 L 867 264 L 867 266 L 866 267 L 866 270 L 864 274 L 864 279 L 863 280 L 863 282 L 862 283 L 862 285 L 860 289 L 860 294 L 859 295 L 859 298 L 857 301 L 857 304 L 856 305 L 856 308 L 855 309 L 855 313 L 854 314 L 854 316 L 853 317 L 853 320 L 851 324 L 852 325 L 878 325 L 879 324 L 879 322 L 880 321 L 880 317 L 881 316 L 881 314 L 883 310 L 883 307 L 884 306 L 885 299 L 887 295 L 887 292 L 888 291 L 889 284 L 891 280 L 891 277 L 892 276 L 892 273 L 893 272 L 894 265 L 896 261 L 896 258 L 897 257 L 897 254 L 898 253 L 898 249 L 899 248 L 899 246 L 901 242 L 901 239 L 902 238 L 903 231 L 905 227 L 905 224 L 906 223 L 906 219 L 907 218 L 908 211 L 910 207 L 910 204 L 911 203 L 911 199 L 912 198 L 912 196 L 914 194 L 980 194 L 982 192 L 982 188 L 983 187 L 984 180 L 986 176 L 986 173 L 988 172 L 987 170 L 987 168 L 930 168 L 929 167 L 937 159 L 938 159 L 941 156 L 942 156 L 944 154 L 946 154 L 948 152 L 952 150 L 955 150 L 956 149 L 959 149 L 960 148 L 964 148 L 965 147 L 992 147 L 993 146 L 993 144 L 995 140 L 995 136 L 996 135 L 996 130 L 998 126 L 998 122 Z
M 1844 120 L 1842 124 L 1842 127 L 1841 128 L 1841 131 L 1840 132 L 1840 136 L 1839 137 L 1839 140 L 1838 141 L 1838 144 L 1837 145 L 1837 149 L 1835 153 L 1835 157 L 1834 158 L 1834 161 L 1832 165 L 1832 168 L 1831 169 L 1831 173 L 1830 174 L 1830 177 L 1828 181 L 1828 184 L 1827 185 L 1827 188 L 1826 189 L 1826 193 L 1824 197 L 1824 200 L 1823 201 L 1823 204 L 1822 205 L 1822 209 L 1821 210 L 1821 213 L 1820 214 L 1820 216 L 1819 217 L 1819 220 L 1818 221 L 1818 224 L 1817 225 L 1817 230 L 1815 234 L 1815 237 L 1813 241 L 1813 245 L 1812 246 L 1812 249 L 1811 250 L 1811 253 L 1810 254 L 1810 259 L 1809 260 L 1809 275 L 1810 276 L 1810 280 L 1811 281 L 1811 284 L 1812 285 L 1812 287 L 1813 288 L 1814 293 L 1817 297 L 1818 300 L 1821 303 L 1821 304 L 1831 314 L 1834 315 L 1839 319 L 1841 319 L 1849 323 L 1852 323 L 1853 324 L 1858 324 L 1859 325 L 1890 325 L 1891 324 L 1891 321 L 1892 320 L 1892 317 L 1893 316 L 1893 313 L 1894 312 L 1894 309 L 1895 308 L 1896 299 L 1865 299 L 1864 298 L 1861 298 L 1854 294 L 1852 294 L 1848 290 L 1847 290 L 1846 288 L 1842 284 L 1841 281 L 1839 279 L 1837 275 L 1837 270 L 1836 269 L 1836 258 L 1837 257 L 1837 250 L 1838 249 L 1838 246 L 1840 242 L 1840 239 L 1841 238 L 1841 235 L 1842 234 L 1842 230 L 1844 226 L 1844 223 L 1845 222 L 1845 219 L 1846 218 L 1846 214 L 1847 213 L 1847 210 L 1848 209 L 1848 207 L 1849 206 L 1849 203 L 1850 202 L 1850 199 L 1851 198 L 1851 193 L 1853 189 L 1924 189 L 1925 188 L 1925 185 L 1926 184 L 1926 180 L 1927 179 L 1927 176 L 1928 175 L 1928 172 L 1929 171 L 1930 164 L 1929 163 L 1860 163 L 1859 162 L 1860 161 L 1861 154 L 1862 153 L 1862 151 L 1863 150 L 1863 147 L 1864 146 L 1864 141 L 1865 140 L 1865 138 L 1866 137 L 1866 134 L 1868 130 L 1868 126 L 1869 125 L 1869 120 Z
M 675 120 L 575 120 L 574 121 L 567 121 L 566 122 L 563 122 L 562 123 L 559 123 L 558 124 L 556 124 L 555 125 L 550 126 L 538 132 L 536 134 L 532 136 L 528 140 L 527 140 L 526 142 L 522 145 L 522 146 L 518 150 L 516 154 L 513 157 L 513 159 L 508 168 L 508 173 L 507 174 L 507 177 L 506 178 L 506 194 L 507 195 L 508 202 L 510 205 L 510 207 L 512 209 L 514 214 L 517 217 L 517 218 L 520 221 L 521 221 L 522 223 L 523 223 L 529 228 L 533 230 L 535 230 L 538 232 L 543 233 L 544 234 L 551 234 L 552 235 L 615 235 L 616 234 L 618 234 L 619 235 L 624 235 L 625 236 L 627 236 L 635 240 L 641 247 L 643 251 L 643 253 L 644 254 L 644 267 L 643 268 L 643 271 L 642 272 L 642 274 L 641 276 L 639 278 L 637 282 L 630 289 L 629 289 L 627 291 L 626 291 L 622 294 L 620 294 L 616 296 L 613 296 L 612 297 L 487 297 L 485 299 L 485 302 L 483 306 L 483 310 L 482 311 L 482 314 L 481 315 L 481 319 L 480 320 L 480 325 L 607 325 L 608 324 L 614 324 L 615 323 L 619 323 L 627 319 L 630 319 L 634 317 L 636 315 L 638 315 L 640 313 L 641 313 L 649 306 L 650 306 L 653 303 L 654 301 L 655 301 L 655 300 L 662 292 L 662 290 L 664 288 L 667 282 L 667 280 L 668 279 L 668 277 L 670 273 L 670 270 L 671 269 L 671 248 L 670 247 L 670 244 L 669 243 L 668 238 L 665 232 L 662 229 L 661 226 L 655 220 L 654 220 L 648 215 L 640 211 L 638 211 L 637 210 L 633 210 L 632 209 L 627 209 L 626 208 L 553 208 L 552 207 L 550 207 L 544 204 L 537 197 L 535 193 L 534 188 L 533 187 L 533 180 L 534 179 L 534 176 L 537 170 L 537 168 L 539 166 L 539 165 L 549 155 L 554 153 L 558 150 L 561 150 L 562 149 L 565 149 L 566 148 L 570 148 L 571 147 L 670 147 L 671 146 L 671 141 L 672 140 L 672 137 L 674 133 L 674 129 L 675 128 L 675 124 L 676 123 L 676 121 Z
M 333 132 L 331 134 L 328 135 L 326 137 L 321 139 L 311 148 L 310 148 L 296 163 L 296 164 L 290 172 L 288 177 L 286 179 L 286 181 L 282 188 L 281 193 L 279 196 L 279 198 L 277 202 L 277 206 L 276 207 L 276 212 L 275 213 L 275 220 L 274 221 L 274 237 L 275 238 L 275 244 L 276 245 L 277 254 L 278 255 L 279 260 L 281 263 L 282 268 L 286 276 L 288 278 L 289 281 L 294 287 L 294 288 L 305 300 L 306 300 L 311 305 L 315 307 L 318 310 L 320 310 L 323 313 L 327 315 L 329 315 L 336 319 L 339 319 L 340 320 L 342 320 L 343 321 L 345 321 L 349 323 L 353 323 L 354 324 L 363 324 L 364 325 L 434 325 L 435 324 L 435 319 L 436 318 L 436 309 L 437 308 L 437 301 L 438 300 L 438 298 L 437 297 L 364 297 L 363 296 L 354 295 L 348 292 L 346 292 L 340 289 L 338 287 L 335 286 L 332 283 L 331 283 L 322 275 L 322 274 L 315 266 L 312 260 L 310 258 L 310 256 L 306 249 L 306 245 L 305 244 L 305 241 L 304 240 L 304 237 L 303 236 L 303 216 L 304 215 L 304 211 L 305 210 L 306 203 L 315 185 L 317 183 L 319 179 L 324 174 L 324 173 L 326 172 L 329 168 L 330 168 L 334 164 L 337 163 L 340 160 L 345 158 L 347 156 L 351 154 L 356 153 L 359 151 L 361 151 L 362 150 L 367 150 L 368 149 L 373 149 L 374 148 L 445 148 L 447 144 L 447 136 L 448 135 L 448 124 L 449 122 L 447 120 L 378 120 L 377 121 L 367 121 L 366 122 L 362 122 L 361 123 L 358 123 L 357 124 L 350 125 L 342 129 L 340 129 L 337 131 L 335 131 Z
M 181 132 L 179 134 L 174 136 L 172 138 L 168 140 L 165 143 L 164 143 L 159 148 L 158 148 L 156 150 L 156 151 L 154 152 L 152 154 L 152 155 L 147 160 L 147 161 L 143 165 L 143 166 L 139 171 L 138 174 L 136 176 L 130 188 L 130 190 L 129 191 L 129 193 L 128 194 L 128 196 L 126 200 L 126 203 L 125 204 L 125 208 L 124 209 L 124 213 L 123 214 L 123 222 L 122 223 L 122 232 L 123 233 L 123 241 L 124 242 L 124 246 L 125 247 L 125 252 L 126 253 L 126 256 L 129 262 L 130 267 L 135 277 L 137 279 L 138 282 L 144 289 L 144 290 L 156 302 L 157 302 L 160 305 L 164 307 L 167 310 L 167 311 L 169 310 L 174 314 L 176 315 L 178 315 L 185 319 L 188 319 L 189 320 L 191 320 L 195 322 L 198 322 L 199 323 L 204 323 L 205 324 L 214 324 L 215 325 L 286 325 L 287 324 L 287 319 L 288 318 L 288 302 L 289 301 L 289 298 L 288 297 L 214 297 L 213 296 L 208 296 L 207 295 L 200 294 L 195 291 L 193 291 L 189 289 L 187 287 L 184 286 L 178 281 L 177 281 L 168 272 L 168 271 L 164 267 L 163 264 L 159 259 L 159 257 L 155 250 L 155 248 L 154 247 L 154 243 L 152 239 L 152 233 L 151 232 L 151 221 L 152 220 L 152 214 L 153 213 L 153 210 L 154 209 L 154 205 L 157 199 L 157 197 L 159 194 L 159 192 L 163 187 L 163 185 L 167 181 L 168 178 L 170 177 L 171 175 L 184 163 L 185 163 L 190 159 L 200 154 L 202 154 L 205 152 L 207 152 L 210 150 L 215 150 L 216 149 L 222 149 L 223 148 L 295 148 L 296 147 L 296 140 L 297 139 L 297 128 L 298 127 L 298 121 L 297 120 L 227 120 L 226 121 L 215 121 L 214 122 L 209 122 L 208 123 L 205 123 L 201 125 L 198 125 L 197 126 L 192 127 L 185 131 L 183 131 Z
M 1506 121 L 1499 127 L 1497 131 L 1497 138 L 1496 139 L 1496 143 L 1495 144 L 1495 147 L 1494 148 L 1494 151 L 1493 152 L 1493 155 L 1492 156 L 1491 163 L 1489 167 L 1489 170 L 1488 171 L 1488 175 L 1487 176 L 1487 179 L 1485 183 L 1485 186 L 1484 187 L 1484 190 L 1483 191 L 1483 195 L 1482 196 L 1482 199 L 1481 200 L 1481 202 L 1480 203 L 1480 206 L 1479 207 L 1479 212 L 1478 213 L 1478 216 L 1476 220 L 1476 223 L 1475 224 L 1475 227 L 1474 228 L 1474 232 L 1473 233 L 1472 240 L 1470 244 L 1470 249 L 1469 250 L 1468 257 L 1466 261 L 1466 265 L 1465 266 L 1465 270 L 1464 271 L 1464 274 L 1463 275 L 1463 277 L 1462 278 L 1462 281 L 1461 282 L 1461 287 L 1460 288 L 1460 290 L 1459 291 L 1459 294 L 1457 298 L 1456 307 L 1455 308 L 1455 311 L 1454 312 L 1454 314 L 1453 315 L 1453 318 L 1452 319 L 1452 325 L 1478 325 L 1479 324 L 1479 321 L 1481 317 L 1481 312 L 1482 311 L 1482 308 L 1483 307 L 1483 304 L 1484 303 L 1484 300 L 1485 299 L 1485 296 L 1486 295 L 1486 290 L 1488 286 L 1488 283 L 1489 282 L 1489 279 L 1490 278 L 1490 274 L 1491 273 L 1491 270 L 1492 269 L 1492 267 L 1493 266 L 1493 263 L 1494 262 L 1495 253 L 1496 252 L 1496 249 L 1497 248 L 1497 245 L 1498 244 L 1498 241 L 1499 240 L 1499 235 L 1500 234 L 1500 232 L 1502 228 L 1502 225 L 1503 224 L 1503 220 L 1504 219 L 1504 216 L 1506 212 L 1506 209 L 1507 208 L 1507 205 L 1508 204 L 1508 199 L 1509 198 L 1509 195 L 1511 191 L 1511 188 L 1512 187 L 1512 183 L 1513 182 L 1513 179 L 1515 175 L 1516 168 L 1517 167 L 1519 169 L 1519 171 L 1520 172 L 1521 170 L 1521 167 L 1519 165 L 1518 167 L 1517 166 L 1518 159 L 1520 156 L 1522 159 L 1522 162 L 1523 163 L 1524 170 L 1525 171 L 1525 173 L 1527 177 L 1527 180 L 1528 181 L 1528 183 L 1530 187 L 1530 190 L 1532 194 L 1532 197 L 1533 198 L 1533 200 L 1534 201 L 1534 203 L 1536 207 L 1536 211 L 1537 212 L 1537 215 L 1538 216 L 1538 218 L 1539 219 L 1539 221 L 1541 225 L 1541 229 L 1542 230 L 1542 232 L 1543 233 L 1543 235 L 1545 239 L 1546 246 L 1547 247 L 1547 249 L 1548 250 L 1548 252 L 1550 256 L 1550 261 L 1551 262 L 1551 264 L 1552 265 L 1552 267 L 1554 271 L 1555 278 L 1556 279 L 1556 281 L 1558 285 L 1558 288 L 1559 289 L 1560 296 L 1561 297 L 1561 299 L 1563 303 L 1563 307 L 1564 308 L 1564 310 L 1566 314 L 1568 316 L 1568 317 L 1570 319 L 1571 319 L 1573 321 L 1577 323 L 1579 323 L 1580 324 L 1595 324 L 1596 323 L 1598 323 L 1606 318 L 1610 310 L 1610 306 L 1612 302 L 1612 299 L 1613 298 L 1613 296 L 1614 295 L 1614 292 L 1615 291 L 1615 287 L 1616 286 L 1616 284 L 1617 283 L 1617 280 L 1619 276 L 1619 272 L 1620 271 L 1620 269 L 1621 268 L 1621 265 L 1623 261 L 1623 258 L 1624 257 L 1624 253 L 1625 252 L 1625 250 L 1627 246 L 1627 243 L 1628 242 L 1628 238 L 1629 237 L 1629 235 L 1631 231 L 1631 228 L 1632 227 L 1632 223 L 1633 222 L 1633 220 L 1634 219 L 1634 216 L 1635 215 L 1635 213 L 1637 209 L 1637 205 L 1638 204 L 1638 202 L 1639 201 L 1639 198 L 1641 194 L 1641 190 L 1642 189 L 1642 186 L 1643 185 L 1643 183 L 1645 179 L 1646 172 L 1647 171 L 1647 169 L 1648 168 L 1648 165 L 1650 161 L 1650 157 L 1651 156 L 1651 154 L 1652 153 L 1652 151 L 1654 147 L 1654 144 L 1655 143 L 1655 139 L 1656 138 L 1656 136 L 1657 135 L 1657 133 L 1659 129 L 1659 125 L 1661 122 L 1661 120 L 1660 119 L 1635 119 L 1632 123 L 1632 125 L 1631 126 L 1631 129 L 1630 130 L 1630 134 L 1629 135 L 1629 137 L 1627 141 L 1627 144 L 1626 145 L 1626 149 L 1625 150 L 1625 152 L 1624 153 L 1624 155 L 1622 159 L 1622 162 L 1621 163 L 1621 167 L 1620 168 L 1620 170 L 1618 174 L 1618 177 L 1617 178 L 1617 182 L 1616 183 L 1616 185 L 1614 189 L 1614 192 L 1612 196 L 1612 200 L 1611 201 L 1611 203 L 1610 204 L 1610 207 L 1608 211 L 1608 215 L 1606 219 L 1606 222 L 1604 226 L 1604 229 L 1603 230 L 1602 237 L 1600 241 L 1600 244 L 1599 245 L 1599 249 L 1598 250 L 1598 253 L 1597 254 L 1597 256 L 1595 260 L 1595 264 L 1594 265 L 1594 268 L 1592 272 L 1592 275 L 1590 278 L 1588 274 L 1587 274 L 1587 277 L 1590 281 L 1590 284 L 1588 288 L 1586 287 L 1586 285 L 1585 284 L 1585 281 L 1583 277 L 1583 273 L 1582 272 L 1582 270 L 1581 269 L 1581 267 L 1579 263 L 1579 260 L 1578 259 L 1578 256 L 1577 255 L 1577 253 L 1575 249 L 1575 246 L 1574 245 L 1573 238 L 1572 237 L 1572 235 L 1570 231 L 1569 224 L 1568 223 L 1568 221 L 1566 217 L 1565 210 L 1564 209 L 1564 207 L 1562 203 L 1562 200 L 1561 199 L 1560 192 L 1559 191 L 1559 189 L 1557 185 L 1557 182 L 1556 181 L 1556 179 L 1555 178 L 1555 176 L 1553 172 L 1552 165 L 1550 161 L 1550 158 L 1548 154 L 1548 151 L 1547 150 L 1547 147 L 1545 143 L 1545 140 L 1544 139 L 1543 134 L 1541 130 L 1534 123 L 1530 121 L 1528 121 L 1524 119 L 1513 119 L 1512 120 L 1509 120 L 1508 121 Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
</svg>
</a></h1>
      </div>
      <nav class="sidenav" aria-label="Sections">
        <a href="#overview" data-nav="overview" title="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg><span class="sr-only-collapse">Overview</span></a>
        <a href="#activity" data-nav="activity" title="Activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"></path></svg><span class="sr-only-collapse">Activity</span></a>
        <a href="#policy" data-nav="policy" title="Policy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z"></path></svg><span class="sr-only-collapse">Policy</span></a>
        <a href="#rules" data-nav="rules" title="Rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 12h6M9 16h4"></path></svg><span class="sr-only-collapse">Rules</span></a>
        <a href="#integrations" data-nav="integrations" title="Integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5"></path></svg><span class="sr-only-collapse">Integrations</span></a>
        <a href="#settings" data-nav="settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"></path><circle cx="16" cy="8" r="2.2"></circle><circle cx="8" cy="16" r="2.2"></circle></svg><span class="sr-only-collapse">Settings</span></a>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-links">
          <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
          <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
        </div>
      </div>
    </aside>
    <div class="content">
      <header class="topbar" id="topbar">
        <div class="topbar-row">
          <h2 class="topbar-title" id="topbar-title">Overview</h2>
          <label class="view-search topbar-search" data-search-view="activity" hidden>
            <span class="sr-only">Filter activity</span>
            <input type="search" id="activity-search" autocomplete="off" placeholder="Filter by rule or command">
          </label>
          <label class="view-search topbar-search" data-search-view="policy" hidden>
            <span class="sr-only">Search all protections</span>
            <input type="search" id="policy-search" autocomplete="off" placeholder="Filter by name, category, or rule ID">
          </label>
          <div class="topbar-actions">
            <div class="app-status" id="app-status" role="status" aria-live="polite">Loading...</div>
            <button type="button" class="dirty-chip" id="dirty-chip" hidden>Unsaved policy changes · Review</button>
          </div>
        </div>
      </header>
      <main>
        <div class="protection-banner" id="protection-banner" role="alert" hidden></div>
        <div class="status" id="status" role="status" aria-live="polite"></div>

        <section class="view" data-view="overview">
          <div class="view-head">
            <p class="panel-sub muted">What CC Safety Net has been doing on this machine.</p>
          </div>
          <div class="status health-strip" id="health-strip" hidden></div>
          <p class="tiles-window" id="overview-window"></p>
          <div class="tiles" id="overview-tiles"></div>
          <div class="star-row" id="star-row" hidden>
            <p class="star-pitch"><span id="star-pitch-text"></span> <span class="star-mechanism" id="star-mechanism" hidden>One click via your GitHub CLI. No redirect.</span></p>
            <span id="star-slot"></span>
          </div>
          <section class="panel" id="protection-card" hidden></section>
          <div class="dual-panels">
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked commands</h2>
                </div>
              </div>
              <div id="top-commands"></div>
            </section>
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked rules</h2>
                </div>
              </div>
              <div id="top-rules"></div>
            </section>
          </div>
          <button type="button" class="guard-errors" id="guard-errors" hidden></button>
        </section>

        <section class="view" data-view="activity" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Audited commands from the local log, newest first. Commands are secret-redacted at write time.</p>
          </div>
          <section class="panel">
            <div class="activity-controls">
              <div class="activity-controls-row">
                <label class="activity-days"><span>Window</span>
                  <select id="activity-days"></select>
                </label>
                <button type="button" class="icon-button activity-refresh" id="activity-refresh" aria-label="Refresh activity" title="Refresh activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
              </div>
              <div class="chip-row" id="activity-decision" role="group" aria-label="Filter by decision"></div>
              <div class="chip-row" id="activity-agents" role="group" aria-label="Filter by agent"></div>
              <div class="chip-row" id="activity-command-filter"></div>
            </div>
            <div id="activity-feed"></div>
            <p class="muted activity-count" id="activity-count"></p>
          </section>
        </section>

        <section class="view" data-view="policy" hidden>
          <div class="view-head view-head-actions">
            <p class="panel-sub muted">Choose what CC Safety Net blocks. Changes apply after you save.</p>
            <button type="button" id="project-draft-enter">Draft project policy</button>
          </div>
          <div class="project-draft-bar" id="project-draft-bar" hidden>
            <div class="project-draft-target">
              <strong>Project policy draft</strong>
              <code id="project-draft-path"></code>
              <p class="muted">Only the fields you mark are written here; everything else keeps inheriting from each member's own policy.</p>
            </div>
            <div class="savebar-actions">
              <button type="button" id="project-draft-change" hidden>Change…</button>
              <button type="button" id="project-draft-exit">Exit draft</button>
            </div>
          </div>
          <p class="status error" id="project-draft-diagnostics" hidden></p>
          <div class="policy-savebar" id="policy-savebar" hidden><span>Unsaved changes</span><div class="savebar-actions"><button type="button" id="discard-changes">Discard</button><button class="primary" id="save">Save</button></div></div>
          <div class="recovery" id="recovery" hidden>
            <div>
              <strong>Policy repair available</strong>
              <p class="muted">Repair writes canonical JSON by preserving valid settings. If the JSON cannot be parsed, defaults are restored.</p>
            </div>
            <button class="primary" id="repair" type="button">Repair</button>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2 id="tester-label">Test a command</h2>
                <p class="panel-sub muted">Paste a shell command to see whether it is blocked under your current unsaved edits. Custom rulebook rules are enforced here too.</p>
              </div>
            </div>
            <div class="tester-row">
              <input type="text" id="tester-input" autocomplete="off" spellcheck="false" placeholder="Paste a shell command and press Enter" aria-labelledby="tester-label">
              <button type="button" id="tester-run">Test</button>
            </div>
            <div id="tester-result" class="status" hidden></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Safety preset</h2>
                <p class="panel-sub muted">Choose inherited protection defaults, then customize only what this workspace needs.</p>
              </div>
            </div>
            <div id="safety-preset-status" class="preset-status"></div>
            <div id="environment-overrides" class="status" hidden></div>
            <div class="grid" id="safety-level"></div>
            <div class="field field-toggle">
              <button class="panel-toggle" type="button" aria-expanded="false" aria-controls="safety-overrides-content"><span class="panel-chevron" aria-hidden="true"></span><span>Advanced overrides</span></button>
            </div>
            <div class="foldable-field-content" id="safety-overrides-content" hidden>
              <p class="muted">Inherit from the selected level unless a capability needs an explicit exception.</p>
              <div class="grid" id="safety-overrides"></div>
            </div>
            <div class="field">
              <span>Workflow</span>
              <small>Workflow exceptions are separate from safety level.</small>
            </div>
            <div class="grid" id="workflow"></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Destructive Command Protection</h2>
                <p class="panel-sub muted" id="destructive-command-summary"></p>
              </div>
              <button type="button" id="reset-rule-customizations" class="panel-head-action">Restore defaults</button>
            </div>
            <div id="destructive-command"></div>
          </section>
          <section class="panel">
            <header class="panel-head">
              <div class="panel-title">
                <h2>Secret Protection</h2>
                <p class="panel-sub muted" id="secret-summary">Default sensitive paths and coding CLI credential locations can be disabled individually. Deny paths are blocked while Secret protection is on.</p>
              </div>
              <button type="button" id="reset-secret-customizations" class="panel-head-action">Restore defaults</button>
            </header>
            <div id="secret"></div>
          </section>
          <section class="panel">
            <div class="panel-head raw-json-head">
              <div class="panel-title">
                <h2>Policy JSON</h2>
                <p class="panel-sub muted" id="raw-source">Read-only mirror of the policy controls.</p>
              </div>
              <button class="icon-button" id="raw-copy" type="button" aria-label="Copy raw JSON to clipboard"></button>
            </div>
            <textarea id="raw" aria-label="Raw policy JSON" aria-describedby="raw-source" readonly></textarea>
          </section>
        </section>

        <section class="view" data-view="rules" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Custom rulebook rules enforced on this machine, and a prompt to hand rule authoring to your coding agent.</p>
          </div>
          <section class="panel" id="rules-composer-panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Create a rule</h2>
                <p class="panel-sub muted">CC Safety Net never writes rulebooks from here. Copy the prompt and paste it into your coding agent.</p>
              </div>
            </div>
            <div class="field">
              <span>Scope</span>
              <div class="chip-row" role="group" aria-label="Rule scope">
                <button type="button" class="chip" data-rules-scope="project" aria-pressed="true">Project</button>
                <button type="button" class="chip" data-rules-scope="user" aria-pressed="false">All projects</button>
              </div>
            </div>
            <div class="field" id="rules-project-path-field">
              <span id="rules-project-path-label">Project path</span>
              <div class="rules-path-row">
                <input type="text" id="rules-project-path" spellcheck="false" autocomplete="off" aria-labelledby="rules-project-path-label" aria-describedby="rules-project-path-hint">
                <button type="button" id="rules-choose-directory" hidden>Choose…</button>
              </div>
              <small id="rules-project-path-hint">Where the rulebook is written. Defaults to the directory this GUI was launched from.</small>
            </div>
            <div class="field">
              <span id="rules-composer-label">Request</span>
              <textarea id="rules-composer-input" spellcheck="false" placeholder="Describe the custom rules you want..." aria-labelledby="rules-composer-label" aria-describedby="rules-composer-hint"></textarea>
              <small id="rules-composer-hint">Rules match a command, its subcommand path, and exact arguments - not file paths or patterns.</small>
            </div>
            <div class="field">
              <span>Examples</span>
              <div class="chip-row">
                <button type="button" class="chip" data-rules-example="read my package.json and suggest blocking rules">Suggest rules</button>
                <button type="button" class="chip" data-rules-example="set up rules to block all terraform destroy commands">Block a command</button>
                <button type="button" class="chip" data-rules-example="verify my rules and fix any errors">Verify rules</button>
              </div>
            </div>
            <div class="rules-composer-actions">
              <button type="button" class="primary" id="rules-copy-prompt">Copy prompt</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Rulebooks</h2>
                <p class="panel-sub muted">Read-only. Rules are shown as enforced, after overrides.</p>
              </div>
              <button type="button" class="icon-button rules-refresh" id="rules-refresh" aria-label="Refresh rules" title="Refresh rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="rules-list"><p class="empty">Loading rules…</p></div>
          </section>
          <section class="panel" id="rules-diagnostics-panel" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>Diagnostics</h2>
                <p class="panel-sub muted">Errors mean a rulebook was dropped and its rules are not enforced.</p>
              </div>
            </div>
            <div id="rules-diagnostics"></div>
          </section>
        </section>

        <section class="view" data-view="settings" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Appearance, file locations, and maintenance.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Appearance</h2>
                <p class="panel-sub muted">Theme preference is stored in this browser.</p>
              </div>
              <button type="button" id="theme-toggle"></button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Files</h2>
                <p class="panel-sub muted">Where CC Safety Net reads and writes on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>Policy file</span><code id="policy-path"></code></div>
              <div class="info-row" id="project-policy-row" hidden><span>Project policy</span><code id="project-policy-path"></code></div>
              <div class="info-row"><span>Audit logs</span><code id="logs-path"></code></div>
            </div>
            <p class="status" id="project-policy-notice" hidden></p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Audit log retention</h2>
                <p class="panel-sub muted">How long decisions are kept before the sweep deletes them. Every analyzed command is recorded, so a long window grows the log.</p>
              </div>
            </div>
            <label class="retention-row">
              <span>Keep for</span>
              <input type="number" id="retention-days" min="1" max="365" step="1" inputmode="numeric" aria-describedby="retention-note">
              <span id="retention-unit">days</span>
            </label>
            <p class="muted retention-note" id="retention-note"></p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Version</h2>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><code id="app-version"></code></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Danger zone</h2>
                <p class="panel-sub muted">Actions that discard saved configuration.</p>
              </div>
            </div>
            <div class="danger-row">
              <div>
                <strong>Reset policy</strong>
                <p class="muted">Restore the default policy JSON at the configured path.</p>
              </div>
              <button class="danger" id="reset">Reset</button>
            </div>
          </section>
        </section>

        <section class="view" data-view="integrations" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Install or remove the cc-safety-net hook for each coding agent on this machine.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Agents</h2>
                <p class="panel-sub muted">Detected CLIs and hook status.</p>
              </div>
              <button type="button" class="icon-button integrations-refresh" id="integrations-refresh" aria-label="Refresh integrations" title="Refresh integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="integrations-list"><p class="empty">Checking integrations…</p></div>
          </section>
          <section class="panel" id="integrations-system" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>System</h2>
                <p class="panel-sub muted">Runtime detected on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>cc-safety-net</span><code id="integrations-pkg-version"></code></div>
              <div class="info-row"><span>Node.js</span><code id="integrations-node-version"></code></div>
              <div class="info-row"><span>Platform</span><code id="integrations-platform"></code></div>
            </div>
          </section>
        </section>
      </main>
      <footer class="app-foot">
        <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
        <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
      </footer>
    </div>
  </div>
  <div class="rule-example-popover" id="rule-example-popover" popover="auto" role="dialog" aria-labelledby="rule-example-title" aria-describedby="rule-example-command">
    <span class="rule-example-label" id="rule-example-label">Blocked command example</span>
    <strong id="rule-example-title"></strong>
    <code id="rule-example-command"></code>
  </div>
  <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body confirm-dialog-detail">
    <form method="dialog">
      <h2 id="confirm-dialog-title"></h2>
      <p class="muted" id="confirm-dialog-body"></p>
      <div class="dialog-rows" id="confirm-dialog-rows" hidden></div>
      <p class="dialog-detail"><code id="confirm-dialog-detail"></code></p>
      <div class="dialog-actions">
        <button type="submit" id="confirm-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="danger" id="confirm-dialog-confirm" value="confirm"></button>
      </div>
    </form>
  </dialog>
  <dialog class="confirm-dialog report-dialog" id="report-dialog" aria-labelledby="report-dialog-title" aria-describedby="report-dialog-body">
    <form method="dialog">
      <h2 id="report-dialog-title">Report false positive</h2>
      <p class="muted" id="report-dialog-body">This opens a prefilled GitHub issue form — it is public, and nothing is submitted until you submit it there. Paths were replaced with <code>&lt;project&gt;</code> and <code>~</code>; edit anything else you would rather not publish.</p>
      <label class="report-field"><span>Blocked command</span><textarea id="report-command" spellcheck="false"></textarea></label>
      <label class="report-field"><span>Audit log entry</span><textarea id="report-entry" spellcheck="false"></textarea></label>
      <div class="dialog-actions">
        <button type="submit" id="report-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="primary" id="report-dialog-open" value="report">Open GitHub form</button>
      </div>
    </form>
  </dialog>
  <script id="ccsn-data" type="application/json"></script>
  <script>
// src/audit/display.ts
var formatRelativeTime = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff))
    return "";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return \`\${days}d ago\`;
  if (hours > 0)
    return \`\${hours}h ago\`;
  if (minutes > 0)
    return \`\${minutes}m ago\`;
  return "just now";
};
var commandSignature = (source) => {
  const tokens = (source ?? "").trim().split(/\\s+/).filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split("/").pop();
  if (!binary)
    return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? \`\${binary} \${next}\` : binary;
};

// src/core/policy/safety-level.ts
var SAFETY_LEVEL_CAPABILITIES = {
  standard: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
  strict: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: false },
  paranoid: { fail_closed: true, paranoid_rm: true, paranoid_interpreters: true }
};

// src/hosts/catalog.ts
var catalog = [
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    doctorOrder: 3,
    runtime: {
      order: 1,
      flags: ["-ac", "--agy-cli"],
      description: "Run as Antigravity CLI PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 2,
      flag: "--agy-cli",
      artifactKind: "hook config",
      probeCommand: ["agy", "--version"]
    }
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: "Coding CLI",
      flags: ["-cc", "--coding-cli"],
      legacyFlags: ["--claude-code"],
      description: "Run as Coding CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cc", "--claude-code"]
    },
    install: {
      order: 3,
      flag: "--claude-code",
      artifactKind: "plugin",
      probeCommand: ["claude", "--version"]
    }
  },
  {
    id: "codex",
    displayName: "Codex",
    doctorOrder: 4,
    runtime: {
      order: 3,
      flags: ["-cx", "--codex"],
      description: "Run as a Codex PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 4,
      flag: "--codex",
      artifactKind: "plugin",
      probeCommand: ["codex", "--version"]
    }
  },
  {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    doctorOrder: 7,
    runtime: {
      order: 6,
      flags: ["-cp", "--copilot-cli"],
      description: "Run as GitHub Copilot CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cp", "--copilot-cli"]
    },
    install: {
      order: 7,
      flag: "--copilot-cli",
      artifactKind: "plugin",
      probeCommand: ["copilot", "--binary-version"]
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    doctorOrder: 6,
    runtime: {
      order: 5,
      flags: ["-gc", "--gemini-cli"],
      description: "Run as Gemini CLI BeforeTool hook",
      legacyTopLevelFlags: ["-gc", "--gemini-cli"]
    },
    install: {
      order: 6,
      flag: "--gemini-cli",
      artifactKind: "extension",
      probeCommand: ["gemini", "--version"]
    }
  },
  {
    id: "grok-build",
    displayName: "Grok Build",
    doctorOrder: 8,
    runtime: {
      order: 7,
      flags: ["-gb", "--grok-build"],
      description: "Run as Grok Build PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 8,
      flag: "--grok-build",
      artifactKind: "hook config",
      probeCommand: ["grok", "--version"]
    }
  },
  {
    id: "hermes-agent",
    displayName: "Hermes Agent",
    doctorOrder: 9,
    runtime: {
      order: 8,
      flags: ["-ha", "--hermes-agent"],
      description: "Run as Hermes Agent pre_tool_call hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 9,
      flag: "--hermes-agent",
      artifactKind: "plugin",
      probeCommand: ["hermes", "--version"]
    }
  },
  {
    id: "kimi-code",
    displayName: "Kimi Code",
    doctorOrder: 10,
    runtime: {
      order: 9,
      flags: ["-kc", "--kimi-code"],
      description: "Run as Kimi Code PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 10,
      flag: "--kimi-code",
      artifactKind: "hook config",
      probeCommand: ["kimi", "--version"]
    }
  },
  {
    id: "openclaw",
    displayName: "OpenClaw",
    doctorOrder: 11,
    install: {
      order: 11,
      flag: "--openclaw",
      artifactKind: "plugin",
      probeCommand: ["openclaw", "--version"]
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    doctorOrder: 12,
    install: {
      order: 12,
      flag: "--opencode",
      artifactKind: "plugin",
      probeCommand: ["opencode", "--version"]
    }
  },
  {
    id: "pi",
    displayName: "Pi",
    doctorOrder: 13,
    install: {
      order: 13,
      flag: "--pi",
      artifactKind: "package",
      probeCommand: ["pi", "--version"]
    }
  },
  {
    id: "cursor",
    displayName: "Cursor",
    doctorOrder: 5,
    runtime: {
      order: 4,
      flags: ["-cu", "--cursor"],
      description: "Run as Cursor preToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 5,
      flag: "--cursor",
      artifactKind: "hook config",
      probeCommand: ["cursor", "--version"]
    }
  },
  {
    id: "amp",
    displayName: "Amp Code",
    doctorOrder: 2,
    install: {
      order: 1,
      flag: "--amp",
      artifactKind: "plugin",
      probeCommand: ["amp", "--version"]
    }
  }
];
var doctorIntegrationOrder = catalog.slice().sort((a, b) => a.doctorOrder - b.doctorOrder).map((integration) => integration.id);
var runtimeHookIntegrationMetadata = catalog.filter((integration) => ("runtime" in integration)).slice().sort((a, b) => a.runtime.order - b.runtime.order).map((integration) => ({
  id: integration.id,
  displayName: "displayName" in integration.runtime ? integration.runtime.displayName : integration.displayName,
  flags: integration.runtime.flags,
  legacyFlags: "legacyFlags" in integration.runtime ? integration.runtime.legacyFlags : [],
  description: integration.runtime.description,
  legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags
}));
var installIntegrationMetadata = catalog.slice().sort((a, b) => a.install.order - b.install.order).map((integration) => ({ id: integration.id, ...integration.install })).map(({ order: _, ...integration }) => integration);
var integrationDisplayNames = Object.fromEntries(catalog.map((integration) => [integration.id, integration.displayName]));

// src/gui/frontend/main.ts
var token = JSON.parse(document.getElementById("ccsn-data").textContent).token;
var fallbackRepoUrl = "https://github.com/kenryu42/cc-safety-net";
var safetyLevels = {
  standard: [
    "Standard",
    "Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding."
  ],
  strict: [
    "Strict",
    "Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell."
  ],
  paranoid: [
    "Paranoid",
    "Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos."
  ]
};
var safetyOverrides = {
  fail_closed: ["Fail closed", "Block commands the parser cannot fully understand."],
  paranoid_rm: ["Paranoid rm -rf checks", "Block non-temp rm -rf inside the project."],
  paranoid_interpreters: ["Paranoid interpreters", "Block interpreter one-liners."]
};
var rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
};
var starIcons = {
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>'
};
var reportIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg>';
var pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>'
};
var state;
var draftPolicy;
var projectDraft = null;
var markedFields = new Set;
var preview;
var previewRequestId = 0;
var dirty = false;
var searchActive = false;
var OVERVIEW_DAYS = 7;
var DEFAULT_RETENTION_DAYS = 30;
var MAX_RETENTION_DAYS = 365;
var overview = null;
var activity = null;
var knownRuleIds = new Set;
var activityFilters = { days: 7, decision: "all", agent: "all", query: "", command: "" };
var tierExpanded = new Map([
  ["enforced", false],
  ["normal", false],
  ["strict", false],
  ["paranoid", false]
]);
var searchCollapsedTiers = new Set;
var secretGroupExpanded = new Map;
var searchCollapsedSecretGroups = new Set;
var rawCopyResetTimer = null;
var feedCopyResetTimer = null;
var activityQueryTimer;
var renderedFeedEntries = [];
var suspects = new Set;
var activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
var integrations = null;
var integrationsRequested = false;
var integrationBusy = new Set;
var rulesData = null;
var rulesRequested = false;
var rulesScope = "project";
var pendingRuleFocus = null;
var directoryPickerFailed = false;
var api = (path, init = {}) => fetch(\`\${path}\${path.includes("?") ? "&" : "?"}token=\${encodeURIComponent(token)}\`, {
  ...init,
  headers: {
    "content-type": "application/json",
    "x-cc-safety-net-token": token,
    ...init.headers || {}
  }
});
var requestJson = async (path, init) => {
  try {
    const response = await api(path, init);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : {},
      error: undefined
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var errorText = (result) => result.error ?? (Array.isArray(result.data?.errors) && result.data.errors.length ? result.data.errors.join(\`
\`) : null) ?? result.data?.error ?? \`Request failed (status \${result.status}).\`;
var isWriteSuccess = (result) => result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
var qs = (id) => document.getElementById(id);
var setDetailStatus = (text, kind = "") => {
  qs("status").textContent = text;
  qs("status").className = \`status \${kind}\`;
};
var appStatusTimer;
var setAppStatus = (text, kind = "") => {
  qs("app-status").textContent = text;
  qs("app-status").className = \`app-status \${kind}\`;
  clearTimeout(appStatusTimer);
  if (kind === "ok")
    appStatusTimer = setTimeout(() => setAppStatus(""), 4000);
};
var busy = false;
var updateActions = () => {
  const hasErrors = (state?.errors.length ?? 0) > 0;
  qs("save").disabled = busy || !state || hasErrors;
  qs("reset").disabled = busy || !state;
  qs("repair").disabled = busy || !hasErrors;
};
var runExclusive = async (pendingText, fn) => {
  if (busy)
    return;
  busy = true;
  updateActions();
  setAppStatus(pendingText);
  setDetailStatus("");
  try {
    await fn();
  } finally {
    busy = false;
    updateActions();
  }
};
var checkbox = (checked) => checked ? "checked" : "";
var dayCount = (days) => \`\${days} day\${days === 1 ? "" : "s"}\`;
var syncMasterBadges = () => {
  document.querySelectorAll("label.row.master input").forEach((input) => {
    const badge = input.closest("label")?.querySelector(".master-badge");
    if (badge)
      badge.textContent = input.checked ? "On" : "Off";
  });
};
var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char] ?? char);
var clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
var pathLines = (value) => value.split(\`
\`).map((line) => line.trim()).filter(Boolean);
var formatPolicy = (policy) => \`\${JSON.stringify(policy, null, 2)}
\`;
var markedOverrides = (marked, section, overrides) => Object.fromEntries(Object.entries(overrides).filter(([key, value]) => value !== undefined && marked.has(\`\${section}.overrides.\${key}\`)));
var withOverrides = (overrides) => Object.keys(overrides).length > 0 ? { overrides } : {};
var collectProjectProposal = (marked, policy) => {
  const sections = {
    safety: {
      ...marked.has("safety.level") ? { level: policy.safety.level } : {},
      ...withOverrides(markedOverrides(marked, "safety", policy.safety.overrides))
    },
    workflow: marked.has("workflow.worktree_mode") ? { worktree_mode: policy.workflow.worktree_mode } : {},
    destructive_command_protection: {
      ...marked.has("destructive_command_protection.enabled") ? { enabled: policy.destructive_command_protection.enabled } : {},
      ...withOverrides(markedOverrides(marked, "destructive_command_protection", policy.destructive_command_protection.overrides)),
      ...marked.has("destructive_command_protection.allow_paths") ? { allow_paths: policy.destructive_command_protection.allow_paths } : {}
    },
    secret_protection: {
      ...marked.has("secret_protection.enabled") ? { enabled: policy.secret_protection.enabled } : {},
      ...withOverrides(markedOverrides(marked, "secret_protection", policy.secret_protection.overrides)),
      ...marked.has("secret_protection.deny_paths") ? { deny_paths: policy.secret_protection.deny_paths } : {},
      ...marked.has("secret_protection.allow_paths") ? { allow_paths: policy.secret_protection.allow_paths } : {}
    }
  };
  return {
    version: 1,
    ...Object.fromEntries(Object.entries(sections).filter(([, fields]) => Object.keys(fields).length > 0))
  };
};
var projectMarkedFields = (projection) => {
  const destructive = projection.destructive_command_protection ?? {};
  const secret = projection.secret_protection ?? {};
  return [
    ...projection.safety?.level === undefined ? [] : ["safety.level"],
    ...Object.keys(projection.safety?.overrides ?? {}).map((key) => \`safety.overrides.\${key}\`),
    ...projection.workflow?.worktree_mode === undefined ? [] : ["workflow.worktree_mode"],
    ...destructive.enabled === undefined ? [] : ["destructive_command_protection.enabled"],
    ...Object.keys(destructive.overrides ?? {}).map((id) => \`destructive_command_protection.overrides.\${id}\`),
    ...destructive.allow_paths === undefined ? [] : ["destructive_command_protection.allow_paths"],
    ...secret.enabled === undefined ? [] : ["secret_protection.enabled"],
    ...Object.keys(secret.overrides ?? {}).map((id) => \`secret_protection.overrides.\${id}\`),
    ...secret.deny_paths === undefined ? [] : ["secret_protection.deny_paths"],
    ...secret.allow_paths === undefined ? [] : ["secret_protection.allow_paths"]
  ];
};
var overlayProjectProposal = (baseline, proposal) => {
  const displayed = clonePolicy(baseline);
  const destructive = proposal.destructive_command_protection ?? {};
  const secret = proposal.secret_protection ?? {};
  if (proposal.safety?.level)
    displayed.safety.level = proposal.safety.level;
  Object.assign(displayed.safety.overrides, proposal.safety?.overrides ?? {});
  if (proposal.workflow?.worktree_mode !== undefined)
    displayed.workflow.worktree_mode = proposal.workflow.worktree_mode;
  if (destructive.enabled !== undefined)
    displayed.destructive_command_protection.enabled = destructive.enabled;
  Object.assign(displayed.destructive_command_protection.overrides, destructive.overrides ?? {});
  if (destructive.allow_paths)
    displayed.destructive_command_protection.allow_paths = destructive.allow_paths;
  if (secret.enabled !== undefined)
    displayed.secret_protection.enabled = secret.enabled;
  Object.assign(displayed.secret_protection.overrides, secret.overrides ?? {});
  if (secret.deny_paths)
    displayed.secret_protection.deny_paths = secret.deny_paths;
  if (secret.allow_paths)
    displayed.secret_protection.allow_paths = secret.allow_paths;
  return displayed;
};
var seedProjectDraft = (data) => {
  if (!data.baseline)
    return null;
  if (!Array.isArray(data.userPolicyDiagnostics) || data.userPolicyDiagnostics.length > 0)
    return null;
  const marked = new Set(projectMarkedFields(data.projection ?? {}));
  const policy = overlayProjectProposal(data.baseline, data.projection ?? {});
  return {
    baseline: data.baseline,
    marked,
    policy,
    snapshot: JSON.stringify(collectProjectProposal(marked, policy))
  };
};
var collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(Object.entries(draftPolicy.safety.overrides).filter(([, value]) => typeof value === "boolean"))
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
    allow_paths: draftPolicy.secret_protection.allow_paths
  },
  audit: draftPolicy.audit
});
var effectivePreviewPolicy = (policy, baseline) => {
  if (!baseline)
    return policy;
  const union = (user, project) => [...new Set([...user, ...project])];
  return {
    ...policy,
    destructive_command_protection: {
      ...policy.destructive_command_protection,
      allow_paths: union(baseline.destructive_command_protection.allow_paths, policy.destructive_command_protection.allow_paths)
    },
    secret_protection: {
      ...policy.secret_protection,
      deny_paths: union(baseline.secret_protection.deny_paths, policy.secret_protection.deny_paths),
      allow_paths: union(baseline.secret_protection.allow_paths, policy.secret_protection.allow_paths)
    }
  };
};
var requestPolicyPreview = (policy = collectFormPolicy()) => requestJson("/api/policy/preview", {
  method: "POST",
  body: JSON.stringify(policy)
});
var policyScopeMode = () => projectDraft ? "project" : "user";
var projectFieldChip = (field, compact = false) => {
  if (policyScopeMode() !== "project")
    return "";
  if (!markedFields.has(field))
    return '<span class="project-chip inherited">Inherited</span>';
  return \`<button type="button" class="project-chip" data-unmark-field="\${escapeHtml(field)}" title="Set by project - click to inherit again" aria-label="Set by project: \${escapeHtml(field)}. Activate to inherit again.">\${compact ? "Project" : "Set by project"}</button>\`;
};
var projectFieldLine = (field) => {
  const chip = projectFieldChip(field);
  return chip ? \`<div class="project-field-line">\${chip}</div>\` : "";
};
var projectChipSlots = [
  ["destructive-enabled-chip", "destructive_command_protection.enabled"],
  ["secret-enabled-chip", "secret_protection.enabled"],
  ["allow-paths-chip", "destructive_command_protection.allow_paths"],
  ["deny-paths-chip", "secret_protection.deny_paths"],
  ["secret-allow-paths-chip", "secret_protection.allow_paths"]
];
var syncProjectChips = () => {
  projectChipSlots.forEach(([id, field]) => {
    qs(id).innerHTML = projectFieldChip(field);
  });
};
var markProjectField = (field) => {
  if (!projectDraft || markedFields.has(field))
    return;
  markedFields.add(field);
  renderSafety();
  syncProjectChips();
};
var rebuildProjectDisplay = () => {
  if (!projectDraft)
    return;
  draftPolicy = overlayProjectProposal(projectDraft.baseline, collectProjectProposal(markedFields, draftPolicy));
  renderPolicySections();
  refreshPolicyPreview();
};
var unmarkProjectField = (field) => {
  if (!projectDraft || !markedFields.has(field))
    return;
  markedFields.delete(field);
  rebuildProjectDisplay();
};
var viewNames = ["overview", "activity", "policy", "rules", "integrations", "settings"];
var viewTitles = {
  overview: "Overview",
  activity: "Activity",
  policy: "Policy",
  rules: "Rules",
  integrations: "Integrations",
  settings: "Settings"
};
var currentView = () => {
  const hash = location.hash.replace("#", "");
  return viewNames.includes(hash) ? hash : "overview";
};
var applyView = () => {
  const view = currentView();
  document.body.dataset.view = view;
  const hasSearch = view === "activity" || view === "policy";
  qs("topbar-title").textContent = viewTitles[view];
  qs("topbar-title").classList.toggle("sr-only", hasSearch);
  document.querySelectorAll(".topbar-search").forEach((el) => {
    el.hidden = el.dataset.searchView !== view;
  });
  qs("topbar").classList.toggle("has-search", hasSearch);
  document.title = \`\${viewTitles[view]} · CC Safety Net\`;
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === view)
      link.setAttribute("aria-current", "page");
    else
      link.removeAttribute("aria-current");
  });
  qs("dirty-chip").hidden = !dirty || view === "policy";
  if (view === "activity")
    applyFeedClamps(qs("activity-feed"));
  if (view === "integrations" && !integrationsRequested) {
    integrationsRequested = true;
    loadIntegrations();
  }
  if (view === "rules" && !rulesRequested) {
    rulesRequested = true;
    loadRules();
  }
  if (view === "rules" && rulesData && pendingRuleFocus)
    renderRules();
};
var agentLabels = integrationDisplayNames;
var tierCountHtml = (segments) => {
  const parts = segments.filter(([count]) => count > 0).map(([count, label, tone]) => tone ? \`<span class="count-\${tone}">\${count} \${label}</span>\` : \`\${count} \${label}\`);
  return parts.length > 0 ? parts.join(" · ") : "0 on";
};
var feedItemHtml = (entry, index) => {
  const deny = entry.decision !== "allow";
  const badgeClass = entry.failureStage ? "error" : deny ? "deny" : "allow";
  const badgeLabel = entry.failureStage ? "Error" : deny ? "Blocked" : "Allowed";
  return \`<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge \${badgeClass}">\${badgeLabel}</span>
      \${entry.agent && entry.agent !== "unknown" ? \`<span class="agent-badge">\${escapeHtml(agentLabels[entry.agent] ?? entry.agent)}</span>\` : ""}
      \${entry.ruleId ? knownRuleIds.has(entry.ruleId) ? \`<button type="button" class="rule-id" data-jump-rule="\${escapeHtml(entry.ruleId)}" title="Show this rule in Policy">\${escapeHtml(entry.ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(entry.ruleId)}</code>\` : ""}
      <time datetime="\${escapeHtml(entry.ts)}" title="\${escapeHtml(entry.ts)}">\${formatRelativeTime(entry.ts)}</time>
      <button type="button" class="icon-button feed-copy" data-log-copy="\${index}" aria-label="Copy log entry as JSON">\${rawCopyIcons.copy}</button>
      \${deny ? \`<button type="button" class="icon-button feed-report" data-report-fp="\${index}" aria-label="Report false positive" title="Report false positive">\${reportIcon}</button>\` : \`<button type="button" class="feed-toggle feed-block" data-block-future="\${index}">Block this in future</button>\`}
    </div>
    <code class="feed-command">\${escapeHtml(entry.segment || entry.command || "(no command recorded)")}</code>
    \${entry.reason && entry.reason !== "allowed" ? \`<p class="feed-reason muted">\${escapeHtml(entry.reason)}</p>\` : ""}
  </article>\`;
};
var applyFeedClamps = (root) => {
  const overflowing = [...root.querySelectorAll(".feed-command")].filter((command) => !command.classList.contains("clamped") && command.scrollHeight > command.clientHeight + 1);
  overflowing.forEach((command) => {
    command.classList.add("clamped");
    command.insertAdjacentHTML("afterend", '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>');
  });
};
var dayLabel = (ts) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString())
    return "Today";
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString())
    return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
var renderOverviewActivity = () => {
  if (!overview)
    return;
  const tile = (value, label, extra) => \`<div class="tile"><strong>\${escapeHtml(value.toLocaleString("en-US"))}</strong><span>\${escapeHtml(label)}</span>\${extra}</div>\`;
  const dayAgoLabel = (daysAgo) => daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : \`\${daysAgo} days ago\`;
  const sparkline = (byDay, noun) => {
    const max = Math.max(...byDay, 1);
    return \`<div class="tile-spark" role="group" aria-label="Commands \${noun} per day, most recent \${dayCount(byDay.length)}">\${byDay.map((count, index) => {
      const label = \`\${dayAgoLabel(byDay.length - 1 - index)}: \${count.toLocaleString("en-US")} \${noun}\`;
      return \`<div class="spark-col" role="img" tabindex="0" data-count="\${count.toLocaleString("en-US")}" aria-label="\${escapeHtml(label)}"><div class="spark-bar\${count === 0 ? " spark-zero" : ""}" aria-hidden="true" style="height:\${count === 0 ? 2 : Math.max(2, Math.round(count / max * 40))}px"></div></div>\`;
    }).join("")}</div>\`;
  };
  qs("overview-window").textContent = \`Last \${dayCount(overview.days)}\`;
  qs("overview-tiles").innerHTML = [
    tile(overview.counts.blocked, "Blocked", sparkline(overview.counts.blockedByDay, "blocked")),
    tile(overview.totalInWindow, "Analyzed", sparkline(overview.counts.analyzedByDay, "analyzed"))
  ].join("");
};
var retentionDays = () => state?.policy?.audit?.retention_days ?? DEFAULT_RETENTION_DAYS;
var overviewDays = () => Math.min(OVERVIEW_DAYS, retentionDays());
var renderRetention = (loaded) => {
  qs("retention-days").value = String(loaded.policy.audit.retention_days);
  qs("retention-unit").textContent = loaded.policy.audit.retention_days === 1 ? "day" : "days";
  qs("retention-note").textContent = "Saved on change. Lowering this deletes anything already older than the new window; the Activity tab can only look back as far as it.";
};
var activityWindowOptions = () => {
  const retained = retentionDays();
  const windows = [7, 30, 90, 180, 365].filter((days) => days < retained);
  return [...windows, retained];
};
var configStateNotice = () => {
  const configState = state?.configState;
  if (!configState || configState.state === "ready")
    return null;
  return \`A fallback configuration is being enforced: \${configState.reason}\`;
};
var setProtectionBanner = (notices) => {
  const text = notices.filter(Boolean).join(" ");
  qs("protection-banner").textContent = text;
  qs("protection-banner").hidden = text === "";
};
var renderProtectionCard = () => {
  const configNotice = configStateNotice();
  if (!state?.preview) {
    qs("protection-card").hidden = true;
    setProtectionBanner([configNotice]);
    return;
  }
  const policy = state.policy;
  const customized = state.preview.counts.effectiveCustomizations > 0 || Object.entries(policy.safety.overrides).some(([key, value]) => value !== SAFETY_LEVEL_CAPABILITIES[policy.safety.level][key]);
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  const off = [
    commandsOn ? null : "Destructive command protection is off — configurable destructive command rules are not being enforced (catastrophic and custom rules remain active)",
    secretsOn ? null : "Secret protection is off — sensitive paths and deny paths are not being blocked"
  ].filter(Boolean);
  setProtectionBanner([
    off.length > 0 ? \`\${off.join(". ")}. Re-enable \${off.length > 1 ? "them" : "it"} in Policy.\` : null,
    configNotice
  ]);
  qs("protection-card").hidden = false;
  qs("protection-card").classList.toggle("protection-warning", !commandsOn || !secretsOn);
  qs("protection-card").innerHTML = \`<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>\` + \`<p>\${escapeHtml(safetyLevels[policy.safety.level][0])}\${customized ? " · Customized" : ""}</p>\` + \`<p\${commandsOn ? "" : ' class="state-disabled"'}>\${commandsOn ? \`\${state.preview.counts.enabled} rules active\` : "Destructive command protection is OFF"}</p>\` + \`<p\${secretsOn ? "" : ' class="state-disabled"'}>\${secretsOn ? "Secret protection on" : "Secret protection is OFF"}</p>\`;
};
var renderTopList = (containerId, counts, className, dataAttr) => {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs(containerId).innerHTML = top.length === 0 ? '<p class="empty">No blocked commands in this window.</p>' : top.map(([key, count]) => \`<button type="button" class="\${className}" \${dataAttr}="\${escapeHtml(key)}"><code class="rule-id">\${escapeHtml(key)}</code><span class="chip-count">\${count.toLocaleString("en-US")}</span></button>\`).join("");
};
var renderTopLists = () => {
  if (!overview)
    return;
  renderTopList("top-commands", overview.counts.commands, "top-command", "data-command");
  renderTopList("top-rules", overview.counts.rules, "top-rule", "data-rule-id");
};
var findSuspects = (entries) => {
  const signatureKey = (entry) => \`\${entry.sessionId}
\${commandSignature(entry.segment || entry.command)}\`;
  const repeats = entries.filter((entry) => entry.decision !== "allow" && entry.sessionId).reduce((counts, entry) => {
    const key = signatureKey(entry);
    return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map);
  return new Set(entries.filter((entry) => entry.decision !== "allow" && (entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2)));
};
var clearCommandFilter = () => {
  if (!activityFilters.command)
    return false;
  activityFilters.command = "";
  return true;
};
var jumpToActivityRule = (ruleId) => {
  activityFilters.command = "";
  activityFilters.query = ruleId.toLowerCase();
  qs("activity-search").value = ruleId;
  if (activity) {
    renderActivityControls();
    renderActivityFeed();
  }
  location.hash = "activity";
};
var renderGuardErrors = () => {
  if (!overview)
    return;
  qs("guard-errors").hidden = overview.counts.errors === 0;
  if (overview.counts.errors === 0)
    return;
  qs("guard-errors").textContent = \`\${overview.counts.errors.toLocaleString("en-US")} guard error\${overview.counts.errors === 1 ? "" : "s"} in the last \${dayCount(overview.days)} — commands blocked because evaluation failed, not by policy. Click to view.\`;
};
var renderActivityControls = () => {
  if (!activity)
    return;
  const agentCounts = activity.counts.agents;
  const chipHtml = (kind, value, label, count) => \`<button type="button" class="chip" data-activity-chip="\${kind}" data-chip-value="\${escapeHtml(value)}" aria-pressed="\${activityFilters[kind] === value}">\${escapeHtml(label)}\${count === undefined ? "" : \` <span class="chip-count">\${count.toLocaleString("en-US")}</span>\`}</button>\`;
  qs("activity-decision").innerHTML = [
    chipHtml("decision", "all", "All", activity.totalInWindow),
    chipHtml("decision", "deny", "Blocked", activity.counts.blocked),
    chipHtml("decision", "allow", "Allowed", activity.counts.allowed),
    ...activity.counts.errors > 0 ? [chipHtml("decision", "error", "Errors", activity.counts.errors)] : [],
    ...suspects.size > 0 ? [chipHtml("decision", "suspect", "Likely false positive", suspects.size)] : []
  ].join("");
  const agentNames = Object.keys(agentCounts).filter((name) => name !== "unknown").sort();
  qs("activity-agents").innerHTML = agentNames.length < 2 ? "" : [
    chipHtml("agent", "all", "All agents"),
    ...agentNames.map((name) => chipHtml("agent", name, agentLabels[name] ?? name, agentCounts[name]))
  ].join("");
  qs("activity-command-filter").innerHTML = activityFilters.command ? \`<button type="button" class="filter-pill" data-clear-command aria-label="Clear command filter">Command: <code>\${escapeHtml(activityFilters.command)}</code><span class="filter-pill-x" aria-hidden="true">✕</span></button>\` : "";
  qs("activity-days").innerHTML = activityWindowOptions().map((days) => \`<option value="\${days}">Last \${dayCount(days)}</option>\`).join("");
  qs("activity-days").value = String(activity.days);
};
var renderActivityFeed = () => {
  if (!activity)
    return;
  const matchesFilters = (entry) => {
    if (activityFilters.decision === "deny" && entry.decision === "allow")
      return false;
    if (activityFilters.decision === "allow" && entry.decision !== "allow")
      return false;
    if (activityFilters.decision === "error" && !entry.failureStage)
      return false;
    if (activityFilters.decision === "suspect" && !suspects.has(entry))
      return false;
    if (activityFilters.agent !== "all" && (entry.agent || "unknown") !== activityFilters.agent)
      return false;
    if (activityFilters.command) {
      if (entry.decision === "allow")
        return false;
      return commandSignature(entry.segment || entry.command) === activityFilters.command;
    }
    if (!activityFilters.query)
      return true;
    return [entry.ruleId, entry.segment || entry.command].filter(Boolean).join(" ").toLowerCase().includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  renderedFeedEntries = entries;
  qs("activity-feed").innerHTML = entries.length === 0 ? '<p class="empty">No audit log entries match.</p>' : \`<div class="feed-list">\${entries.map((entry, index) => {
    const label = dayLabel(entry.ts);
    const previous = entries[index - 1];
    const separator = previous && label === dayLabel(previous.ts) ? "" : \`<div class="feed-day-sep">\${escapeHtml(label)}</div>\`;
    return separator + feedItemHtml(entry, index);
  }).join("")}</div>\`;
  applyFeedClamps(qs("activity-feed"));
  qs("activity-count").textContent = \`Showing \${entries.length.toLocaleString("en-US")} of \${activity.totalInWindow.toLocaleString("en-US")} entries from the last \${dayCount(activity.days)}\${activity.truncated ? " (capped at 500, newest of each decision)" : ""}.\${activity.unreadable > 0 ? \` \${activity.unreadable.toLocaleString("en-US")} audit log source\${activity.unreadable === 1 ? "" : "s"} could not be read, so this list is incomplete.\` : ""}\`;
};
var loadOverview = async () => {
  const result = await requestJson(\`/api/activity?days=\${overviewDays()}\`);
  if (!result.ok || !result.data) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("overview-window").textContent = "";
    qs("overview-tiles").innerHTML = "";
    qs("top-rules").innerHTML = message;
    qs("guard-errors").hidden = true;
    return;
  }
  const feed = result.data;
  overview = feed;
  qs("logs-path").textContent = overview.logsDir ?? "Not available";
  renderOverviewActivity();
  renderTopLists();
  renderGuardErrors();
};
var loadActivity = async () => {
  const result = await requestJson(\`/api/activity?days=\${activityFilters.days}\`);
  if (!result.ok || !result.data) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("activity-feed").innerHTML = message;
    qs("activity-count").textContent = "";
    return;
  }
  const feed = result.data;
  activity = feed;
  suspects = findSuspects(activity.entries);
  if (activityFilters.agent !== "all" && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = "all";
  }
  if (activityFilters.decision === "error" && activity.counts.errors === 0) {
    activityFilters.decision = "all";
  }
  if (activityFilters.decision === "suspect" && suspects.size === 0) {
    activityFilters.decision = "all";
  }
  renderActivityControls();
  renderActivityFeed();
};
var runRefresh = async (buttonId, reload) => {
  const button = qs(buttonId);
  if (button.disabled)
    return;
  button.disabled = true;
  button.classList.add("spinning");
  try {
    await Promise.all([reload(), new Promise((resolve) => setTimeout(resolve, 600))]);
  } finally {
    button.classList.remove("spinning");
    button.disabled = false;
  }
};
var refreshActivity = () => runRefresh("activity-refresh", () => Promise.all([loadOverview(), loadActivity()]));
var renderIntegrations = () => {
  const loaded = integrations;
  if (!loaded)
    return;
  qs("integrations-list").innerHTML = loaded.targets.map((row) => {
    const busy = integrationBusy.has(row.target);
    const version = row.version === null ? '<span class="muted">not detected</span>' : \`<span class="agent-badge">v\${escapeHtml(row.version)}</span>\`;
    const status = row.status === "active" ? '<span class="state-active">Installed</span>' : row.status === "disabled" ? '<span class="state-disabled">Disabled</span>' : row.status === "not-inspected" ? \`<span class="muted" title="This runtime's state file could not be read, so its status is unknown.">Not inspected</span>\` : '<span class="muted">Not installed</span>';
    const uninstall = row.status === "active";
    const busyLabel = uninstall ? "Uninstalling…" : "Installing…";
    const action = row.version === null ? "" : \`<button type="button" class="\${uninstall ? "danger" : "primary"}" data-integration-action="\${uninstall ? "uninstall" : "install"}" data-integration-target="\${escapeHtml(row.target)}"\${busy ? " disabled" : ""}>\${busy ? busyLabel : uninstall ? "Uninstall" : row.status === "disabled" ? "Enable" : "Install"}</button>\`;
    const note = row.note ? \`<div class="status \${row.note.kind}">\${escapeHtml(row.note.text)}</div>\` : "";
    return \`<div class="integration-row">
        <span class="integration-info"><strong>\${escapeHtml(row.label)}</strong> \${version} \${status}</span>
        \${action}
        \${note}
      </div>\`;
  }).join("");
};
var loadHealth = async () => {
  const result = await requestJson("/api/health");
  if (!result.ok || !Array.isArray(result.data?.hooks))
    return;
  const active = result.data.hooks.filter((hook) => hook.configured);
  const inactive = result.data.hooks.filter((hook) => !hook.configured);
  const attention = inactive.length > 0 || active.length === 0;
  const parts = [];
  const labelHtml = (hook) => \`<strong>\${escapeHtml(hook.label)}</strong>\`;
  if (active.length)
    parts.push(\`Hook active in \${active.map(labelHtml).join(", ")}\`);
  if (inactive.length)
    parts.push(\`\${inactive.map(labelHtml).join(", ")} detected without an active hook\`);
  if (!parts.length)
    parts.push("No agent hooks detected");
  if (result.data.update?.updateAvailable)
    parts.push(\`v\${escapeHtml(result.data.update.latestVersion)} available\`);
  const link = attention ? ' <a class="view-all-link" href="#integrations">Fix in Integrations</a>' : "";
  const el = qs("health-strip");
  el.className = attention ? "status health-strip error" : "status health-strip ok";
  el.innerHTML = parts.join(" · ") + link;
  el.hidden = false;
};
var loadIntegrations = async () => {
  const result = await requestJson("/api/integrations");
  if (!result.ok || !Array.isArray(result.data?.targets)) {
    qs("integrations-list").innerHTML = \`<p class="empty">Could not load integrations: \${escapeHtml(errorText(result))}</p>\`;
    integrationsRequested = false;
    return;
  }
  integrations = result.data;
  renderIntegrations();
  qs("integrations-pkg-version").textContent = result.data.system.version;
  qs("integrations-node-version").textContent = result.data.system.nodeVersion ?? "unknown";
  qs("integrations-platform").textContent = result.data.system.platform;
  qs("integrations-system").hidden = false;
};
var refreshIntegrations = () => runRefresh("integrations-refresh", () => {
  integrationsRequested = true;
  return loadIntegrations();
});
var renderRules = () => {
  const loaded = rulesData;
  if (!loaded)
    return;
  if (!qs("rules-project-path").value)
    qs("rules-project-path").value = loaded.projectPath;
  const canPick = loaded.canPickDirectory && !directoryPickerFailed;
  qs("rules-project-path").readOnly = canPick;
  qs("rules-choose-directory").hidden = !canPick;
  qs("rules-list").innerHTML = loaded.rulebooks.length === 0 ? loaded.errors.length > 0 ? '<p class="empty">Every configured rulebook was dropped, so no custom rule is enforced. See Diagnostics below.</p>' : '<p class="empty">No custom rulebooks. Run <code>npx -y cc-safety-net rule init</code> to create one, or see the <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">documentation</a>.</p>' : loaded.rulebooks.map((rulebook) => \`<div class="rulebook-card">
    <div class="rulebook-head">
      <strong>\${escapeHtml(rulebook.name)}</strong>
      <span class="agent-badge">v\${escapeHtml(rulebook.version)}</span>
      \${rulebook.spec === rulebook.name ? "" : \`<code>\${escapeHtml(rulebook.spec)}</code>\`}
      <span>\${rulebook.source === "user" ? "All projects" : "This project"}</span>
      <span>\${rulebook.rules.length} rule\${rulebook.rules.length === 1 ? "" : "s"}</span>
    </div>
    \${rulebook.rules.map((rule) => \`<div class="rulebook-rule\${pendingRuleFocus === rule.name ? " rules-focus" : ""}">
      <code class="rule-id">custom.\${escapeHtml(rule.name)}</code>
      <code>\${escapeHtml([rule.command, rule.subcommand].filter(Boolean).join(" "))}</code>
      <p>Blocked arguments (any one matches): \${rule.block_args.map((arg) => \`<code>\${escapeHtml(arg)}</code>\`).join(" ")}</p>
      <p>\${escapeHtml(rule.reason)}</p>
    </div>\`).join("")}
  </div>\`).join("");
  const diagnostics = [
    ...loaded.errors.map((text) => \`<div class="status error">\${escapeHtml(text)}</div>\`),
    ...loaded.warnings.map((text) => \`<div class="status">\${escapeHtml(text)}</div>\`)
  ];
  qs("rules-diagnostics").innerHTML = diagnostics.join("");
  qs("rules-diagnostics-panel").hidden = diagnostics.length === 0;
  if (!pendingRuleFocus)
    return;
  const focused = qs("rules-list").querySelector(".rules-focus");
  if (focused)
    focused.scrollIntoView({ block: "center" });
  if (!focused)
    setAppStatus(\`custom.\${pendingRuleFocus} is not in any rulebook\`, "error");
  pendingRuleFocus = null;
};
var loadRules = async () => {
  const result = await requestJson("/api/rules");
  if (!result.ok || !Array.isArray(result.data?.rulebooks)) {
    qs("rules-list").innerHTML = \`<p class="empty">Could not load rules: \${escapeHtml(errorText(result))}</p>\`;
    rulesData = null;
    qs("rules-diagnostics-panel").hidden = true;
    rulesRequested = false;
    return;
  }
  rulesData = result.data;
  renderRules();
};
var refreshRules = () => runRefresh("rules-refresh", () => {
  rulesRequested = true;
  return loadRules();
});
var jumpToRulesRule = (ruleId) => {
  pendingRuleFocus = ruleId.replace(/^custom\\./, "");
  location.hash = "rules";
};
var openRuleComposer = (command) => {
  qs("rules-composer-input").value = command;
  location.hash = "rules";
};
var setRulesScope = (scope) => {
  rulesScope = scope;
  document.querySelectorAll("[data-rules-scope]").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.rulesScope === scope));
  });
  qs("rules-project-path-field").hidden = scope !== "project";
};
var rulePromptText = () => {
  const names = rulesData?.rulebooks.map((rulebook) => rulebook.name) ?? [];
  return [
    "Use the cc-safety-net skill for this request.",
    "If that skill is not available, run \`npx -y cc-safety-net rule doc\` first and treat its output as the source of truth for schema, paths, and validation.",
    "",
    rulesScope === "project" ? \`Scope: this project - \${qs("rules-project-path").value.trim()}\` : "Scope: all projects (user scope)",
    \`Existing rulebooks (names must stay unique across both scopes): \${names.length > 0 ? names.join(", ") : "none"}\`,
    "",
    qs("rules-composer-input").value.trim()
  ].join(\`
\`);
};
var chooseProjectDirectory = async () => {
  const button = qs("rules-choose-directory");
  if (button.disabled)
    return;
  button.disabled = true;
  const result = await requestJson("/api/rules/choose-directory", { method: "POST" });
  button.disabled = false;
  if (result.ok && result.data.path) {
    qs("rules-project-path").value = result.data.path;
    return;
  }
  if (result.ok && result.data.cancelled)
    return;
  directoryPickerFailed = true;
  qs("rules-project-path").readOnly = false;
  button.hidden = true;
  setAppStatus(\`\${result.ok ? result.data.error : errorText(result)} - type the project path instead\`, "error");
};
var copyRulePrompt = async () => {
  if (!rulesData) {
    setAppStatus("Rules have not loaded yet - refresh the Rulebooks panel", "error");
    return;
  }
  if (!qs("rules-composer-input").value.trim()) {
    setAppStatus("Describe what you want first", "error");
    return;
  }
  if (rulesScope === "project" && !qs("rules-project-path").value.trim()) {
    setAppStatus("Enter the project path the rule belongs to", "error");
    return;
  }
  qs("rules-copy-prompt").disabled = true;
  try {
    await navigator.clipboard.writeText(rulePromptText());
    qs("rules-composer-input").value = "";
    setAppStatus("Prompt copied - paste it into your coding CLI", "ok");
  } catch {
    setAppStatus("Copy failed", "error");
  } finally {
    qs("rules-copy-prompt").disabled = false;
  }
};
var runIntegrationAction = async (button) => {
  const target = button.dataset.integrationTarget;
  if (!target || integrationBusy.has(target))
    return;
  integrationBusy.add(target);
  const action = button.dataset.integrationAction;
  renderIntegrations();
  const result = await requestJson(\`/api/\${action}\`, {
    method: "POST",
    body: JSON.stringify({ target })
  });
  integrationBusy.delete(target);
  const row = integrations?.targets.find((entry) => entry.target === target);
  if (!row)
    return;
  const ok = result.ok && result.data.ok === true;
  if (ok)
    row.status = action === "install" ? "active" : "not-installed";
  row.note = {
    kind: ok ? "ok" : "error",
    text: ok ? result.data.output : result.data?.output || errorText(result)
  };
  if (!ok)
    setAppStatus(action === "install" ? "Install failed" : "Uninstall failed", "error");
  renderIntegrations();
};
var confirmDialog = (() => {
  const dialog = qs("confirm-dialog");
  const confirm = qs("confirm-dialog-confirm");
  const cancel = qs("confirm-dialog-cancel");
  let resolvePending = null;
  dialog.addEventListener("close", () => {
    if (!resolvePending)
      return;
    resolvePending(dialog.returnValue === "confirm");
    resolvePending = null;
  });
  dialog.addEventListener("cancel", () => {
    dialog.returnValue = "cancel";
  });
  return (options) => new Promise((resolve) => {
    if (resolvePending) {
      resolve(false);
      return;
    }
    qs("confirm-dialog-title").textContent = options.title;
    qs("confirm-dialog-body").textContent = options.body;
    qs("confirm-dialog-detail").textContent = options.detail ?? "";
    const detailRow = qs("confirm-dialog-detail").parentElement;
    if (detailRow)
      detailRow.hidden = !options.detail;
    qs("confirm-dialog-rows").innerHTML = options.rowsHtml ?? "";
    qs("confirm-dialog-rows").hidden = !options.rowsHtml;
    confirm.textContent = options.confirmLabel;
    confirm.className = options.confirmClass ?? "danger";
    dialog.returnValue = "cancel";
    resolvePending = resolve;
    dialog.showModal();
    cancel.focus();
  });
})();
var confirmProtectionDisable = (options) => confirmDialog({
  title: options.title,
  body: options.body,
  detail: options.detail,
  confirmLabel: "Disable protection"
});
var togglePanel = (button) => {
  const controls = button.getAttribute("aria-controls");
  if (!controls)
    return;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  qs(controls).hidden = !expanded;
};
var syncSearchState = () => {
  const active = qs("policy-search").value.trim().length > 0;
  if (active === searchActive)
    return;
  searchActive = active;
  if (active)
    return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
var updateRawSource = () => {
  if (projectDraft) {
    qs("raw-source").textContent = \`Only the fields marked for this project. Writes to \${projectDraft.path}.\`;
    return;
  }
  qs("raw-source").textContent = state?.errors.length ? "Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON." : "Read-only mirror of the controls.";
};
var setRawCopyCopied = (copied) => {
  qs("raw-copy").innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs("raw-copy").classList.toggle("copied", copied);
  qs("raw-copy").setAttribute("aria-label", copied ? "Copied raw JSON" : "Copy raw JSON to clipboard");
};
var resetFeedCopy = () => {
  document.querySelectorAll(".feed-copy.copied").forEach((button) => {
    button.classList.remove("copied");
    button.innerHTML = rawCopyIcons.copy;
    button.setAttribute("aria-label", "Copy log entry as JSON");
  });
};
var reportIssueUrl = "https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml";
var reportUrlLimit = 8000;
var endsAtPathBoundary = (following) => following === "" || /^[/\\\\\\s'"]/.test(following);
var scrubReportPaths = (text, cwd, home) => [
  [cwd, "<project>"],
  [home, "~"]
].reduce((scrubbed, [from, to]) => from ? scrubbed.split(from).reduce((joined, part) => joined + (endsAtPathBoundary(part) ? to : from) + part) : scrubbed, text);
var buildReportUrl = (fields) => {
  const url = new URL(reportIssueUrl);
  Object.entries(fields).filter(([, value]) => value).forEach(([field, value]) => {
    url.searchParams.set(field, value);
  });
  return url.toString();
};
var buildReportRequest = (fields, dropped = []) => {
  const url = buildReportUrl(fields);
  if (url.length <= reportUrlLimit)
    return { url, dropped };
  const largest = Object.entries(fields).filter(([, value]) => value).sort((left, right) => right[1].length - left[1].length)[0];
  if (!largest)
    return { url, dropped };
  return buildReportRequest({ ...fields, [largest[0]]: "" }, [...dropped, largest[0]]);
};
var openReportDialog = (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.reportFp)];
  if (!entry)
    return;
  const scrub = (text) => scrubReportPaths(text, entry.cwd, activity?.homeDir);
  qs("report-command").value = scrub(entry.command || entry.segment || "");
  qs("report-entry").value = JSON.stringify(entry, (_key, value) => typeof value === "string" ? scrub(value) : value, 2);
  qs("report-dialog").returnValue = "cancel";
  qs("report-dialog").showModal();
};
var openFalsePositiveForm = async () => {
  const fields = {
    command: qs("report-command").value,
    entry: qs("report-entry").value
  };
  const request = buildReportRequest(fields);
  const copying = request.dropped.length ? navigator.clipboard.writeText(request.dropped.map((field) => \`### \${field}
\${fields[field]}\`).join(\`

\`)) : null;
  window.open(request.url, "_blank", "noopener");
  if (!copying)
    return;
  const names = request.dropped.join(" and ");
  setAppStatus(await copying.then(() => true).catch(() => false) ? \`Report too long to prefill — \${names} copied to your clipboard. Paste into the form on GitHub.\` : \`Report too long to prefill — \${names} left out. Copy the entry from the feed and paste it into the form on GitHub.\`, "error");
};
qs("report-dialog").addEventListener("close", () => {
  if (qs("report-dialog").returnValue === "report")
    openFalsePositiveForm();
});
var copyFeedEntry = async (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.logCopy)];
  if (!entry)
    return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (feedCopyResetTimer)
      clearTimeout(feedCopyResetTimer);
    resetFeedCopy();
    button.classList.add("copied");
    button.innerHTML = rawCopyIcons.check;
    button.setAttribute("aria-label", "Copied log entry");
    feedCopyResetTimer = setTimeout(resetFeedCopy, 2000);
  } catch {
    setAppStatus("Copy failed", "error");
  }
};
var copyRawToClipboard = async () => {
  qs("raw-copy").disabled = true;
  try {
    await navigator.clipboard.writeText(qs("raw").value);
    setRawCopyCopied(true);
    if (rawCopyResetTimer)
      clearTimeout(rawCopyResetTimer);
    rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
  } catch (error) {
    setAppStatus("Copy failed", "error");
    setDetailStatus(\`Error: Could not copy Raw JSON: \${error instanceof Error ? error.message : String(error)}\`, "error");
  } finally {
    qs("raw-copy").disabled = false;
  }
};
var formatStarCount = (count) => {
  if (typeof count !== "number")
    return "";
  if (count >= 1000)
    return \`\${(count / 1000).toFixed(1).replace(/\\.0$/, "")}k\`;
  return String(count);
};
var starCountHtml = (count) => {
  const formatted = formatStarCount(count);
  return formatted ? \`<span class="star-count">\${escapeHtml(formatted)}</span>\` : "";
};
var hideStarCta = () => {
  qs("star-row").hidden = true;
  qs("star-slot").innerHTML = "";
};
var renderStarPitch = (context, starred = false) => {
  const evidence = context.blockedTotal > 0 ? \`CC Safety Net has blocked <strong>\${escapeHtml(context.blockedTotal.toLocaleString("en-US"))}</strong> risky command\${context.blockedTotal === 1 ? "" : "s"} on this machine in its retained \${escapeHtml(dayCount(retentionDays()))} history.\` : "";
  if (starred) {
    qs("star-pitch-text").innerHTML = evidence;
    return;
  }
  qs("star-pitch-text").innerHTML = evidence ? \`\${evidence} If it saved your work, star it on GitHub.\` : "If CC Safety Net is useful to you, star it on GitHub.";
};
var renderStarLink = (context, href = fallbackRepoUrl) => {
  qs("star-slot").innerHTML = \`<a class="star-cta" href="\${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </a>\`;
  qs("star-row").hidden = false;
};
var renderStarCta = (context) => {
  activeStarContext = context;
  if (context.starred === true) {
    hideStarCta();
    return;
  }
  renderStarPitch(context);
  qs("star-mechanism").hidden = context.starred !== false;
  if (context.starred === null) {
    renderStarLink(context);
    return;
  }
  qs("star-slot").innerHTML = \`<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </button>\`;
  qs("star-row").hidden = false;
};
var starRepo = async (button) => {
  button.disabled = true;
  const result = await requestJson("/api/star", { method: "POST" });
  if (result.ok && result.data?.ok === true) {
    const icon = button.querySelector(".star-icon");
    const label = button.querySelector(".star-label");
    if (icon)
      icon.innerHTML = starIcons.filled;
    if (label)
      label.textContent = "Starred. Thank you.";
    button.setAttribute("aria-label", "CC Safety Net starred on GitHub");
    button.classList.add("starred");
    qs("star-mechanism").hidden = true;
    renderStarPitch(activeStarContext, true);
    setAppStatus("Starred on GitHub", "ok");
    setDetailStatus("");
    return;
  }
  qs("star-mechanism").hidden = true;
  renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
};
var loadStarContext = async () => {
  const result = await requestJson("/api/star/context");
  renderStarCta(result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 });
};
var syncRawFromForm = () => {
  if (state?.errors.length)
    return;
  qs("raw").value = formatPolicy(projectDraft ? collectProjectProposal(markedFields, draftPolicy) : collectFormPolicy());
  updateRawSource();
};
var updateDirtyStatus = () => {
  if (!state || state.errors.length)
    return;
  if (projectDraft) {
    dirty = JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== projectDraft.snapshot;
    qs("policy-savebar").hidden = !dirty;
    qs("dirty-chip").hidden = !dirty || currentView() === "policy";
    setDetailStatus("");
    updateActions();
    return;
  }
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs("policy-savebar").hidden = !dirty;
  qs("dirty-chip").hidden = !dirty || currentView() === "policy";
  if (dirty)
    sessionStorage.setItem("cc-safety-net-draft", draftJson);
  if (!dirty)
    sessionStorage.removeItem("cc-safety-net-draft");
  setDetailStatus("");
  updateActions();
};
var createPathList = (prefix, config) => {
  const setHint = (text) => {
    qs(\`\${prefix}-hint\`).textContent = text;
    qs(\`\${prefix}-hint\`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(\`\${prefix}-count\`).textContent = \`\${paths.length} path\${paths.length === 1 ? "" : "s"}\`;
    qs(\`\${prefix}-input\`).disabled = disabled;
    qs(\`\${prefix}-add-button\`).disabled = disabled;
    qs(\`\${prefix}-list\`).innerHTML = paths.length === 0 ? \`<li class="empty">No \${config.itemLabel}s configured.</li>\` : paths.map((path, index) => \`<li class="path-item \${disabled ? "row-disabled" : ""}">
          <code>\${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="\${prefix}" data-path-remove="\${index}" \${disabled ? "disabled" : ""} aria-label="Remove \${config.itemLabel} \${escapeHtml(path)}">\${pathListIcons.remove}</button>
        </li>\`).join("");
  };
  const claimForProject = () => {
    if (!projectDraft || markedFields.has(config.field))
      return;
    markedFields.add(config.field);
    config.setPaths([]);
    syncProjectChips();
  };
  let adding = false;
  const add = async (value) => {
    if (adding)
      return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0)
      return;
    const scope = projectDraft;
    const claimed = projectDraft !== null && !markedFields.has(config.field);
    const previousPaths = config.getPaths();
    claimForProject();
    const submitted = qs(\`\${prefix}-input\`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (config.validateAdditions && additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        if (projectDraft !== scope)
          return;
        if (error) {
          setHint(\`Not added: \${additions.join(", ")} — \${error}\`);
          if (claimed) {
            markedFields.delete(config.field);
            config.setPaths(previousPaths);
            syncProjectChips();
          }
          return;
        }
      } finally {
        adding = false;
      }
    }
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs(\`\${prefix}-input\`).value === submitted)
      qs(\`\${prefix}-input\`).value = "";
    setHint(duplicates.length ? \`Already listed: \${duplicates.join(", ")}\` : "");
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(\`\${prefix}-input\`).focus();
  };
  const remove = (index) => {
    claimForProject();
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint("");
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
var validatePathAdditions = async (patch) => {
  const candidate = collectFormPolicy();
  patch(candidate);
  const result = await requestPolicyPreview(candidate);
  if (result.ok && result.data?.preview)
    return null;
  return errorText(result);
};
var pathLists = {
  "deny-paths": createPathList("deny-paths", {
    field: "secret_protection.deny_paths",
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "deny path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.secret_protection = { ...candidate.secret_protection, deny_paths: paths };
    })
  }),
  "secret-allow-paths": createPathList("secret-allow-paths", {
    field: "secret_protection.allow_paths",
    getPaths: () => draftPolicy.secret_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.secret_protection = { ...candidate.secret_protection, allow_paths: paths };
    })
  }),
  "allow-paths": createPathList("allow-paths", {
    field: "destructive_command_protection.allow_paths",
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.destructive_command_protection = {
        ...candidate.destructive_command_protection,
        allow_paths: paths
      };
    })
  })
};
var pathListFor = (name) => name === "deny-paths" || name === "allow-paths" || name === "secret-allow-paths" ? pathLists[name] : null;
var secretRuleIsActive = (rule, overrides) => overrides[rule.id] ? overrides[rule.id] === "on" : !rule.defaultOff;
var markProjectOverride = (section, ruleId) => {
  if (!projectDraft)
    return;
  markedFields.add(\`\${section}.overrides.\${ruleId}\`);
};
var clearProjectOverrideMarks = (section) => {
  markedFields = new Set([...markedFields].filter((field) => !field.startsWith(\`\${section}.overrides.\`)));
};
var setSecretOverride = (rule, active) => {
  if (!projectDraft && active === !rule.defaultOff) {
    delete draftPolicy.secret_protection.overrides[rule.id];
    return;
  }
  draftPolicy.secret_protection.overrides[rule.id] = active ? "on" : "off";
  markProjectOverride("secret_protection", rule.id);
};
var setDestructiveOverride = (ruleId, active, inheritedEnabled) => {
  if (!projectDraft && active === inheritedEnabled) {
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    return;
  }
  draftPolicy.destructive_command_protection.overrides[ruleId] = active ? "on" : "off";
  markProjectOverride("destructive_command_protection", ruleId);
};
var groupRules = (rules) => rules.reduce((groups, rule) => {
  const group = groups.find((item) => item.category === rule.category);
  if (group) {
    group.rules.push(rule);
    return groups;
  }
  groups.push({ category: rule.category, rules: [rule] });
  return groups;
}, []);
var renderSecretPatterns = () => {
  if (!state)
    return;
  const loaded = state;
  const query = qs("policy-search").value.trim().toLowerCase();
  const rules = state.secretPatterns.filter((rule) => [rule.category, rule.label, rule.id, rule.description, ...rule.paths ?? []].join(" ").toLowerCase().includes(query));
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = state.secretPatterns.filter((rule) => !secretRuleIsActive(rule, overrides)).length;
  qs("secret-summary").textContent = disabled ? "Protection disabled. Saved rule settings and deny paths are preserved." : \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`;
  qs("secret-patterns").innerHTML = rules.length === 0 ? '<p class="empty">No secret protections match the search.</p>' : groupRules(rules).map((group) => {
    const expanded = secretGroupExpanded.get(group.category) || searchActive && !searchCollapsedSecretGroups.has(group.category);
    const contentId = \`secret-group-\${group.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`;
    const allGroupRules = loaded.secretPatterns.filter((rule) => rule.category === group.category);
    const onCount = disabled ? 0 : allGroupRules.filter((rule) => secretRuleIsActive(rule, overrides)).length;
    return \`
      <section class="rule-tier">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-secret-group-toggle="\${escapeHtml(group.category)}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${escapeHtml(group.category)}</strong></span>
            <span class="tier-counts">\${tierCountHtml([
      [onCount, "on"],
      [allGroupRules.length - onCount, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-secret-group-active="\${escapeHtml(group.category)}" \${checkbox(allGroupRules.some((rule) => secretRuleIsActive(rule, overrides)))} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${group.category} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
        <div class="grid">\${group.rules.map((rule) => {
      const active = secretRuleIsActive(rule, overrides);
      const ruleState = active && !disabled ? { label: "Active", className: "state-active" } : { label: "Disabled", className: "state-disabled" };
      const control = \`<input type="checkbox" data-secret-active="\${escapeHtml(rule.id)}" \${checkbox(active)} \${disabled ? "disabled" : ""}>
            <span>
              <strong>\${escapeHtml(rule.label)}</strong>
              <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
              <small><span class="\${ruleState.className}">\${ruleState.label}</span> \${escapeHtml(rule.description ?? "")}</small>
            </span>\`;
      const chip = projectFieldChip(\`secret_protection.overrides.\${rule.id}\`, true);
      if (!rule.paths) {
        return \`<label class="row \${disabled ? "row-disabled" : ""}">\${control}\${chip}</label>\`;
      }
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
            <label class="rule-control">\${control}</label>
            <button type="button" class="rule-example-button" data-secret-paths="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show protected paths for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
            \${chip}
          </div>\`;
    }).join("")}</div>
        </div>
      </section>
    \`;
  }).join("");
};
var presetName = () => safetyLevels[draftPolicy.safety.level][0];
var renderPresetStatus = () => {
  if (!preview)
    return;
  const customized = preview.counts.effectiveCustomizations > 0 || Object.entries(draftPolicy.safety.overrides).some(([key, value]) => value !== SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level][key]);
  qs("safety-preset-status").textContent = customized ? \`\${presetName()} · Customized\` : "";
  qs("safety-preset-status").classList.toggle("customized", customized);
};
var renderSafety = () => {
  const environmentSources = preview ? [
    ...new Set(Object.values(preview.capabilities).filter((capability) => capability.source === "environment").flatMap((capability) => capability.sources.filter((source) => source.startsWith("env "))))
  ] : [];
  qs("environment-overrides").hidden = environmentSources.length === 0;
  qs("environment-overrides").textContent = environmentSources.length ? \`Environment-raised protection: \${environmentSources.join(", ")}\` : "";
  qs("safety-level").innerHTML = projectFieldLine("safety.level") + Object.entries(safetyLevels).map(([level, meta]) => \`<label class="row preset-\${level}"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`).join("");
  const inherited = SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level];
  qs("safety-overrides").innerHTML = Object.entries(safetyOverrides).map(([key, meta]) => {
    const value = draftPolicy.safety.overrides[key];
    const inheritedText = inherited[key] ? "on" : "off";
    return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
      <option value="inherit" \${value === undefined ? "selected" : ""}>Inherit from preset (\${inheritedText})</option>
      <option value="true" \${value === true ? "selected" : ""}>Force on</option>
      <option value="false" \${value === false ? "selected" : ""}>Force off</option>
    </select>\${projectFieldChip(\`safety.overrides.\${key}\`, true)}</label>\`;
  }).join("");
  qs("workflow").innerHTML = \`<label class="row"><input type="checkbox" data-workflow-worktree \${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span>\${projectFieldChip("workflow.worktree_mode")}</label>\`;
  renderPresetStatus();
};
var tierForRule = (rule) => {
  if (!rule.activationCapability)
    return "normal";
  return rule.activationCapability === "fail_closed" ? "strict" : "paranoid";
};
var tierMeta = {
  normal: ["Available in every preset", "No additional capability required"],
  strict: ["Strict tier", "Inherits from Fail closed"],
  paranoid: ["Paranoid tier", "Inherits from Paranoid rm or Paranoid interpreters"]
};
var ruleStateText = (rule, effective, capabilities) => {
  const capability = rule.activationCapability;
  if (effective.source === "master_disabled")
    return "Off — destructive-command protection disabled";
  if (effective.source === "rule_override")
    return \`\${effective.enabled ? "On" : "Off"} — user rule override\`;
  if (effective.source === "built_in_default")
    return "On — available in every preset";
  if (effective.source === "environment") {
    const sources = capability ? capabilities[capability]?.sources ?? [] : [];
    const source = [...sources].reverse().find((item) => item.startsWith("env "));
    return \`\${effective.enabled ? "On" : "Off"} — environment\${source ? \`; \${source.slice(4)}\` : ""}\`;
  }
  if (effective.source === "capability_override" && capability) {
    return \`\${effective.enabled ? "On" : "Off"} — capability override; \${safetyOverrides[capability][0]} forced \${effective.enabled ? "on" : "off"}\`;
  }
  if (effective.enabled)
    return \`On — \${presetName()} preset\`;
  return \`Off — \${presetName()} preset; requires \${tierForRule(rule) === "strict" ? "Strict" : "Paranoid"}\`;
};
var showRulePopover = (button, label, title, body) => {
  const popover = qs("rule-example-popover");
  qs("rule-example-label").textContent = label;
  qs("rule-example-title").textContent = title;
  qs("rule-example-command").textContent = body;
  if (!popover.matches(":popover-open"))
    popover.showPopover();
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gap = 8;
  const edge = 12;
  const below = buttonRect.bottom + gap;
  const top = below + popoverRect.height <= window.innerHeight - edge ? below : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(window.innerWidth - popoverRect.width - edge, Math.max(edge, buttonRect.right - popoverRect.width));
  popover.style.top = \`\${top}px\`;
  popover.style.left = \`\${left}px\`;
};
var openRuleExample = (button) => {
  const rule = state?.destructiveCommandRules.find((item) => item.id === button.dataset.ruleExample);
  if (!rule)
    return;
  showRulePopover(button, "Blocked command example", rule.label, rule.example);
};
var openSecretPaths = (button) => {
  const rule = state?.secretPatterns.find((item) => item.id === button.dataset.secretPaths);
  if (!rule?.paths)
    return;
  showRulePopover(button, "Protected paths", rule.label, rule.paths.join(\`
\`));
};
var renderDestructiveCommands = () => {
  if (!state || !preview)
    return;
  const loaded = state;
  const effectiveState = preview;
  const query = qs("policy-search").value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) => [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]].join(" ").toLowerCase().includes(query));
  qs("destructive-command-summary").textContent = draftPolicy.destructive_command_protection.enabled ? \`\${preview.counts.enabled} active, \${preview.counts.disabled} disabled\` : "Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.";
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded = tierExpanded.get("enforced") || searchActive && !searchCollapsedTiers.has("enforced");
  const enforcedSection = enforcedRules.length === 0 ? "" : \`<section class="rule-tier rule-tier-enforced">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="enforced" aria-expanded="\${enforcedExpanded}" aria-controls="destructive-tier-enforced">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
            <span class="tier-counts">\${enforcedRules.length} protection\${enforcedRules.length === 1 ? "" : "s"}</span>
          </button>
        </div>
        <div id="destructive-tier-enforced" class="tier-content" \${enforcedExpanded ? "" : "hidden"}>
          \${groupRules(enforcedRules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => \`<div class="row rule-row">
                <span class="rule-control">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="state-active">Always enforced</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>\`).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  qs("destructive-command-rules").innerHTML = matchingRules.length === 0 ? '<p class="empty">No built-in protections match the search.</p>' : enforcedSection + Object.keys(tierMeta).map((tier) => {
    const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
    if (rules.length === 0)
      return "";
    const allTierRules = loaded.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === tier);
    const tierStates = allTierRules.flatMap((rule) => effectiveState.rules[rule.id] ?? []);
    const expanded = tierExpanded.get(tier) || searchActive && !searchCollapsedTiers.has(tier);
    const contentId = \`destructive-tier-\${tier}\`;
    return \`<section class="rule-tier rule-tier-\${tier}">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="\${tier}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${tierMeta[tier][0]}</strong><small>\${tierMeta[tier][1]}</small></span>
            <span class="tier-counts">\${tierCountHtml([
      [tierStates.filter((item) => item.enabled).length, "on"],
      [tierStates.filter((item) => !item.enabled).length, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-destructive-tier-active="\${tier}" \${checkbox(tierStates.some((item) => item.enabled))} \${!draftPolicy.destructive_command_protection.enabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${tierMeta[tier][0]} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
          \${groupRules(rules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => {
      const effective = effectiveState.rules[rule.id];
      if (!effective)
        return "";
      const override = draftPolicy.destructive_command_protection.overrides[rule.id];
      const status = ruleStateText(rule, effective, effectiveState.capabilities);
      const disabled = !draftPolicy.destructive_command_protection.enabled;
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
                <label class="rule-control">
                  <input type="checkbox" data-destructive-command-active="\${escapeHtml(rule.id)}" \${checkbox(effective.enabled)} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`\${rule.label}: \${status}\`)}">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="\${effective.enabled ? "state-active" : "state-disabled"}">\${escapeHtml(status)}</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </label>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                \${override && !effective.changesInherited ? \`<button type="button" class="inherit-button" data-use-inherited="\${escapeHtml(rule.id)}">Use inherited setting</button>\` : ""}
                \${projectFieldChip(\`destructive_command_protection.overrides.\${rule.id}\`, true)}
              </div>\`;
    }).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  }).join("");
};
var refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestPolicyPreview(effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null));
  if (requestId !== previewRequestId)
    return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus("Preview failed", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  runCommandTest();
  return true;
};
var testerRequestId = 0;
var runCommandTest = async () => {
  const command = qs("tester-input").value.trim();
  if (!command) {
    qs("tester-result").hidden = true;
    return;
  }
  const requestId = ++testerRequestId;
  const result = await requestJson("/api/policy/explain", {
    method: "POST",
    body: JSON.stringify({
      command,
      policy: effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null)
    })
  });
  if (requestId !== testerRequestId)
    return;
  const el = qs("tester-result");
  el.hidden = false;
  if (!result.ok) {
    el.className = "status error";
    el.textContent = \`Could not evaluate: \${errorText(result)}\`;
    return;
  }
  if (result.data.result === "allowed") {
    el.className = "status ok";
    el.innerHTML = \`Allowed — no rule blocks this command under the current draft policy. <button type="button" class="feed-toggle" data-create-rule="\${escapeHtml(command)}">Create a rule for this</button>\`;
    return;
  }
  const ruleId = result.data.customRule?.id ?? result.data.ruleId;
  const ruleIdHtml = result.data.customRule ? \`<button type="button" class="rule-id" data-jump-custom-rule="\${escapeHtml(ruleId)}" title="Show this rule in Rules">\${escapeHtml(ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(ruleId)}</code>\`;
  const segment = result.data.segment && result.data.segment !== command ? \`<div class="tester-segment">Segment: <code>\${escapeHtml(result.data.segment)}</code></div>\` : "";
  el.className = "status error";
  el.innerHTML = \`Blocked\${ruleId ? \` by \${ruleIdHtml}\` : ""} — \${escapeHtml(result.data.reason || "")}\${segment}\`;
};
function render() {
  if (!state)
    return;
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  knownRuleIds = new Set([...state.destructiveCommandRules, ...state.secretPatterns].map((rule) => rule.id));
  dirty = false;
  qs("policy-savebar").hidden = true;
  qs("dirty-chip").hidden = true;
  qs("policy-path").textContent = state.path + (state.exists ? "" : " (not created yet)");
  const projectPolicy = state.projectPolicy;
  qs("project-policy-row").hidden = !projectPolicy;
  qs("project-policy-path").textContent = projectPolicy?.path ?? "";
  qs("project-policy-notice").hidden = !projectPolicy || projectPolicy.weakenings.length === 0;
  qs("project-policy-notice").textContent = projectPolicy ? ["Merged on top of this file:", ...projectPolicy.weakenings].join(\`
\`) : "";
  qs("app-version").textContent = state.version;
  renderSafety();
  qs("destructive-command").innerHTML = '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' + checkbox(state.policy.destructive_command_protection.enabled) + '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge">' + (state.policy.destructive_command_protection.enabled ? "On" : "Off") + '</span><span class="project-chip-slot" id="destructive-enabled-chip"></span></label>' + '<div id="destructive-command-rules"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="allow-paths-content" hidden>' + '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="allow-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="allow-paths-chip"></span>' + '<ul class="paths-list" id="allow-paths-list"></ul>' + "</div></section>";
  qs("secret").innerHTML = '<label class="row master"><input type="checkbox" id="secret-enabled" ' + checkbox(state.policy.secret_protection.enabled) + '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge">' + (state.policy.secret_protection.enabled ? "On" : "Off") + '</span><span class="project-chip-slot" id="secret-enabled-chip"></span></label>' + '<div id="secret-patterns"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' + '<div class="tier-content paths-content" id="deny-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="deny-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="deny-paths-chip"></span>' + '<ul class="paths-list" id="deny-paths-list"></ul>' + "</div></section>" + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="secret-allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="secret-allow-paths-label">Allow paths</strong><small>Configured files and subtrees are exempt from the pattern rules. Deny paths and coding CLI protections still apply. Entries covering the home directory are rejected, and glob patterns are not supported.</small></span><span class="tier-counts" id="secret-allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="secret-allow-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="secret-allow-paths-input" data-path-input="secret-allow-paths" autocomplete="off" spellcheck="false" placeholder="~/project/.env.test or ~/project/fixtures" aria-labelledby="secret-allow-paths-label"><button type="button" class="icon-button" id="secret-allow-paths-add-button" data-path-add="secret-allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="secret-allow-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="secret-allow-paths-chip"></span>' + '<ul class="paths-list" id="secret-allow-paths-list"></ul>' + "</div></section>";
  qs("raw").value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
  qs("policy-search").value = "";
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  syncProjectChips();
  updateRawSource();
  renderRetention(state);
  qs("recovery").hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== "policy")
      location.hash = "policy";
    setAppStatus("Repair required", "error");
    setDetailStatus(\`Error: \${state.errors.join(\`
\`)}\`, "error");
    return;
  }
  setAppStatus("");
  setDetailStatus("");
}
var restoreDraft = () => {
  if (!state || state.errors.length)
    return;
  const stored = sessionStorage.getItem("cc-safety-net-draft");
  if (!stored)
    return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  const isRecordField = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const isOptionalPathList = (value) => value === undefined || Array.isArray(value) && value.every((item) => typeof item === "string");
  const isPolicyShape = isRecordField(parsed) && isRecordField(parsed.safety) && typeof parsed.safety.level === "string" && Object.hasOwn(safetyLevels, parsed.safety.level) && isRecordField(parsed.safety.overrides) && isRecordField(parsed.workflow) && isRecordField(parsed.destructive_command_protection) && isRecordField(parsed.destructive_command_protection.overrides) && isOptionalPathList(parsed.destructive_command_protection.allow_paths) && isRecordField(parsed.secret_protection) && isRecordField(parsed.secret_protection.overrides) && isOptionalPathList(parsed.secret_protection.deny_paths) && isOptionalPathList(parsed.secret_protection.allow_paths) && isRecordField(parsed.audit);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem("cc-safety-net-draft");
    return;
  }
  const draft = parsed;
  draft.destructive_command_protection.allow_paths ??= [];
  draft.secret_protection.deny_paths ??= [];
  draft.secret_protection.allow_paths ??= [];
  draftPolicy = draft;
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus("Restored unsaved draft", "ok");
};
function renderPolicySections() {
  const masterToggle = document.querySelector("[data-destructive-command-enabled]");
  if (masterToggle)
    masterToggle.checked = draftPolicy.destructive_command_protection.enabled;
  qs("secret-enabled").checked = draftPolicy.secret_protection.enabled;
  syncMasterBadges();
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  syncProjectChips();
  syncRawFromForm();
  updateDirtyStatus();
}
async function load() {
  const result = await requestJson("/api/policy");
  if (!result.ok || !result.data) {
    setAppStatus("Load failed", "error");
    setDetailStatus(\`Error: Could not load policy: \${errorText(result)}\`, "error");
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
var targetInput = (event) => event.target instanceof HTMLInputElement ? event.target : null;
var targetElement = (event) => event.target instanceof Element ? event.target : null;
document.addEventListener("input", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "policy-search") {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === "activity-search" && activity) {
    if (clearCommandFilter())
      renderActivityControls();
    activityFilters.query = input.value.trim().toLowerCase();
    clearTimeout(activityQueryTimer);
    activityQueryTimer = setTimeout(renderActivityFeed, 120);
  }
});
document.addEventListener("keydown", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "tester-input" && event.key === "Enter") {
    event.preventDefault();
    runCommandTest();
    return;
  }
  const list = pathListFor(input.dataset.pathInput);
  if (!list || event.key !== "Enter")
    return;
  event.preventDefault();
  list.add(input.value);
});
document.addEventListener("paste", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  const list = pathListFor(input.dataset.pathInput);
  if (!list)
    return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text.includes(\`
\`))
    return;
  event.preventDefault();
  list.add(\`\${input.value}
\${text}\`);
});
var writePolicy = async (path, body, failureStatus) => {
  const result = await requestJson(path, { method: "POST", body });
  if (isWriteSuccess(result))
    return result;
  setAppStatus(failureStatus, "error");
  setDetailStatus(\`Error: \${errorText(result)}\`, "error");
  return null;
};
var reloadAfterWrite = async () => {
  sessionStorage.removeItem("cc-safety-net-draft");
  if (!await load())
    return false;
  dirty = false;
  setDetailStatus("");
  return true;
};
var setProjectDraftDiagnostics = (messages) => {
  qs("project-draft-diagnostics").textContent = messages.join(\`
\`);
  qs("project-draft-diagnostics").hidden = messages.length === 0;
};
var renderProjectDraftBar = () => {
  qs("project-draft-enter").hidden = projectDraft !== null;
  qs("project-draft-bar").hidden = projectDraft === null;
  qs("save").textContent = projectDraft ? "Review & apply" : "Save";
  if (!projectDraft)
    return;
  qs("project-draft-path").textContent = projectDraft.path;
  qs("project-draft-change").hidden = !projectDraft.canPickDirectory;
};
var exitProjectDraft = () => {
  projectDraft = null;
  markedFields = new Set;
  setProjectDraftDiagnostics([]);
  if (state)
    draftPolicy = clonePolicy(state.policy);
  renderProjectDraftBar();
  renderPolicySections();
};
var ingestProjectState = async (okStatus) => {
  const result = await requestJson("/api/policy/project");
  if (!result.ok || !result.data) {
    setAppStatus("Project draft unavailable", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return false;
  }
  const seeded = seedProjectDraft(result.data);
  if (!seeded) {
    exitProjectDraft();
    await load();
    setAppStatus("Repair required", "error");
    setDetailStatus([
      "Error: repair your user policy before drafting a project policy.",
      ...Array.isArray(result.data.userPolicyDiagnostics) ? result.data.userPolicyDiagnostics : []
    ].join(\`
\`), "error");
    return false;
  }
  projectDraft = {
    dir: result.data.dir,
    path: result.data.path,
    revision: result.data.revision,
    canPickDirectory: result.data.canPickDirectory === true,
    baseline: seeded.baseline,
    snapshot: seeded.snapshot
  };
  markedFields = seeded.marked;
  draftPolicy = seeded.policy;
  setProjectDraftDiagnostics(Array.isArray(result.data.projectionDiagnostics) ? result.data.projectionDiagnostics : []);
  renderProjectDraftBar();
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus(okStatus, "ok");
  return true;
};
var enterProjectDraft = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length) {
    setAppStatus("Repair required", "error");
    setDetailStatus("Error: repair your user policy before drafting a project policy.", "error");
    return;
  }
  if (dirty) {
    if (!await confirmDialog({
      title: "Discard unsaved policy changes?",
      body: "A project draft starts from your saved user policy. Save your changes first, or discard them here.",
      confirmLabel: "Discard changes",
      confirmClass: ""
    }))
      return;
    sessionStorage.removeItem("cc-safety-net-draft");
    if (!await load())
      return;
  }
  await ingestProjectState("Drafting a project policy.");
};
var confirmDiscardProjectDraft = async (body) => !dirty || await confirmDialog({
  title: "Discard this project draft?",
  body,
  confirmLabel: "Discard draft",
  confirmClass: ""
});
var changeProjectDirectory = async () => {
  if (!await confirmDiscardProjectDraft("Switching projects discards this draft."))
    return;
  const result = await requestJson("/api/policy/project/choose-directory", { method: "POST" });
  if (!result.ok) {
    setAppStatus("Could not open the folder picker", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return;
  }
  if (result.data.error) {
    setAppStatus(result.data.error, "error");
    return;
  }
  if (result.data.cancelled)
    return;
  await ingestProjectState("Drafting a project policy.");
};
var leaveProjectDraft = async () => {
  if (!await confirmDiscardProjectDraft("The fields you marked are not written anywhere yet."))
    return;
  exitProjectDraft();
  if (await load())
    setAppStatus("Left the project draft.", "ok");
};
var discardProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft)
    return;
  if (!await confirmDialog({
    title: "Discard changes to this draft?",
    body: "The draft returns to the fields this project already sets.",
    confirmLabel: "Discard changes",
    confirmClass: ""
  }))
    return;
  const snapshot = JSON.parse(draft.snapshot);
  markedFields = new Set(projectMarkedFields(snapshot));
  draftPolicy = overlayProjectProposal(draft.baseline, snapshot);
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus("Changes discarded.", "ok");
};
var handleStaleProjectDraft = async () => {
  if (!await ingestProjectState("Project draft reloaded."))
    return;
  setAppStatus("Project target changed", "error");
  setDetailStatus("Error: the project directory changed, so this draft was reloaded for the new target. Review it again before applying.", "error");
};
var projectDiffHtml = (data) => {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const warnings = [
    ...data.existingFileDiagnostics?.length ? ["The existing project policy file is invalid and will be replaced."] : [],
    ...data.weakenings ?? []
  ];
  const table = rows.length === 0 ? '<p class="empty">No change to the effective policy.</p>' : \`<table class="diff-table"><thead><tr><th>Setting</th><th>Now</th><th>After</th></tr></thead><tbody>\${rows.map((row) => \`<tr><td><code>\${escapeHtml(row.field)}</code></td><td class="diff-before">\${escapeHtml(row.before ?? "(unset)")}</td><td class="diff-after">\${escapeHtml(row.after ?? "(unset)")}</td></tr>\`).join("")}</tbody></table>\`;
  return table + warnings.map((text) => \`<p class="diff-warning">\${escapeHtml(text)}</p>\`).join("");
};
var reviewProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft)
    return;
  const proposal = collectProjectProposal(markedFields, draftPolicy);
  const serialized = JSON.stringify(proposal);
  const body = JSON.stringify({ revision: draft.revision, proposal });
  const diff = await requestJson("/api/policy/project/diff", { method: "POST", body });
  if (projectDraft !== draft)
    return;
  if (diff.status === 409) {
    await handleStaleProjectDraft();
    return;
  }
  if (!diff.ok) {
    setAppStatus("Review failed", "error");
    setDetailStatus(\`Error: \${errorText(diff)}\`, "error");
    return;
  }
  if (JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== serialized) {
    setAppStatus("Review again", "error");
    setDetailStatus("Error: the draft changed while the review was loading. Review it again.", "error");
    return;
  }
  if (!await confirmDialog({
    title: "Apply this project policy?",
    body: "Everyone who works in this project gets these changes on top of their own user policy.",
    detail: draft.path,
    rowsHtml: projectDiffHtml(diff.data),
    confirmLabel: "Apply project policy",
    confirmClass: "primary"
  }))
    return;
  await runExclusive("Applying...", async () => {
    const applied = await requestJson("/api/policy/project/apply", { method: "POST", body });
    if (applied.status === 409) {
      await handleStaleProjectDraft();
      return;
    }
    if (!isWriteSuccess(applied)) {
      setAppStatus("Apply failed", "error");
      setDetailStatus(\`Error: \${errorText(applied)}\`, "error");
      return;
    }
    const path = applied.data.path;
    exitProjectDraft();
    if (await load())
      setAppStatus(\`Applied \${path}.\`, "ok");
  });
};
var saveRetentionDays = async (days) => {
  const saved = state;
  if (!saved)
    return;
  const current = saved.policy.audit.retention_days;
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus(\`Error: retention must be a whole number of days from 1 to \${MAX_RETENTION_DAYS}.\`, "error");
    return;
  }
  if (days === current)
    return;
  if (projectDraft) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus("Error: exit or apply your project draft first.", "error");
    return;
  }
  if (dirty) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus("Error: save or discard your unsaved Policy changes first.", "error");
    return;
  }
  if (days < current && !await confirmDialog({
    title: \`Shorten retention to \${dayCount(days)}?\`,
    body: \`Audit entries older than \${dayCount(days)} are deleted on the next sweep and cannot be recovered. The Activity tab will only look back \${dayCount(days)}.\`,
    detail: overview?.logsDir ?? "",
    confirmLabel: "Shorten",
    confirmClass: "danger"
  })) {
    qs("retention-days").value = String(current);
    return;
  }
  await runExclusive("Saving...", async () => {
    const policy = clonePolicy(saved.policy);
    policy.audit.retention_days = days;
    if (!await writePolicy("/api/policy", JSON.stringify(policy), "Save failed")) {
      qs("retention-days").value = String(current);
      return;
    }
    if (!await load())
      return;
    activityFilters.days = Math.min(activityFilters.days, days);
    await Promise.all([loadOverview(), loadActivity()]);
    setAppStatus(\`Retention set to \${dayCount(days)}.\`, "ok");
    setDetailStatus("");
  });
};
document.addEventListener("change", (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement))
    return;
  if (control.id === "activity-days") {
    activityFilters.days = Number(control.value);
    loadActivity();
    return;
  }
  if (control.id === "retention-days") {
    saveRetentionDays(Number(control.value));
    return;
  }
  if (control.name === "safety-level") {
    draftPolicy.safety.level = control.value;
    markProjectField("safety.level");
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (control.dataset?.safetyOverride) {
    if (control.value === "inherit" && !projectDraft)
      delete draftPolicy.safety.overrides[control.dataset.safetyOverride];
    if (control.value === "true")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = true;
    if (control.value === "false")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = false;
    if (control.value === "inherit")
      unmarkProjectField(\`safety.overrides.\${control.dataset.safetyOverride}\`);
    if (control.value !== "inherit")
      markProjectField(\`safety.overrides.\${control.dataset.safetyOverride}\`);
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  const input = control instanceof HTMLInputElement ? control : null;
  if (!input)
    return;
  if ("workflowWorktree" in input.dataset) {
    draftPolicy.workflow.worktree_mode = input.checked;
    markProjectField("workflow.worktree_mode");
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if ("destructiveCommandEnabled" in input.dataset) {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable destructive command protection?",
        body: "Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.",
        detail: "Custom rules remain active."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      markProjectField("destructive_command_protection.enabled");
      syncMasterBadges();
      pathLists["allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveTierActive) {
    const effectiveState = preview;
    if (!effectiveState)
      return;
    state?.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === input.dataset.destructiveTierActive).forEach((rule) => {
      setDestructiveOverride(rule.id, input.checked, effectiveState.rules[rule.id]?.inheritedEnabled);
    });
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    setDestructiveOverride(ruleId, input.checked, preview?.rules[ruleId]?.inheritedEnabled);
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.secretGroupActive) {
    state?.secretPatterns.filter((rule) => rule.category === input.dataset.secretGroupActive).forEach((rule) => {
      setSecretOverride(rule, input.checked);
    });
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.dataset?.secretActive) {
    const rule = state?.secretPatterns.find((item) => item.id === input.dataset.secretActive);
    if (!rule)
      return;
    setSecretOverride(rule, input.checked);
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.id === "secret-enabled") {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable secret protection?",
        body: "Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      markProjectField("secret_protection.enabled");
      syncMasterBadges();
      renderSecretPatterns();
      pathLists["deny-paths"].render();
      pathLists["secret-allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener("click", (event) => {
  const target = targetElement(event);
  if (!target)
    return;
  if (target.closest("#tester-run")) {
    runCommandTest();
    return;
  }
  if (target.closest("#project-draft-enter")) {
    enterProjectDraft();
    return;
  }
  if (target.closest("#project-draft-change")) {
    changeProjectDirectory();
    return;
  }
  if (target.closest("#project-draft-exit")) {
    leaveProjectDraft();
    return;
  }
  const unmarkButton = target.closest("[data-unmark-field]");
  if (unmarkButton) {
    unmarkProjectField(unmarkButton.dataset.unmarkField ?? "");
    return;
  }
  const createRule = target.closest("[data-create-rule]");
  if (createRule) {
    openRuleComposer(createRule.dataset.createRule ?? "");
    return;
  }
  const feedToggle = target.closest("[data-feed-toggle]");
  if (feedToggle) {
    const command = feedToggle.previousElementSibling;
    if (!command)
      return;
    const expanded = command.classList.toggle("expanded");
    feedToggle.setAttribute("aria-expanded", String(expanded));
    feedToggle.textContent = expanded ? "Show less" : "Show more";
    return;
  }
  const feedCopy = target.closest("[data-log-copy]");
  if (feedCopy) {
    copyFeedEntry(feedCopy);
    return;
  }
  const feedReport = target.closest("[data-report-fp]");
  if (feedReport) {
    openReportDialog(feedReport);
    return;
  }
  const blockFuture = target.closest("[data-block-future]");
  if (blockFuture) {
    const entry = renderedFeedEntries[Number(blockFuture.dataset.blockFuture)];
    if (entry?.segment || entry?.command)
      openRuleComposer(entry.segment || entry.command || "");
    return;
  }
  const topRule = target.closest(".top-rule");
  if (topRule) {
    const ruleId = topRule.dataset.ruleId ?? "";
    (ruleId.startsWith("custom.") ? jumpToRulesRule : jumpToActivityRule)(ruleId);
    return;
  }
  const ruleActivity = target.closest("[data-rule-activity]");
  if (ruleActivity) {
    jumpToActivityRule(ruleActivity.dataset.ruleActivity ?? "");
    return;
  }
  const jumpRule = target.closest("[data-jump-rule]");
  if (jumpRule) {
    qs("policy-search").value = jumpRule.dataset.jumpRule ?? "";
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    location.hash = "policy";
    return;
  }
  const jumpCustom = target.closest("[data-jump-custom-rule]");
  if (jumpCustom) {
    jumpToRulesRule(jumpCustom.dataset.jumpCustomRule ?? "");
    return;
  }
  const topCommand = target.closest(".top-command");
  if (topCommand) {
    activityFilters.command = topCommand.dataset.command ?? "";
    activityFilters.decision = "deny";
    activityFilters.query = "";
    qs("activity-search").value = "";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  if (target.closest("[data-clear-command]")) {
    clearCommandFilter();
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#guard-errors")) {
    clearCommandFilter();
    activityFilters.decision = "error";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  const chip = target.closest("[data-activity-chip]");
  if (chip && activity) {
    clearCommandFilter();
    activityFilters[chip.dataset.activityChip] = chip.dataset.chipValue ?? "";
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#activity-refresh")) {
    refreshActivity();
    return;
  }
  if (target.closest("#integrations-refresh")) {
    refreshIntegrations();
    return;
  }
  if (target.closest("#rules-refresh")) {
    refreshRules();
    return;
  }
  const scopeChip = target.closest("[data-rules-scope]");
  if (scopeChip) {
    setRulesScope(scopeChip.dataset.rulesScope ?? "");
    return;
  }
  const exampleChip = target.closest("[data-rules-example]");
  if (exampleChip) {
    qs("rules-composer-input").value = exampleChip.dataset.rulesExample ?? "";
    return;
  }
  if (target.closest("#rules-choose-directory")) {
    chooseProjectDirectory();
    return;
  }
  if (target.closest("#rules-copy-prompt")) {
    copyRulePrompt();
    return;
  }
  const integrationButton = target.closest("[data-integration-action]");
  if (integrationButton) {
    runIntegrationAction(integrationButton);
    return;
  }
  const ruleExampleButton = target.closest("[data-rule-example]");
  if (ruleExampleButton) {
    openRuleExample(ruleExampleButton);
    return;
  }
  const secretPathsButton = target.closest("[data-secret-paths]");
  if (secretPathsButton) {
    openSecretPaths(secretPathsButton);
    return;
  }
  const tierButton = target.closest("[data-tier-toggle]");
  if (tierButton) {
    const tier = tierButton.dataset.tierToggle ?? "";
    const expanded = tierButton.getAttribute("aria-expanded") === "true";
    tierExpanded.set(tier, !expanded);
    if (searchActive && expanded)
      searchCollapsedTiers.add(tier);
    if (!expanded)
      searchCollapsedTiers.delete(tier);
    renderDestructiveCommands();
    return;
  }
  const secretGroupButton = target.closest("[data-secret-group-toggle]");
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle ?? "";
    const expanded = secretGroupButton.getAttribute("aria-expanded") === "true";
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded)
      searchCollapsedSecretGroups.add(category);
    if (!expanded)
      searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  if (target.closest("[data-secret-group-active], [data-destructive-tier-active]"))
    return;
  const button = target.closest(".panel-toggle, .rule-tier-head");
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = target.closest("[data-use-inherited]");
  if (inheritedButton) {
    const ruleId = inheritedButton.dataset.useInherited ?? "";
    if (projectDraft) {
      unmarkProjectField(\`destructive_command_protection.overrides.\${ruleId}\`);
      return;
    }
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (target.closest("#reset-rule-customizations")) {
    if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in destructive-command rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      clearProjectOverrideMarks("destructive_command_protection");
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#reset-secret-customizations")) {
    if (Object.keys(draftPolicy.secret_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in secret rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      clearProjectOverrideMarks("secret_protection");
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.secret_protection.overrides = {};
      renderSecretPatterns();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#discard-changes")) {
    if (projectDraft) {
      discardProjectDraft();
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Discard unsaved changes?",
        body: "All changes since your last save will be reverted.",
        confirmLabel: "Discard changes",
        confirmClass: ""
      }))
        return;
      runExclusive("Discarding...", async () => {
        sessionStorage.removeItem("cc-safety-net-draft");
        if (await load())
          setAppStatus("Changes discarded.", "ok");
      });
    })();
    return;
  }
  const addButton = target.closest("[data-path-add]");
  if (addButton) {
    const list = pathListFor(addButton.dataset.pathAdd);
    if (list)
      list.add(qs(\`\${addButton.dataset.pathAdd}-input\`).value);
    return;
  }
  const removeButton = target.closest("[data-path-remove]");
  if (removeButton)
    pathListFor(removeButton.dataset.pathList)?.remove(Number(removeButton.dataset.pathRemove));
  const starButton = target.closest(".star-cta");
  if (starButton instanceof HTMLButtonElement) {
    starRepo(starButton);
    return;
  }
});
qs("dirty-chip").onclick = () => {
  location.hash = "policy";
};
qs("save").onclick = () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length) {
    setAppStatus("Repair required", "error");
    setDetailStatus("Error: Repair policy before saving changes.", "error");
    return;
  }
  if (projectDraft) {
    reviewProjectDraft();
    return;
  }
  if (!dirty) {
    setAppStatus("No changes to save", "ok");
    setDetailStatus("");
    return;
  }
  const policy = collectFormPolicy();
  runExclusive("Saving...", async () => {
    const result = await writePolicy("/api/policy", JSON.stringify(policy), "Save failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Saved \${result.data.path}.\`, "ok");
  });
};
qs("repair").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus("");
    setDetailStatus("");
    return;
  }
  if (!await confirmDialog({
    title: "Repair policy?",
    body: "This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.",
    detail: state.path,
    confirmLabel: "Repair",
    confirmClass: "primary"
  })) {
    return;
  }
  runExclusive("Repairing...", async () => {
    const result = await writePolicy("/api/repair", "{}", "Repair failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Repaired \${result.data.path}.\`, "ok");
  });
};
qs("reset").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (projectDraft) {
    setAppStatus("Reset unavailable", "error");
    setDetailStatus("Error: exit or apply your project draft first.", "error");
    return;
  }
  if (!await confirmDialog({
    title: "Reset policy?",
    body: "This will restore the default policy JSON at this path.",
    detail: state.path,
    confirmLabel: "Reset policy"
  })) {
    return;
  }
  runExclusive("Resetting...", async () => {
    const result = await writePolicy("/api/reset", "{}", "Reset failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Reset \${result.data.path} to defaults.\`, "ok");
  });
};
setRawCopyCopied(false);
qs("raw-copy").onclick = () => {
  copyRawToClipboard();
};
var themeOrder = ["auto", "light", "dark"];
var themeIcons = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'
};
var themeLabels = { auto: "Auto", light: "Light", dark: "Dark" };
var applyTheme = (pref) => {
  document.documentElement.style.colorScheme = pref === "auto" ? "light dark" : pref;
  qs("theme-toggle").innerHTML = \`\${themeIcons[pref]}<span>\${themeLabels[pref]}</span>\`;
  qs("theme-toggle").setAttribute("aria-label", \`Color theme: \${themeLabels[pref]}. Click to change.\`);
};
var themePref = themeOrder.includes(localStorage.getItem("cc-safety-net-theme")) ? localStorage.getItem("cc-safety-net-theme") : "auto";
applyTheme(themePref);
qs("theme-toggle").onclick = () => {
  themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length] ?? "auto";
  if (themePref === "auto")
    localStorage.removeItem("cc-safety-net-theme");
  else
    localStorage.setItem("cc-safety-net-theme", themePref);
  applyTheme(themePref);
};
window.addEventListener("beforeunload", (event) => {
  if (!dirty)
    return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("hashchange", applyView);
applyView();
loadHealth();
load().then((loaded) => {
  if (loaded)
    loadStarContext();
  activityFilters.days = Math.min(activityFilters.days, retentionDays());
  loadOverview();
  loadActivity();
}).catch((error) => {
  setAppStatus("Load failed", "error");
  setDetailStatus(String(error), "error");
});

  </script>
</body>
</html>
`;var O2='<script id="ccsn-data" type="application/json">';function j2(a){return I2.replace(O2,()=>O2+JSON.stringify({token:a}).replaceAll("<","\\u003c"))}var ss="kenryu42/cc-safety-net",hw=`https://github.com/${ss}`,ua=1e4,yw=7,vw="The project draft directory changed; reload the draft before applying.",bw="audit settings are user scope only; remove the audit section from a project proposal";async function U2(a,p={}){let v=c({label:"gui",booleans:{noOpen:["--no-open"]}},a),w=p.log??console.log,k=p.error??console.error;if(v.errors.length>0){for(let G of v.errors)k(G);return k("Usage: cc-safety-net gui [--no-open]"),1}let M=await Lw(l(),p);if(w(`CC Safety Net policy GUI: ${M.url}`),!v.flags.noOpen)try{await(p.openBrowser??Dw)(M.url)}catch(G){k(`Failed to open browser: ${G instanceof Error?G.message:String(G)}`),k(`Open this URL manually: ${M.url}`)}if(p.keepAlive===!1)return await M.close(),0;return await Rw(M),0}async function Lw(a,p={}){let v=pw(24).toString("base64url"),w={dir:null,revision:0},k=mw((B,J)=>{ww(a,B,J,v,p,w)});await new Promise((B,J)=>{k.once("error",J),k.listen(0,"127.0.0.1",()=>{k.off("error",J),B()})});let G=`http://127.0.0.1:${k.address().port}`;return{origin:G,token:v,url:`${G}/?token=${encodeURIComponent(v)}`,close:()=>Ew(k)}}async function ww(a,p,v,w,k,M){let G=new URL(p.url??"/","http://127.0.0.1");if(p.method==="GET"&&G.pathname==="/favicon.ico"){v.writeHead(204,{"cache-control":"no-store"}),v.end();return}if(!Cw(p,G,w)){Pt(v,403,{error:"Forbidden"});return}if(p.method==="GET"&&G.pathname==="/"){$w(v,j2(w));return}if(p.method==="GET"&&G.pathname==="/api/policy"){let B=xt(a,k),J=O(a,ca(k));Pt(v,200,{...B,configState:Qe(J),...J.policyScopes?{projectPolicy:{path:L(k.cwd??process.cwd()),weakenings:J.policyScopes.weakenings}}:{},destructiveCommandRules:Q,secretPatterns:dt,version:jt(),preview:B.errors.length>0?null:ft(B.policy,a.env)});return}if(p.method==="POST"&&G.pathname==="/api/policy/preview"){let B=await jr(p);if(!B.ok){Pt(v,B.status,{errors:[B.error]});return}let J=Ct(a,B.value);Pt(v,J.errors.length>0?400:200,J);return}if(p.method==="POST"&&G.pathname==="/api/policy/explain"){let B=await jr(p);if(!B.ok){Pt(v,B.status,{errors:[B.error]});return}let J=B.value;if(J===null||typeof J.command!=="string"){Pt(v,400,{errors:["command must be a string"]});return}let se=z(J.policy,a.home);if(se.length>0){Pt(v,400,{errors:se});return}Pt(v,200,_w(a,J.command,J.policy,k));return}if(p.method==="POST"&&G.pathname==="/api/policy"){let B=await jr(p);if(!B.ok){Pt(v,B.status,{errors:[B.error]});return}let J=ne(a,B.value,k);Pt(v,J.errors.length>0?400:200,J);return}if(p.method==="POST"&&G.pathname==="/api/reset"){Pt(v,200,ne(a,Ce,k));return}if(p.method==="POST"&&G.pathname==="/api/repair"){Pt(v,200,St(a,k));return}if(p.method==="POST"&&G.pathname==="/api/policy/project/choose-directory"){let B=await(k.chooseDirectory??aa)();if("path"in B)M.dir=B.path,M.revision+=1;Pt(v,200,{cancelled:"cancelled"in B,..."error"in B?{error:B.error}:{}});return}if(p.method==="GET"&&G.pathname==="/api/policy/project"){let B=H2(M,k),J=N2(B,a.home),se=Tr(a,k);Pt(v,200,{dir:B,path:L(B),revision:M.revision,baseline:se.baseline,userPolicyDiagnostics:se.diagnostics,projection:J.projection,projectionDiagnostics:J.diagnostics,canPickDirectory:ia(process.platform,process.env)});return}if(p.method==="POST"&&G.pathname==="/api/policy/project/diff"){let B=await z2(a,p,v,M,k);if(!B)return;let J=N2(B.dir,a.home),se=Tr(a,k).baseline,ae=me(se,Se(B.proposal,a.home).policy);Pt(v,200,{rows:Bo(me(se,J.projection).policy,ae.policy,!1),weakenings:ae.weakenings,existingFileDiagnostics:J.diagnostics,errors:[]});return}if(p.method==="POST"&&G.pathname==="/api/policy/project/apply"){let B=await z2(a,p,v,M,k);if(!B)return;let J=kw(B.dir,B.proposal,a.home);Pt(v,J.errors.length>0?500:200,J);return}if(p.method==="GET"&&G.pathname==="/api/activity"){let B=ye(a,k),J=Sw(G.searchParams.get("days"),B);if(J===null){Pt(v,400,{error:`days must be an integer between 1 and ${B}`});return}Pt(v,200,R2(a,J,k.activityLogsDir));return}if(p.method==="POST"&&G.pathname==="/api/rules/choose-directory"){Pt(v,200,await aa());return}if(p.method==="GET"&&G.pathname==="/api/rules"){let B=fe(a,ca(k)),J=new Map(B.rules.map((se)=>[se.name,se]));Pt(v,200,{projectPath:k.cwd??process.cwd(),canPickDirectory:ia(process.platform,process.env),rulebooks:B.rulebooks.map((se)=>({source:se.source,spec:se.spec,name:se.name,version:se.version,rules:se.rules.flatMap((ae)=>{let ce=J.get(ae);if(!ce)return[];return[{name:ce.name,command:ce.command,subcommand:ce.subcommand,block_args:ce.block_args,reason:ce.reason}]})})),errors:B.errors,warnings:B.warnings});return}if(p.method==="GET"&&G.pathname==="/api/star/context"){Pt(v,200,await(k.fetchStarContext??(()=>jw(a,{logsDir:k.activityLogsDir})))());return}if(p.method==="POST"&&G.pathname==="/api/star"){let B=await(k.starRepo??Aw)();Pt(v,200,B.ok?{ok:!0}:{ok:!1,fallbackUrl:hw});return}if(p.method==="GET"&&G.pathname==="/api/integrations"){Pt(v,200,await(k.fetchIntegrations??(()=>Tw(a)))());return}if(p.method==="GET"&&G.pathname==="/api/health"){Pt(v,200,await(k.fetchHealth??(()=>Iw(a)))());return}if(p.method==="POST"&&(G.pathname==="/api/install"||G.pathname==="/api/uninstall")){let B=await jr(p);if(!B.ok){Pt(v,B.status,{errors:[B.error]});return}let J=B.value?.target;if(typeof J!=="string"||!an.some((ae)=>ae.target===J)){Pt(v,400,{error:"unknown target"});return}let se=G.pathname==="/api/install"?"install":"uninstall";Pt(v,200,await(k.runIntegration??Ow)(se,J));return}Pt(v,404,{error:"Not found"})}function ca(a){return{...a,cwd:a.cwd??process.cwd()}}function H2(a,p){return a.dir??p.cwd??process.cwd()}function N2(a,p){let v=L(a),w=fw(v)?Fn(v):{value:void 0,errors:[]},k=Se(w.value,p);return{projection:k.policy,diagnostics:[...w.errors,...k.diagnostics]}}async function z2(a,p,v,w,k){let M=H2(w,k),G=w.revision,B=await jr(p);if(!B.ok)return Pt(v,B.status,{errors:[B.error]}),null;let J=B.value;if(typeof J?.revision!=="number")return Pt(v,400,{errors:["revision must be a number"]}),null;if(J.revision!==G)return Pt(v,409,{errors:[vw]}),null;let se=xw(J.proposal,a.home);if(se.length>0)return Pt(v,400,{errors:se}),null;return{dir:M,proposal:J.proposal}}function xw(a,p){let v=z(a,p);if(v.length>0)return v;return a?.audit===void 0?[]:[bw]}function kw(a,p,v){let w=L(a),k=qo(p,m(p,v));try{return C(i(A(a,"project policy"),w),`${JSON.stringify(k,null,2)}
`),{path:w,errors:[]}}catch(M){return{path:w,errors:[M instanceof Error?M.message:String(M)]}}}function _w(a,p,v,w){let k=m(v,a.home),M=O(a,ca(w)),G=je({rules:M.policy.rules,transparentWrappers:M.policy.transparentWrappers,safety:Xe(k.safety),worktreeMode:k.workflow.worktree_mode,destructiveCommandProtectionEnabled:k.destructive_command_protection.enabled,destructiveCommandRuleOverrides:k.destructive_command_protection.overrides,destructiveCommandAllowPaths:k.destructive_command_protection.allow_paths,secretProtection:{enabled:k.secret_protection.enabled,disabledRules:Ye(k.secret_protection.overrides),denyPaths:k.secret_protection.deny_paths,allowPaths:k.secret_protection.allow_paths}});return Pr(p,{policySnapshot:G,cwd:w.cwd,userConfigDir:w.userConfigDir},a)}function Sw(a,p){if(a===null)return Math.min(yw,p);let v=Number(a);if(!Number.isInteger(v)||v<1||v>p)return null;return v}function Cw(a,p,v){if(p.searchParams.get("token")!==v)return!1;if(a.method!=="POST")return!0;return a.headers["x-cc-safety-net-token"]===v}var Pw=1048576;async function jr(a){let p=[],v=0;for await(let w of a){let k=w;if(v+=k.byteLength,v>Pw)return{ok:!1,status:413,error:"Request body is too large"};p.push(k)}try{return{ok:!0,value:JSON.parse(Buffer.concat(p).toString("utf-8")||"{}")}}catch(w){return{ok:!1,status:400,error:`Invalid JSON: ${w instanceof Error?w.message:String(w)}`}}}function $w(a,p){a.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}),a.end(p)}function Pt(a,p,v){a.writeHead(p,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),a.end(JSON.stringify(v))}function Ew(a){return new Promise((p,v)=>{a.close((w)=>w?v(w):p())})}function Rw(a){return new Promise((p)=>{let v=()=>{process.off("SIGINT",w),process.off("SIGTERM",w)},w=()=>{v(),a.close().then(p)};process.once("SIGINT",w),process.once("SIGTERM",w)})}function Dw(a){let p=process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open",v=process.platform==="win32"?["/c","start","",a]:[a];return new Promise((w,k)=>{let M=M2(p,v,{detached:!0,stdio:"ignore"}),G=(J)=>{M.off("spawn",B),k(J)},B=()=>{M.off("error",G),M.unref(),w()};M.once("error",G),M.once("spawn",B)})}async function Aw(a="gh",p=ua){return{ok:await la(a,["api","-X","PUT",`/user/starred/${ss}`],p)===0}}async function Tw(a,p={}){let v=await mr(p.fetcher),w=Z2(a,v);return{targets:W.map((k)=>{let M=w.find((G)=>G.platform===k.id);return{target:k.id,label:d(k.id),version:v.versions[k.id]??null,status:M?.configured?"active":M?.detected?"disabled":M?.inspectionStatus==="not-inspected"?"not-inspected":"not-installed"}}),system:{version:v.version,nodeVersion:v.nodeVersion,platform:v.platform}}}function Z2(a,p){return Yn(a,process.cwd(),{ampPluginListOutput:p.ampPluginListOutput,codexPluginListOutput:p.codexPluginListOutput,copilotCliVersion:p.versions["copilot-cli"]})}async function Iw(a,p={}){let[v,w]=await Promise.all([mr(p.fetcher),(p.checkUpdates??bn)()]);return{hooks:Z2(a,v).filter((k)=>k.detected).map((k)=>({platform:k.platform,label:d(k.platform),configured:k.configured})),update:{currentVersion:w.currentVersion,latestVersion:w.latestVersion??null,updateAvailable:w.updateAvailable}}}var F2=Promise.resolve();function Ow(a,p,v={}){let w=async()=>{let M=[],{log:G,error:B}=console;console.log=(...J)=>M.push(J.map(String).join(" ")),console.error=console.log;try{return{ok:await Ar(a,[],{selectTargets:async()=>[p],output:new gw({write(se,ae,ce){M.push(String(se).replace(/\n$/,"")),ce()}}),...v})===0,output:M.join(`
`)}}finally{console.log=G,console.error=B}},k=F2.then(w);return F2=k.then(()=>{return},()=>{return}),k}async function jw(a,p={}){let[v,w,k]=await Promise.all([Nw(p.command),zw(p.fetchRepo),Promise.resolve(Ur(a,ye(a),p.logsDir).totalBlocked)]);return{starred:v,starCount:w,blockedTotal:k}}async function Nw(a="gh",p=ua){if(await la(a,["auth","status"],p)!==0)return null;let v=await la(a,["api",`/user/starred/${ss}`],p);if(v===0)return!0;if(v===null)return null;return!1}function la(a,p,v){return new Promise((w)=>{let k=M2(a,p,{stdio:"ignore",windowsHide:!0}),M=!1,G,B=(J)=>{if(M)return;if(M=!0,G)clearTimeout(G);w(J)};k.once("error",()=>B(null)),k.once("close",B),G=setTimeout(()=>{k.kill(),B(null)},v)})}async function zw(a=fetch){try{let p=await a(`https://api.github.com/repos/${ss}`,{headers:{accept:"application/vnd.github+json"},signal:AbortSignal.timeout(ua)});if(!p.ok)return null;let v=await p.json();return typeof v.stargazers_count==="number"?v.stargazers_count:null}catch{return null}}function Fw(a){if(a[0]!=="help")return!1;let p=a[1];if(!p)Ti(),process.exit(0);if($r(p))process.exit(0);console.error(`Unknown command: ${p}`),console.error("Run 'cc-safety-net --help' for available commands."),process.exit(1)}var Mw={hook:async()=>{console.error("hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code"),$r("hook",console.error),process.exit(1)},install:async(a)=>{process.exit(await Ar("install",a))},update:async(a)=>{process.exit(await Vi(a))},uninstall:async(a)=>{process.exit(await Ar("uninstall",a))},rule:async(a)=>{process.exit(await P2(l(),a))},policy:async(a)=>{process.exit(await Hm(l(),a))},status:async(a)=>{if(oe(c({label:"status"},a).errors))process.exit(1);E2(l())},statusline:async(a)=>{let p=c({label:"statusline",booleans:{claudeCode:["-cc","--claude-code"]}},a);if(p.errors.length===0&&p.flags.claudeCode){await sa(l());return}if(oe(p.errors),!p.flags.claudeCode)console.error("statusline requires --claude-code (-cc)");$r("statusline",console.error),process.exit(1)},doctor:async(a)=>{let p=Si(a);if(!p)process.exit(1);let v=await wf(l(),{json:p.json,skipUpdateCheck:p.skipUpdateCheck});process.exit(v)},logs:async(a)=>{process.exit(await va(l(),a))},gui:async(a)=>{process.exit(await U2(a))},explain:async(a)=>{process.exit(await Df(l(),a))}};async function $5(a){let p=c({label:"cc-safety-net",booleans:{version:["-V","--version"]},positionals:"list"},a);if(Fw(a))return;let v=a[0],w=v?Mr(v):void 0;if(p.help&&w&&w.name!=="rule")$r(w.name),process.exit(0);if(!v||p.help&&!w)Ti(),process.exit(0);if(p.flags.version)If(),process.exit(0);if(w){await Mw[w.name](a.slice(1));return}if(v==="--statusline"){await sa(l());return}console.error(v.startsWith("-")?`Unknown option: ${v}`:`Unknown command: ${v}`),console.error("Run 'cc-safety-net --help' for usage."),process.exit(1)}export{$5 as runCli};
