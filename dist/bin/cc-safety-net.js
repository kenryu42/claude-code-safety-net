#!/usr/bin/env node
import{m,L,t,k,o,ue,n,v,Ce,Y,vt,bt,u,we,pe,at,G,ne,fe,b,lt,I,g,D,Ae,Ct,H,C,W,O,N,ct,s,re,i,e,oe,J,U,z,xe,R,a,ie,B,We,Ue,w,ye,dt,S,ze,Te,Ie,wt,l,r,Be,se,E,P,Le,ut,Ve,St,De,c,qe,Ke,ae,Oe,Ye,Je,Z,xt,Lt,kt,Ze,Rt,Ne,_,ke,X,pt,p,ft,mt,gt,h,ve,y,Et,Q,Pt,ht,_t,le,f,Xe,Qe,et,tt,nt,rt,be,V,M,Me,ot,Re,x,$e,Ee,d}from"../chunks/index-e7vaxtyk.js";import{je,it,A,yt,st,de,q,Pe,F,ee,K,T,te,_e,j}from"../chunks/index-sbw1h91k.js";var Lu=["-h","--help"];function Wt(ce,me){let ge=Object.entries(ce.booleans??{}),he=Object.entries(ce.values??{}),Se=Object.entries(ce.lists??{}),Fe=Object.fromEntries(ge.map(([jt])=>[jt,!1])),He={},Ge=Object.fromEntries(Se.map(([jt])=>[jt,[]])),Dt=[],At=[],Tt=!1,Ft=-1;for(let[jt,It]of me.entries()){if(jt<=Ft)continue;if(It==="--"){Dt.push(...me.slice(jt+1));break}if(Lu.includes(It)){Tt=!0;continue}let $t=ge.find(([,Gt])=>Gt.includes(It));if($t){Fe[$t[0]]=!0;continue}let Ot=he.find(([,Gt])=>Gt.includes(It));if(Ot){let Gt=me[jt+1];if(Gt===void 0||Gt.startsWith("-")){At.push(`${It} requires a value`);continue}He[Ot[0]]=Gt,Ft=jt+1;continue}let Ut=Se.find(([,Gt])=>Gt.includes(It));if(Ut){let Gt=me.slice(jt+1),Nt=Gt.findIndex((Mt)=>Mt.startsWith("-")),Vt=Gt.slice(0,Nt===-1?Gt.length:Nt);if(Vt.length===0){At.push(`${It} requires at least one value`);continue}Ge[Ut[0]]=[...Ge[Ut[0]]??[],...Vt],Ft=jt+Vt.length;continue}if(It.startsWith("-")){At.push(`Unknown option for ${ce.label}: ${It}`);continue}if(ce.positionals==="tail"){Dt.push(...me.slice(jt));break}Dt.push(It)}if(ce.positionals!=="list"&&ce.positionals!=="tail")At.push(...Dt.map((jt)=>`Unexpected argument for ${ce.label}: ${jt}`));return{flags:Fe,values:He,lists:Ge,positionals:Dt,help:Tt,errors:At}}function vn(ce){for(let me of ce)console.error(me);return ce.length>0}import{readdirSync as wp,statSync as js,unlinkSync as kp}from"node:fs";import{basename as Ns,dirname as xp,isAbsolute as Cp,join as Sp,relative as Rp,resolve as Pp,sep as Dp}from"node:path";function en(ce){return Array.from(ce,(me)=>{let ge=me.charCodeAt(0);if(ge<=31||ge>=127&&ge<=159)return`\\x${ge.toString(16).padStart(2,"0")}`;return me}).join("")}var $o=(ce)=>{let me=Date.now()-new Date(ce).getTime();if(!Number.isFinite(me))return"";let ge=Math.floor(me/60000),he=Math.floor(ge/60),Se=Math.floor(he/24);if(Se>0)return`${Se}d ago`;if(he>0)return`${he}h ago`;if(ge>0)return`${ge}m ago`;return"just now"},Gn=(ce)=>{let me=(ce??"").trim().split(/\s+/).filter((Se)=>Se&&!/^[A-Za-z_][A-Za-z0-9_]*=/.test(Se)),ge=me[0]?.split("/").pop();if(!ge)return null;let he=me[1];return he&&/^[a-z][a-z0-9-]*$/.test(he)?`${ge} ${he}`:ge};import{existsSync as wu,readdirSync as ku,readFileSync as xu}from"node:fs";import{join as Cu}from"node:path";function kn(ce,me){try{return ku(ce,{withFileTypes:!0,encoding:"utf8"}).flatMap((ge)=>{let he=Cu(ce,ge.name);if(ge.isDirectory())return kn(he,me);if(ge.name.endsWith(".jsonl"))return[he];return[]})}catch{if(me&&wu(ce))me.count++;return[]}}function Oo(ce){let me=(Se)=>`${Se.sessionId}
${Gn(Se.segment||Se.command)}`,ge=ce.filter((Se)=>Se.decision!=="allow"),he=ge.filter((Se)=>Se.sessionId).reduce((Se,Fe)=>Se.set(me(Fe),(Se.get(me(Fe))??0)+1),new Map);return new Set(ge.filter((Se)=>Se.failureStage||(he.get(me(Se))??0)>=2))}var Su=["segment","reason","sessionId","decision","agent","ruleId","failureStage"];function Ru(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return!1;let me=ce;if(typeof me.ts!=="string"||typeof me.command!=="string")return!1;return Su.every((ge)=>me[ge]===void 0||typeof me[ge]==="string")}function Dn(ce,me){try{return xu(ce,"utf-8").split(`
`).filter(Boolean).flatMap((ge)=>{try{let he=JSON.parse(ge);if(!Ru(he)){if(me)me.count++;return[]}return[he]}catch{if(me)me.count++;return[]}})}catch{if(me)me.count++;return[]}}import{resolve as up}from"node:path";var Pu=["AKIA","ASIA","ghp_","gho_","ghu_","ghs_","ghr_","github_pat_","glpat-","xox","npm_","pypi-","rk_","sk-","sk_","gsk_","xai-","pplx-","bastn_","tgp_v1_","flp_","wfr_","fw_","fwp_","tp-","psk-"];function fs(ce){let me=0,ge={allocateSegment(){return me++},getNextSegmentIndex(){return me},recordGlobal(he){ce.record({kind:"step",scope:"global",step:he})},recordSegment(he,Se=ge.currentSegmentIndex){if(Se===void 0)return;ce.record({kind:"step",scope:"segment",segmentIndex:Se,step:he})}};return ge}function ms(ce={}){let me=[],ge=ce.maxEvents??512,he={maxTextLength:ce.maxTextLength??2048,maxListLength:ce.maxListLength??128,maxObjectProperties:ce.maxObjectProperties??ce.maxListLength??128,maxDepth:ce.maxDepth??16},Se=0,Fe,He=new Set;return{record(Ge){if(Fe)return;try{if(!Ge||me.length>=ge){Se++;return}me.push(jo(Du(Ge,he,He)))}catch{Se++}},finish(Ge){if(Fe)return Fe;try{Fe=jo({events:Object.freeze(me),droppedEvents:Se,terminal:Au(Ge,he,He)})}catch{Se++,Fe=Object.freeze({events:Object.freeze(me),droppedEvents:Se,terminal:Object.freeze({result:"blocked",reason:"trace unavailable".slice(0,he.maxTextLength),segment:"trace unavailable".slice(0,he.maxTextLength)})})}return Fe}}}function Du(ce,me,ge){if(ce.kind!=="step")throw TypeError("invalid trace event");let{scope:he,step:Se}=ce;$r(Se,ge,me);let Fe=Bn(Se,me,ge);if(he==="global")return{kind:"step",scope:"global",step:Fe};if(he!=="segment")throw TypeError("invalid trace event scope");return{kind:"step",scope:"segment",segmentIndex:ce.segmentIndex,step:Fe}}function Au(ce,me,ge){let he=ce.result;if(he==="allowed")return Object.freeze({result:"allowed"});if(he!=="blocked")throw TypeError("invalid trace terminal");let Se=ce.ruleId;return Object.freeze({result:"blocked",reason:Bn(ce.reason,me,ge),segment:Bn(ce.segment,me,ge),...Se?{ruleId:Bn(Se,me,ge)}:{}})}function $r(ce,me,ge,he=0,Se=new WeakSet){if(typeof ce==="string"){let Ge=ce.slice(0,ge.maxTextLength);if(!st(Ge))return;for(let Dt of yt(Ge))for(let At of Dt.match(/[^\s"'()$]+/g)??[])me.add(gs(At));return}if(!ce||typeof ce!=="object"||he>=ge.maxDepth||Se.has(ce))return;if(Se.add(ce),Array.isArray(ce)){let Ge=Math.min(ce.length,ge.maxListLength);for(let Dt=0;Dt<Ge;Dt++)$r(ce[Dt],me,ge,he+1,Se);return}let Fe=0,He=new Set;for(let Ge in ce){if(!Object.hasOwn(ce,Ge))continue;if(Fe>=ge.maxObjectProperties)break;Fe++,$r(Ge,me,ge);let Dt=Fo(Ge,ge,me);if(He.has(Dt))continue;He.add(Dt),$r(ce[Ge],me,ge,he+1,Se)}}function Bn(ce,me,ge,he=0,Se=new WeakSet){if(typeof ce==="string")return Fo(ce,me,ge);if(!ce||typeof ce!=="object")return ce;if(he>=me.maxDepth)return;if(Se.has(ce))return;if(Se.add(ce),Array.isArray(ce)){let Ge=[],Dt=Math.min(ce.length,me.maxListLength);for(let At=0;At<Dt;At++)Ge.push(Bn(ce[At],me,ge,he+1,Se));return Ge}let Fe={},He=0;for(let Ge in ce){if(!Object.hasOwn(ce,Ge))continue;if(He>=me.maxObjectProperties)break;He++;let Dt=Fo(Ge,me,ge);if(Object.hasOwn(Fe,Dt))continue;Object.defineProperty(Fe,Dt,{value:Bn(ce[Ge],me,ge,he+1,Se),enumerable:!0,configurable:!0,writable:!0})}return Fe}function Fo(ce,me,ge){let he=ce.slice(0,me.maxTextLength),Se=st(he)?it(he):he,Fe=ge.size>0?_u(Se,ge):Se;return(Eu(Fe)?je(Fe):Fe).slice(0,me.maxTextLength)}function Eu(ce){return ce.includes("PRIVATE KEY")||ce.includes("://")||ce.includes("eyJ")||ce.includes(":")&&/(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(ce)||ce.length>=14&&Pu.some((me)=>ce.includes(me))||ce.length>=49&&/\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(ce)}function _u(ce,me){return ce.replace(/[^\s"'()$]+/g,(ge)=>me.has(gs(ge))?"<redacted>":ge)}function gs(ce){let me=2166136261,ge=2166136261;for(let he=0;he<ce.length;he++)me=Math.imul(me^ce.charCodeAt(he),16777619),ge=Math.imul(ge^ce.charCodeAt(ce.length-he-1),16777619);return`${me>>>0}:${ge>>>0}:${ce.length}`}function jo(ce){if(ce&&typeof ce==="object"&&!Object.isFrozen(ce)){for(let me of Object.values(ce))jo(me);Object.freeze(ce)}return ce}function hs(ce,me,ge){let he=ge??dt(),Se=he.getCommandProgram(ce,me.shell??"auto"),Fe=ms(),He=fs(Fe),Ge=Se.dialect==="powershell"?he.getCommandProgram(ce,"posix"):Se,Dt=wt(Ge);He.recordGlobal({type:"parse",input:ce,segments:Dt.map((Ft)=>[...Ft])});let At=De(ce,{...me,analyzePartialProgram:!0,trace:He},Se,he),Tt=He.getNextSegmentIndex();if(At&&Tt>0&&Tt<Dt.length)He.recordSegment({type:"segment-skipped",index:Tt,reason:"prior-segment-blocked"},Tt);return Object.freeze({decision:At,trace:Fe.finish(At?{result:"blocked",reason:At.reason,segment:At.evidence.find((Ft)=>Ft.kind==="command")?.segment??ce,...At.ruleId?{ruleId:At.ruleId}:{}}:{result:"allowed"})})}import{resolve as Tu}from"node:path";function No(ce){let me=Rt().safeParse(ce);return{errors:me.success?[]:ke(me.error.issues),ruleNames:new Set(Ne(ce).map((ge)=>ge.toLowerCase()))}}function Ho(ce){let me=ys(ce);if(!me.ok)return me.result;return No(me.parsed)}function ys(ce){let me=[],ge=new Set;try{let he=typeof ce==="string"?ue(ce):ce,Se=n(he);if(Se===null)return me.push(`File not found: ${he.path}`),{ok:!1,result:{errors:me,ruleNames:ge}};if(!Se.trim())return me.push("Config file is empty"),{ok:!1,result:{errors:me,ruleNames:ge}};return{ok:!0,parsed:JSON.parse(Se)}}catch(he){if(he instanceof t)return me.push(he.message),{ok:!1,result:{errors:me,ruleNames:ge}};let Se=he instanceof Error?he.message:String(he);return me.push(he instanceof SyntaxError?"Invalid JSON":Se),{ok:!1,result:{errors:me,ruleNames:ge}}}}function vs(ce){return Tu(ce??process.cwd(),".safety-net.json")}function bn(ce){let me=ys(ce);if(!me.ok)return me.result;let ge=pt(me.parsed);return{errors:ge.errors,ruleNames:ge.sources}}import{join as Bo,resolve as qu}from"node:path";import{dirname as Fr}from"node:path";var Iu="custom.";function Or(ce){if(ce.rulebook_version!==2)return[];let me=ce.rules.map((ge)=>({name:ge.name,command:ge.command,block_args:[],match:ge.match,reason:ge.reason,intent:ge.intent}));return(ce.tests??[]).flatMap((ge,he)=>{let Se=Mo(R(ge.command));if(Se.length===0)return[`tests[${he}]: could not parse fixture command: ${ge.command}`];let Fe=Se.reduce((He,Ge)=>He??l(Ge,me)?.id.slice(Iu.length),void 0);if(ge.expect==="blocked"){if(Fe===ge.rule)return[];let He=Fe?`"${Fe}" matched first`:"no rule matched";return[`tests[${he}]: expected "${ge.rule}" to block "${ge.command}" but ${He}`]}return Fe?[`tests[${he}]: expected "${ge.command}" to be allowed but "${Fe}" matched`]:[]})}function Mo(ce){return ce.nodes.flatMap((me)=>{if(me.kind==="group"||me.kind==="function")return Mo(me.body);if(me.kind!=="command")return[];let ge=xe(oe(me.dialect,me.words)).words.map(e);return[...ge.length>0?[ge]:[],...me.nested.flatMap((he)=>Mo(he))]})}var $u=/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;function bs(ce,me){let ge=ks(ce.rules,me);if(ge.length>0)return{ok:!0,specs:ge};return ws(ce.rules,me)}function Ls(ce,me){let ge=ks(ce,me);if(ge.length>0)return{ok:!0,specs:ge};let he=Fu(ce,me);if(he.length>0)return{ok:!0,specs:he};let Se=ju(ce,me);if(!Se.ok)return Se;if(Se.specs.length>0)return{ok:!0,specs:Se.specs};return ws(ce,me)}function ws(ce,me){let ge=ce.filter((he)=>Uo(he)?.name===me);if(ge.length===1)return{ok:!0,specs:ge};return Ou(me,ge)}function Ou(ce,me){return{ok:!1,result:{ok:!1,errors:me.length===0?[`No configured rulebook matches ${ce}`]:[`Ambiguous rulebook match ${ce}: ${me.join(", ")}`],entries:[]}}}function ks(ce,me){return ce.filter((ge)=>ge===me)}function Fu(ce,me){let ge=me.match($u),he=ge?.[1],Se=ge?.[2],Fe=ge?.[3];if(!he||!Se||!Fe||!fe(Fe))return[];return xs(ce,(He)=>He.owner===he&&He.repo===Se&&He.ref===Fe)}function ju(ce,me){if(!ne(me))return{ok:!0,specs:[]};let[ge,he]=me.split("/"),Se=xs(ce,(He)=>He.owner===ge&&He.repo===he);if(new Set(Se.map((He)=>Uo(He)?.ref).filter((He)=>!!He)).size<2)return{ok:!0,specs:Se};return{ok:!1,result:{ok:!1,errors:[`Multiple refs are configured for ${me}. Use an explicit ref:`,`  cc-safety-net rule remove ${me}#<ref>`],entries:[]}}}function Uo(ce){try{return G(ce)}catch{return null}}function xs(ce,me){return ce.filter((ge)=>{let he=Uo(ge);return he?me(he):!1})}var Rs=Object.freeze({timeoutMs:15000,metadataBytes:524288,commitBytes:262144,treeBytes:16777216,rawBytes:4194304});async function Cs(ce,me,ge=k(Fr(Fr(me)),"rules policy"),he=Z()){if(b(ce))return Uu(ce,he);return Mu(ce,me,ge)}async function Ps(ce,me,ge,he,Se,Fe){if(!b(ce))return Cs(ce,me,ge,he);let He=Se?null:Nu(ce,me,ge);if(He)return He;if(!Se&&!Fe)throw Error(`${ce} is not vendored; run rule update ${ce} to vendor it`);return Cs(ce,me,ge,he)}function Nu(ce,me,ge=k(Fr(Fr(me)),"rules policy")){let he=G(ce),Se=W(me,he.name),Fe=n(o(ge,Se));if(Fe===null)return null;let He=be(Go(Fe,`Invalid rulebook ${Se}.`));if(He.name!==he.name)throw Error(`rulebook name "${He.name}" in ${Se} must match "${he.name}"`);return{spec:ce,rulebook:He,content:Fe}}async function Ds(ce,me={}){if(!ne(ce))throw Error(`Invalid GitHub repository source: ${ce}`);let[ge,he]=ce.split("/");if(!ge||!he)throw Error(`Invalid GitHub repository source: ${ce}`);if(me.ref!==void 0&&!fe(me.ref))throw Error(`GitHub rulebook refs must use valid path segments: ${me.ref}`);let Se=me.operation??Z(),Fe=me.ref??await Hu(ge,he,ce,Se),He=await Es(ge,he,Fe,ce,Se),Ge=await jr(`https://api.github.com/repos/${ge}/${he}/git/trees/${He}?recursive=1`,"tree",Se),Dt=Ge.response;if(!Dt.ok)throw Error(`Failed to inspect ${ce}: GitHub tree returned ${Dt.status}`);let At=JSON.parse(Ge.content);if(!Array.isArray(At?.tree))throw Error(`Failed to inspect ${ce}: unexpected GitHub tree response`);let Tt=At.tree,Ft=[...new Set(Tt.flatMap((jt)=>{if(!jt||typeof jt!=="object")return[];let It=jt;if(It.type!=="blob"||typeof It.path!=="string")return[];let $t=It.path.match(at);return $t?.[1]?[$t[1]]:[]}))].sort();if(Ft.length===0)throw Error(`No rulebooks found in ${ce} under ${pe}/`);return{source:ce,owner:ge,repo:he,ref:Fe,commit:He,names:Ft}}async function Hu(ce,me,ge,he){let Se=await jr(`https://api.github.com/repos/${ce}/${me}`,"metadata",he),Fe=Se.response;if(!Fe.ok)throw Error(`Failed to inspect ${ge}: GitHub returned ${Fe.status}`);let Ge=JSON.parse(Se.content)?.default_branch;if(typeof Ge!=="string"||Ge==="")throw Error(`Failed to inspect ${ge}: missing default branch`);if(!fe(Ge))throw Error(`GitHub returned an invalid default branch: ${Ge}`);return Ge}function Mu(ce,me,ge){lt(ce);let he=W(me,ce),Se=n(o(ge,he));if(Se===null)throw Error(`Rulebook source not found: ${ce}`);let Fe=As(Go(Se,"Invalid local rulebook source."));if(Fe.name!==ce)throw Error(`rulebook name "${Fe.name}" must match local source "${ce}"`);return{spec:ce,rulebook:Fe,content:Se}}async function Uu(ce,me){let ge=G(ce),he=await Es(ge.owner,ge.repo,ge.ref,ce,me),Se=await jr(`https://raw.githubusercontent.com/${ge.owner}/${ge.repo}/${he}/${ge.path}`,"raw",me),Fe=Se.response;if(!Fe.ok)throw Error(`Failed to fetch ${ce}: GitHub raw returned ${Fe.status}`);let He=Se.content,Ge=As(Go(He,"Invalid GitHub rulebook response."));if(Ge.name!==ge.name)throw Error(`rulebook name "${Ge.name}" must match GitHub source "${ge.name}"`);return{spec:ce,rulebook:Ge,content:He}}function As(ce){let me=be(ce),ge=Or(me);if(ge.length>0)throw Error(ge.join("; "));return me}function Go(ce,me){try{return JSON.parse(ce)}catch{throw Error(me)}}async function Es(ce,me,ge,he,Se){let Fe=await jr(`https://api.github.com/repos/${ce}/${me}/commits/${encodeURIComponent(ge)}`,"commit",Se),He=Fe.response;if(!He.ok)throw Error(`Failed to resolve ${he}: GitHub returned ${He.status}`);let Ge=JSON.parse(Fe.content);if(typeof Ge?.sha!=="string"||Ge.sha==="")throw Error(`Failed to resolve commit for ${he}`);return Ge.sha}async function Gu(ce,me,ge={}){if(ge.signal?.aborted)throw ge.signal.reason;let he=ge.budget??Je(),Se=new AbortController,Fe=()=>Se.abort(ge.signal?.reason);ge.signal?.addEventListener("abort",Fe,{once:!0});let He=!1,Ge=setTimeout(()=>{if(Se.signal.aborted)return;He=!0,Se.abort()},ge.timeoutMs??Rs.timeoutMs);try{if(ge.signal?.aborted)throw ge.signal.reason;Lt(he);let Dt=await(ge.fetch??fetch)(ce,{signal:Se.signal,redirect:"error"});if(!Dt.ok)return _s(Dt),{response:Dt,content:""};return{response:Dt,content:await Bu(Dt,me,he,()=>Se.abort())}}catch(Dt){if(He)throw Error("GitHub request timed out",{cause:Dt});if(ge.signal?.aborted)throw ge.signal.reason;throw Dt}finally{clearTimeout(Ge),ge.signal?.removeEventListener("abort",Fe)}}function jr(ce,me,ge){return Gu(ge.resolveUrl?.(ce)??ce,me,{budget:ge.budget,signal:ge.controller.signal})}async function Bu(ce,me,ge=Je(),he){let Se=Rs[`${me}Bytes`],Fe=Number(ce.headers.get("content-length"));if(Number.isFinite(Fe)&&Fe>Se)throw _s(ce),Error(`GitHub ${me} response exceeds ${Se} bytes`);if(!ce.body)return"";let He=ce.body.getReader(),Ge=[],Dt=0;while(!0){let At=await He.read();if(At.done)break;try{kt(ge,At.value.byteLength)}catch(Tt){throw he?.(),Ss(He),Tt}if(Dt+=At.value.byteLength,Dt>Se)throw he?.(),Ss(He),Error(`GitHub ${me} response exceeds ${Se} bytes`);Ge.push(Buffer.from(At.value))}return Buffer.concat(Ge,Dt).toString("utf-8")}function _s(ce){if(!ce.body)return;Ts(()=>ce.body?.cancel())}function Ss(ce){Ts(()=>ce.cancel())}function Ts(ce){try{Promise.resolve(ce()).catch(()=>{})}catch{}}async function cr(ce={}){let me=Vo(ce);return Vu(me,await Nr(me,Z()))}function Vu(ce,me){if(!me.ok)return me;let ge=C(ce),he=[...new Set(M(ge.configPath,ge.filesystemScope))];if(he.length===0)return me;return{ok:!1,errors:he,entries:me.entries}}async function Nr(ce,me,ge={},he=new Set,Se=new Set){try{let Fe=C(ce),He=ft(Fe.configTarget);if(!He.ok)return He.result;let Ge=He.config;if(ce.check)return ap(Ge,Fe,ce);let Dt=ce.only?bs(Ge,ce.only):{ok:!0,specs:Ge.rules};if(!Dt.ok)return Dt.result;let At=new Set([...ce.refresh?Dt.specs:[],...he]),Tt=(Mt)=>Ps(Mt,Fe.configDir,Fe.filesystemScope,me,At.has(Mt),!ce.refresh||At.has(Mt)),Ft=await np(Ge.rules,ce.refresh?(Mt)=>Tt(Mt).then((zt)=>({ok:!0,item:zt})).catch((zt)=>{if(xt(zt))throw zt;return{ok:!1,spec:Mt,message:zt instanceof Error?zt.message:String(zt)}}):async(Mt)=>({ok:!0,item:await Tt(Mt)}),me),jt=Ft.filter((Mt)=>!Mt.ok),It=Ft.filter((Mt)=>Mt.ok).map((Mt)=>Mt.item),$t=It.flatMap((Mt)=>zu(Mt,Ge.rules)),Ot=It.flatMap((Mt)=>Ku(Mt,Se,Fe)),Ut=new Set([...$t,...Ot].map((Mt)=>Mt.spec)),Gt=[...jt,...$t,...Ot],Nt=[],Vt=Wu(Nt,()=>It.flatMap((Mt)=>Ut.has(Mt.spec)||Gt.length>0&&Se.has(Mt.spec)?[]:Ju(Mt,Fe,ge,Nt)));return{ok:Gt.length===0,errors:Gt.map((Mt)=>`Failed to update ${Mt.spec}: ${Mt.message}`),entries:It.map(Zu),changes:Vt}}catch(Fe){return lr(Fe)}}function zu(ce,me){if(!b(ce.spec))return[];let ge=ot(ce.spec),he=me.filter((Se)=>Se!==ce.spec&&ot(Se).toLowerCase()===ge.toLowerCase());if(he.length===0)return[];return[{ok:!1,spec:ce.spec,message:`rulebook name "${ge}" is also claimed by ${he.join(", ")}; rename one of them`}]}function Ku(ce,me,ge){if(!me.has(ce.spec)||!b(ce.spec))return[];let he=W(ge.configDir,ce.rulebook.name),Se=n(o(ge.filesystemScope,he));if(Se===null||Se===ce.content)return[];return[{ok:!1,spec:ce.spec,message:`${he} already exists and no configured source claims it; remove or rename the file, then re-run rule add`}]}function Ju(ce,me,ge,he){if(!b(ce.spec))return[];let Se=W(me.configDir,ce.rulebook.name),Fe=o(me.filesystemScope,Se),He=n(Fe);if(He===ce.content)return[];return he?.push({target:Fe,previous:He}),v(Fe,ce.content,void 0,ge._testAfterPolicyRename),Yu(ce,He)}function Wu(ce,me){try{return me()}catch(ge){for(let he of[...ce].reverse()){if(he.previous===null){Y(he.target);continue}v(he.target,he.previous)}throw ge}}function Yu(ce,me){if(me===null)return[`Vendored ${ce.spec} (${ce.rulebook.version})`];let ge=Re(me),he="problem"in ge?null:ge.rulebook,Se=new Map(he?.rules.map((He)=>[He.name,JSON.stringify(He)])??[]),Fe=new Set(ce.rulebook.rules.map((He)=>He.name));return[`Updated ${ce.spec} (${he?.version??"unreadable"} -> ${ce.rulebook.version})`,...[...Fe].filter((He)=>!Se.has(He)).map((He)=>`  + ${He}`),...[...Se.keys()].filter((He)=>!Fe.has(He)).map((He)=>`  - ${He}`),...ce.rulebook.rules.filter((He)=>{let Ge=Se.get(He.name);return Ge!==void 0&&Ge!==JSON.stringify(He)}).map((He)=>`  ~ ${He.name}`)]}function Zu(ce){return{spec:ce.spec,name:ce.rulebook.name,version:ce.rulebook.version,ruleCount:ce.rulebook.rules.length}}async function qo(ce,me={}){return Xu(ce,op(me),Z())}async function Xu(ce,me,ge,he={}){let Se=null,Fe=!1;try{let He=C(me),Ge=n(He.configTarget);Se={target:He.configTarget,content:Ge};let Dt=ft(He.configTarget);if(!Dt.ok)return Dt.result;let At=Dt.config,Tt=ne(ce);Qu(ce,me,Tt);let Ft=Tt?await Ds(ce,{ref:me.ref,operation:ge}):null,jt=Ft?ep(Ft,me.rulebooks):[],It=Ft?jt.map((Nt)=>tp(At.rules,Ft,Nt)??`${ce}#${Ft.ref}/${Nt}`):[ce],$t=It.filter((Nt)=>!At.rules.includes(Nt)),Ot=[...At.rules,...$t];if(Ot.length>ae)return rp();if(Ot.length!==At.rules.length)Fe=!0,h(He.configTarget,{version:1,rules:Ot,overrides:At.overrides??{},transparent_wrappers:At.transparent_wrappers??[]},void 0,he._testAfterPolicyRename);let Ut=await Nr(me,ge,he,new Set($t),new Set($t));if(!Ut.ok)ar(He.configTarget,Ge);if(!Ut.ok||!Ft)return Ut;let Gt=jt.filter((Nt,Vt)=>$t.includes(It[Vt]??""));return{...Ut,add:{source:ce,ref:Ft.ref,selected:jt,added:Gt,alreadyConfigured:jt.filter((Nt)=>!Gt.includes(Nt)),commits:$t.length>0?[Ft.commit]:[]}}}catch(He){if(Fe&&Se)try{ar(Se.target,Se.content)}catch(Ge){return lr(Ge)}return lr(He)}}function Qu(ce,me,ge){if(!ge&&me.rulebooks!==void 0)throw Error("--only can only select rulebooks from an owner/repo source");if(!ge&&me.ref)throw Error(`--ref can only select a ref for an owner/repo source: ${ce}`);if(me.rulebooks?.length===0)throw Error("--only requires at least one rulebook name");let he=me.rulebooks?.filter((Se)=>!u.test(Se))??[];if(he.length>0)throw Error(`Invalid rulebook names: ${he.join(", ")}`)}function ep(ce,me){let ge=me?[...new Set(me)]:ce.names,he=ge.filter((Se)=>!ce.names.includes(Se));if(he.length>0)throw Error(`Rulebooks not found in ${ce.source} at ${ce.ref}: ${he.join(", ")}
Available rulebooks: ${ce.names.join(", ")}`);return ge}function tp(ce,me,ge){let he=`${me.source}#${me.ref}/${ge}`;if(ce.includes(he))return he;let Se=`${me.source}#${me.commit}/${ge}`;return ce.find((Fe)=>Fe===Se)}async function np(ce,me,ge=Z()){if(ce.length>ae)throw Error(Oe);let he=Array(ce.length),Se=0,Fe,He=Array.from({length:Math.min(ce.length,Ye.concurrency)},async()=>{while(!Fe){let Ge=Se;if(Ge>=ce.length)return;Se++;try{he[Ge]=await me(ce[Ge],Ge,ge.controller.signal)}catch(Dt){if(!Fe)Fe={value:Dt},Se=ce.length,ge.controller.abort(Dt);return}}});if(await Promise.all(He),Fe)throw Fe.value;return he}function rp(){return{ok:!1,errors:[Oe],entries:[]}}function Vo(ce){return{cwd:ce.cwd,userConfigDir:ce.userConfigDir,userConfigPath:ce.userConfigPath,projectConfigPath:ce.projectConfigPath,global:ce.global,check:ce.check,only:ce.only,refresh:ce.refresh}}function op(ce){return{...Vo(ce),ref:ce.ref,rulebooks:ce.rulebooks}}function ip(ce){return{...Vo(ce),deleteSource:ce.deleteSource}}async function zo(ce,me={}){try{return await sp(ce,ip(me),{})}catch(ge){return lr(ge)}}async function sp(ce,me,ge){let he=C(me),Se=p(he.configTarget);if(Se.errors.length>0)return{ok:!1,errors:Se.errors,entries:[]};if(!Se.config)return{ok:!1,errors:[`No config found at ${he.configPath}`],entries:[]};let Fe=Ls(Se.config.rules,ce);if(!Fe.ok)return Fe.result;let He=me.deleteSource?lp(he.configDir,Fe.specs,he.filesystemScope):{ok:!0,dirs:[]};if(!He.ok)return He.result;let Ge=n(he.configTarget);if(Ge===null)return lr(Error("Rules config is unavailable."));try{h(he.configTarget,{version:1,rules:Se.config.rules.filter((Tt)=>!Fe.specs.includes(Tt)),overrides:Se.config.overrides??{},transparent_wrappers:Se.config.transparent_wrappers??[]},void 0,ge._testAfterPolicyRename)}catch(Tt){throw ar(he.configTarget,Ge),Tt}let Dt=await Nr(me,Z(),ge);if(!Dt.ok)return ar(he.configTarget,Ge),Dt;let At=cp(He.dirs,ge,he.filesystemScope);if(!At.ok){ar(he.configTarget,Ge);let Tt=await Nr(me,Z(),ge);if(!Tt.ok)return{ok:!1,errors:[...At.result.errors,...Tt.errors],entries:Tt.entries};return At.result}return Dt}async function ap(ce,me,ge){let he=Me(ce,me.configDir,ge.global?"user":"project",me.filesystemScope);return{ok:he.errors.length===0&&he.warnings.length===0,errors:[...he.errors,...he.warnings],entries:he.entries}}function lp(ce,me,ge){let he=me.flatMap((Ge)=>u.test(Ge)?[]:["--delete-source can only delete local rulebook sources"]),Se=me.map((Ge)=>Bo(ce,Ge)),Fe=he.length>0?[]:Se.flatMap((Ge)=>Is(Ge,ge)),He=[...he,...Fe];return He.length>0?{ok:!1,result:{ok:!1,errors:He,entries:[]}}:{ok:!0,dirs:Se}}function Is(ce,me){let ge=qu(ce),he=o(me,ge),Se=Ce(he);if(!Se)return[`Local rulebook source directory not found: ${ce}`];let Fe=Se.find((He)=>He.name==="rulebook.json");if(!Fe)return[`Local rulebook source directory is missing rulebook.json: ${ce}`];if(Fe.kind!=="file")throw new t(me.label);if(n(o(me,Bo(ge,"rulebook.json"))),Se.length>1)return[`Local rulebook source directory contains extra files: ${ce}. delete manually if you really want to remove the directory.`];return[]}function cp(ce,me,ge){let he=ce.flatMap((Se)=>{try{if(!Ce(o(ge,Se)))return[];let Fe=Is(Se,ge);if(Fe.length>0)return Fe;return dp(Se,me,ge),[]}catch(Fe){return[`Failed to delete local rulebook source ${Se}: ${Fe instanceof Error?Fe.message:String(Fe)}`]}});return he.length>0?{ok:!1,result:{ok:!1,errors:he,entries:[]}}:{ok:!0}}function dp(ce,me,ge){if(me._testDeleteLocalSourceDir){me._testDeleteLocalSourceDir(ce);return}Y(o(ge,Bo(ce,we))),bt(o(ge,ce))}function ar(ce,me){if(me===null){Y(ce);return}v(ce,me)}function lr(ce){return{ok:!1,errors:[ce instanceof Error?ce.message:String(ce)],entries:[]}}function qn(ce,me){let ge=fp(me),he=Ve(ge),Se={effectiveLevel:he.effectiveLevel,selectedPreset:ge.policySnapshot.policy.safety.level??"standard",...ge.policySnapshot.policyScopes?{safetyPresetScope:ge.policySnapshot.policyScopes.levelScope}:{},effectiveCapabilities:he.effectiveCapabilities,destructiveCommandRuleOverrides:ge.policySnapshot.policy.destructiveCommandRuleOverrides},{configSource:Fe,configValid:He}=pp({cwd:me?.cwd,userConfigDir:me?.userConfigDir});if(!ce||!ce.trim())return{trace:{steps:[{type:"error",message:"No command provided"}],segments:[]},result:"allowed",configSource:Fe,configValid:He,...Se};let Ge=mp(ce,ge);if(Ge)return{trace:{steps:[],segments:[{index:0,steps:[{type:"rule-check",rule:Ge.rule,matched:!0,reason:Ge.reason}]}]},result:"blocked",reason:A(Ge.reason),segment:A(Ge.target),...Ge.ruleId?{ruleId:A(Ge.ruleId)}:{},configSource:Fe,configValid:He,...Se};let Dt=hs(ce,ge),At=Dt.decision,Tt=At?.ruleId??gp(ce,ge),Ft=J.find((It)=>It.id===Tt&&It.activationCapability),jt=Ft?he.policy.effectiveDestructiveCommandRules[Ft.id]:void 0;return{trace:yp(Dt.trace),result:At?"blocked":"allowed",reason:At?A(At.reason):void 0,segment:At?A(At.evidence.find((It)=>It.kind==="command")?.segment??ce):void 0,ruleId:At?.ruleId?A(At.ruleId):void 0,customRule:hp(vp(At?.ruleId,ge.policySnapshot)),configSource:Fe,configValid:He,...Se,...Ft&&jt?{ruleActivation:{id:Ft.id,...jt}}:{}}}function pp(ce){let me=I(ce?.cwd),ge=ce?.userConfigPath??D(ce),he=H({cwd:ce?.cwd,userConfigDir:ce?.userConfigDir,userConfigPath:ce?.userConfigPath});try{if(n(he.projectConfigTarget)!==null){if(bn(he.projectConfigTarget).errors.length===0)return{configSource:me,configValid:!0};return{configSource:me,configValid:!1}}}catch(Se){if(Se instanceof t)return{configSource:me,configValid:!1};throw Se}try{if(n(he.userConfigTarget)!==null){let Se=bn(he.userConfigTarget);return{configSource:ge,configValid:Se.errors.length===0}}return{configSource:null,configValid:!0}}catch(Se){if(Se instanceof t)return{configSource:ge,configValid:!1};throw Se}}function fp(ce){let me=up(ce?.cwd??process.cwd()),ge=ce?.policySnapshot??x({cwd:me,userConfigDir:ce?.userConfigDir}),he=E(ge.policy);return{cwd:me,effectiveCwd:me,policySnapshot:ge,environment:L(),protectedGitMetadata:Te([me]),effectiveCapabilities:he.capabilities,strict:ce?.strict??he.strict,paranoidRm:he.paranoidRm,paranoidInterpreters:he.paranoidInterpreters,worktreeMode:he.worktreeMode}}function mp(ce,me){let ge=me.cwd??process.cwd(),he=ye(c("",{command:ce},{kind:"command",shell:"posix"},{executionCwd:ge,configCwd:ge},ce)),Se=tt(he);if(Se)return{reason:et,target:Se.target,ruleId:"policy-protection",rule:"policy-protection:findPolicyConfigMutationTargetInSemanticFacts"};let Fe=Ke(he);if(Fe)return{reason:qe,target:Fe.target,ruleId:"policy-apply-protection",rule:"policy-apply-protection:findPolicyApplyInvocationInSemanticFacts"};let He=ze(he,me.protectedGitMetadata);if(He)return{reason:S,target:He.target,ruleId:"git-metadata-protection",rule:"git-metadata-protection:findGitMetadataMutationTargetInSemanticFacts"};let Ge=me.policySnapshot.policy,Dt=Ge.secretProtection.enabled===!1?null:rt(he,Ge.secretProtection,{strict:me.strict});if(Dt)return{reason:nt,target:Dt.target,ruleId:Dt.ruleId,rule:"secret-protection:findSensitiveTargetInSemanticFacts"};return null}function gp(ce,me){let ge=me.policySnapshot.policy,he=Ee({...ge,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:{...ge.destructiveCommandRuleOverrides,...Object.fromEntries(J.flatMap((Se)=>Se.activationCapability?[[Se.id,"on"]]:[]))}},me.policySnapshot.state==="degraded"?{diagnostics:me.policySnapshot.diagnostics,reason:me.policySnapshot.reason}:void 0);return St(ce,{...me,policySnapshot:he,strict:!0,paranoidRm:!0,paranoidInterpreters:!0})?.ruleId}function hp(ce){if(!ce)return;return{id:A(ce.id),...ce.rulebook?{rulebook:{name:A(ce.rulebook.name),version:A(ce.rulebook.version)}}:{},...ce.source?{source:A(ce.source)}:{},...ce.override?{override:{type:"reason",reason:A(ce.override.reason)}}:{}}}function yp(ce){let me=ce.events.flatMap((he)=>he.kind==="step"&&he.scope==="global"?[he.step]:[]),ge=new Map;for(let he of ce.events){if(he.kind!=="step"||he.scope!=="segment")continue;let Se=ge.get(he.segmentIndex)??{index:he.segmentIndex,steps:[]};Se.steps.push(he.step),ge.set(he.segmentIndex,Se)}return{steps:me,segments:[...ge.values()]}}function vp(ce,me){let ge=ce?.replace(/^custom\./,"");if(!ge||!me.policy.rules.some((he)=>he.name===ge))return;return me.ruleMetadata[ge]??Object.freeze({id:ge})}import{existsSync as Os,readFileSync as bp}from"node:fs";function $s(ce,me){return{"safety.level":ce.safety.level,...Ko("safety.overrides",ce.safety.overrides),"workflow.worktree_mode":String(ce.workflow.worktree_mode),"destructive_command_protection.enabled":String(ce.destructive_command_protection.enabled),...Ko("destructive_command_protection.overrides",ce.destructive_command_protection.overrides),"destructive_command_protection.allow_paths":Jo(ce.destructive_command_protection.allow_paths),"secret_protection.enabled":String(ce.secret_protection.enabled),...Ko("secret_protection.overrides",ce.secret_protection.overrides),"secret_protection.deny_paths":Jo(ce.secret_protection.deny_paths),"secret_protection.allow_paths":Jo(ce.secret_protection.allow_paths),...me?{"audit.retention_days":String(ce.audit.retention_days)}:{}}}function dr(ce,me,ge){let he=$s(ce,ge),Se=$s(me,ge);return[...new Set([...Object.keys(he),...Object.keys(Se)])].flatMap((Fe)=>he[Fe]===Se[Fe]?[]:[{field:Fe,before:he[Fe],after:Se[Fe]}])}function Vn(ce){let me=y(ce);if(!Os(me))return{baseline:f(globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__),diagnostics:[]};let ge=xn(me);return{baseline:f(ge.value),diagnostics:ge.errors.length>0?ge.errors:_(ge.value)}}function xn(ce){if(!Os(ce))return{errors:[`${ce}: file not found`]};try{return{value:JSON.parse(bp(ce,"utf-8")),errors:[]}}catch(me){let ge=me instanceof Error?me.message:String(me);return{errors:[`${ce}: ${me instanceof SyntaxError?`Invalid JSON: ${ge}`:ge}`]}}}function ur(ce,me){let ge=Lp(ce)?ce:{};return{version:me.version,...Object.fromEntries(["safety","workflow","destructive_command_protection","secret_protection"].filter((he)=>ge[he]!==void 0).map((he)=>[he,ge[he]]))}}function Ko(ce,me){return Object.fromEntries(Object.entries(me).flatMap(([ge,he])=>he===void 0?[]:[[`${ce}.${ge}`,String(he)]]))}function Jo(ce){return ce.length===0?"(none)":ce.join(", ")}function Lp(ce){return!!ce&&typeof ce==="object"&&!Array.isArray(ce)}function Ap(ce){let me=de(),ge=Wt({label:"logs",booleans:{all:["--all"],suspect:["--suspect"],json:["--json"],pruneLegacy:["--prune-legacy"],dryRun:["--dry-run"]},values:{id:["--id"],limit:["--limit"],since:["--since"],agent:["--agent"],rule:["--rule"],session:["--session"],project:["--project"]}},ce);if(vn(ge.errors))return null;if(ge.values.id!==void 0&&!/^[a-f0-9]{16}$/.test(ge.values.id))return console.error("--id must be 16 hexadecimal characters"),null;let he=ge.values.limit===void 0?20:Fs(ge.values.limit);if(he===null)return console.error("--limit must be a positive number"),null;let Se=ge.values.since===void 0?Math.min(30,me):Fs(ge.values.since);if(Se===null||Se>me)return console.error(`--since must be a positive number of days no greater than ${me}`),null;let Fe={limit:he,limitExplicit:ge.values.limit!==void 0,since:Se,sinceExplicit:ge.values.since!==void 0,all:ge.flags.all,json:ge.flags.json,suspect:ge.flags.suspect,pruneLegacy:ge.flags.pruneLegacy,dryRun:ge.flags.dryRun,id:ge.values.id,agent:ge.values.agent,rule:ge.values.rule,session:ge.values.session,project:ge.values.project===void 0?void 0:Pp(ge.values.project)};if(Fe.id&&(Fe.agent!==void 0||Fe.rule!==void 0||Fe.session!==void 0||Fe.project!==void 0||Fe.suspect||Fe.sinceExplicit||Fe.limitExplicit))return console.error("--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit"),null;if(Fe.pruneLegacy&&(Fe.id!==void 0||Fe.agent!==void 0||Fe.rule!==void 0||Fe.session!==void 0||Fe.project!==void 0||Fe.suspect||Fe.all||Fe.sinceExplicit||Fe.limitExplicit))return console.error("--prune-legacy cannot be combined with --id, --agent, --rule, --session, --project, --suspect, --all, --since, or --limit"),null;if(Fe.dryRun&&!Fe.pruneLegacy)return console.error("--dry-run requires --prune-legacy"),null;return Fe}async function Hs(ce,me={}){let ge=Ap(ce);if(!ge)return 1;let he=me.logsDir??F();if(ge.pruneLegacy)return Ep(he,ge.json,ge.dryRun);if(!he)return console.log(ge.json?"[]":ge.id?`No retained audit log entry found for id ${en(ge.id)}.`:"No audit log entries found."),0;q(he);let Se={count:0},Fe=kn(he,Se).flatMap((Tt)=>Dn(Tt,Se).map((Ft)=>({entry:Ft,file:Tt})));if(Se.count>0)console.error(`warning: ${Se.count} audit log ${Se.count===1?"source":"sources"} could not be read; these results are incomplete`);if(ge.id)return $p(Fe,ge,me.timeZone);let He=Date.now()-ge.since*24*60*60*1000,Ge=Fe.filter((Tt)=>Op(Tt,ge,he,He)),Dt=ge.suspect?Oo(Ge.map((Tt)=>Tt.entry)):null,At=(Dt?Ge.filter((Tt)=>Dt.has(Tt.entry)):Ge).sort((Tt,Ft)=>Date.parse(Ft.entry.ts)-Date.parse(Tt.entry.ts)).slice(0,ge.limit);if(ge.json)return console.log(JSON.stringify(At.map((Tt)=>Tt.entry),null,2)),0;if(At.length===0)return console.log("No audit log entries found."),0;for(let Tt of At)console.log(Np(Tt.entry,me.timeZone));return 0}function Ep(ce,me,ge){let he=ce?Tp(ce).map((Ge)=>Sp(ce,Ge)):[];if(ge)return _p(he,me);let Se=[],Fe=0,He=0;for(let Ge of he){let Dt=js(Ge,{throwIfNoEntry:!1})?.size??0,At=Ip(Ge);if(At){Se.push(`${Ns(Ge)}: ${At}`);continue}Fe++,He+=Dt}if(me)return console.log(JSON.stringify({removedFiles:Fe,removedBytes:He,failedFiles:Se.length})),Se.length===0?0:1;console.log(Fe===0&&Se.length===0?"No legacy audit log files found.":`Removed ${Fe} legacy audit log ${Fe===1?"file":"files"} (${Ms(He)}).`);for(let Ge of Se)console.error(`Could not remove ${en(Ge)}`);if(console.log("Nested v2 audit logs were not changed."),Fe>0)console.log("This deletion cannot be undone.");return Se.length===0?0:1}function _p(ce,me){let ge=ce.reduce((he,Se)=>he+(js(Se,{throwIfNoEntry:!1})?.size??0),0);if(me)return console.log(JSON.stringify({dryRun:!0,files:ce.length,bytes:ge})),0;if(console.log(ce.length===0?"No legacy audit log files found.":`Would remove ${ce.length} legacy audit log ${ce.length===1?"file":"files"} (${Ms(ge)}).`),console.log("Nested v2 audit logs are not included."),ce.length>0)console.log("Run the same command without --dry-run to delete them.");return 0}function Tp(ce){try{return wp(ce,{withFileTypes:!0}).filter((me)=>me.isFile()&&me.name.endsWith(".jsonl")).map((me)=>me.name)}catch{return[]}}function Ip(ce){try{return kp(ce),null}catch(me){return me instanceof Error?me.message:String(me)}}function Ms(ce){let me=["B","KiB","MiB","GiB"],ge=Math.min(Math.floor(Math.log2(Math.max(ce,1))/10),me.length-1);return`${Math.round(ce/1024**ge*10)/10} ${me[ge]}`}function $p(ce,me,ge){let he=ce.filter((Fe)=>Fe.entry.id===me.id);if(he.length>1)return console.error(`Multiple audit log entries found for id ${en(me.id??"")}.`),1;if(me.json)return console.log(JSON.stringify(he.map((Fe)=>Fe.entry),null,2)),0;let Se=he[0];if(!Se)return console.log(`No retained audit log entry found for id ${en(me.id??"")}.`),0;return console.log(Hp(Se.entry,ge)),0}function Op(ce,me,ge,he){if(!me.all&&ce.entry.decision==="allow")return!1;if(Date.parse(ce.entry.ts)<he)return!1;if(me.agent!==void 0&&ce.entry.agent!==me.agent)return!1;if(me.rule!==void 0&&ce.entry.ruleId!==me.rule)return!1;if(me.session!==void 0&&!Fp(ce,ge,me.session))return!1;if(me.project!==void 0&&!jp(ce.entry.cwd,me.project))return!1;return!0}function Fp(ce,me,ge){if(ce.entry.sessionId===ge)return!0;return xp(ce.file)===me&&Ns(ce.file,".jsonl")===ge}function jp(ce,me){if(!ce)return!1;let ge=Rp(me,ce);return ge!==".."&&!ge.startsWith(`..${Dp}`)&&!Cp(ge)}function Np(ce,me){let ge=en(ce.id??"-"),he=en(ce.decision??"deny"),Se=ce.cwd?`  [${en(ce.cwd)}]`:"",Fe=ce.segment||ce.command,He=Fe===ce.command?"":"↳ ",Ge=Fe.length>50?`${Fe.slice(0,50)}…`:Fe;return`${ge.padEnd(16)}  ${en(Us(ce.ts,me))}  ${he.padEnd(5)}  ${en(ce.agent??"-").padEnd(15)}  ${en(ce.ruleId??"-").padEnd(20)}  ${He}${en(Ge)}${Se}`}function Hp(ce,me){let ge=(Se)=>en(Se===void 0||Se===null||Se===""?"-":Se),he=ce.shape?`${ce.agent??"-"} (shape: ${ce.shape})`:ce.agent??"-";return[`id:        ${ge(ce.id)}`,`ts:        ${ge(Us(ce.ts,me))}`,`decision:  ${ge(ce.decision)}`,`agent:     ${ge(he)}`,`level:     ${ge(ce.level)}`,`tool:      ${ge(ce.toolName)}`,`rule:      ${ge(ce.ruleId)}`,`intent:    ${ge(ce.intent)}`,`stage:     ${ge(ce.failureStage)}`,`error:     ${ge(ce.errorCode)}`,`session:   ${ge(ce.sessionId)}`,`cwd:       ${ge(ce.cwd)}`,`version:   ${ge(ce.v)}`,`truncated: ${ge(ce.truncated===!0?"yes":void 0)}`,`reason:    ${ge(ce.reason)}`,`command:   ${ge(ce.command)}`,`segment:   ${ge(ce.segment)}`].join(`
`)}function Us(ce,me){let ge=new Date(ce);if(Number.isNaN(ge.getTime()))return ce;return new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:me}).format(ge)}function Fs(ce){let me=Number(ce);return Number.isFinite(me)&&me>0?me:null}var Gs={name:"doctor",aliases:["--doctor"],description:"Run diagnostic checks to verify installation and configuration",usage:"doctor [options]",options:[{flags:"--json",description:"Output diagnostics as JSON"},{flags:"--skip-update-check",description:"Skip npm registry version check"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net doctor","cc-safety-net doctor --json","cc-safety-net doctor --skip-update-check"]};var Bs={name:"explain",description:"Show step-by-step analysis trace of how a command would be analyzed",usage:"explain [options] <command>",argument:"<command>",options:[{flags:"--json",description:"Output analysis as JSON"},{flags:"--cwd",argument:"<path>",description:"Use custom working directory"},{flags:"-h, --help",description:"Show this help"}],examples:['cc-safety-net explain "git reset --hard"','cc-safety-net explain --json "rm -rf /"','cc-safety-net explain --cwd /tmp "git status"']};var qs={name:"gui",description:"Open the local policy editor GUI",usage:"gui [options]",options:[{flags:"--no-open",description:"Print the URL without opening a browser"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net gui","cc-safety-net gui --no-open"]};import{isAbsolute as Vs,join as Yp,relative as Zp}from"node:path";var Mp=8388608;function Up(ce,me){console.log(JSON.stringify(ce(te(me))))}async function Gp(ce){let me;try{me=(await Wo(process.stdin)).trim()}catch{ce({reason:"Failed to parse hook input JSON."});return}if(!me){ce({reason:"Missing hook input JSON."});return}return Yo(me,ce,"Failed to parse hook input JSON.")}async function Wo(ce){let me=[],ge=0;for await(let he of ce){let Se=typeof he==="string"?Buffer.from(he,"utf-8"):Buffer.from(he.buffer,he.byteOffset,he.byteLength);if(ge+=Se.byteLength,ge>Mp)throw Bp(ce),Error("hook input byte limit exceeded");me.push(Se)}return Buffer.concat(me,ge).toString("utf-8")}function Bp(ce){let me=ce.destroy??ce.cancel;if(!me)return;try{Promise.resolve(me.call(ce)).catch(()=>{})}catch{}}function Yo(ce,me,ge){try{return JSON.parse(ce)}catch{me({reason:ge});return}}function tn(ce,me){let ge=me.get(ce);return ge?{kind:"command",shell:ge}:{kind:ie(ce)}}function pn(ce,me,ge,he){let Se=ce===void 0?process.cwd():ce,Fe=typeof Se==="string"&&Se.trim()!==""?N([Se]):void 0;if(Fe)return{configCwd:Fe,executionCwd:Fe};return Zt(he,me,ge,Kp(Se)),null}function Zt(ce,me,ge,he){let Se;try{Se=B(me)}catch(Fe){if(!(Fe instanceof a))throw Fe}ce(T({command:Se,segment:he,toolName:ge}))}async function qp(ce){let me=await Gp(ce.outputDeny);if(me===void 0)return;if(!me||typeof me!=="object"||Array.isArray(me)){Zt(ce.outputDeny);return}if(!ce.isSupported(me))return;let ge=ce.getAgent?.(me)??ce.agent,he=ce.agent===ge?void 0:ce.agent,Se=Wp(me),Fe=(It,$t)=>{ee(It,()=>ce.getSessionId(me),{agent:ge,shape:he,toolName:$t,cwd:Se}),ce.outputDeny(It)},He=ce.getToolName(me);if(typeof He!=="string"||He.trim()===""){Zt((It)=>Fe(It),Jp(me));return}let Ge=He,Dt=(It)=>Fe(It,Ge),At;try{At=ce.getToolInput(me,Ge,Dt)}catch(It){if(!(It instanceof a))throw It;Zt(Dt,void 0,Ge);return}if(!At.ok)return;let Tt=ce.getContext(me,At.input,Ge,Dt);if(!Tt)return;let Ft;try{Ft=B(At.input)}catch(It){if(!(It instanceof a))throw It;Zt(Dt,void 0,Ge);return}let jt=c(Ge,At.input,At.route,Tt,Ft??null);try{let It=j(jt,{guard:{auditAllowed:se(),dependencies:ce.guardDependencies},audit:{agent:ge,shape:he,getSessionId:()=>ce.getSessionId(me)}}),$t=K(It,{includeEvidence:!0,toolName:It.stage==="command-analysis"?void 0:Ge});if($t){ce.outputDeny($t);return}ce.outputAllow?.()}catch(It){if(!(It instanceof d))throw It;Vp(It);let $t=K(It.evaluation,{includeEvidence:!0,toolName:It.evaluation.stage==="command-analysis"?void 0:Ge});if($t)ce.outputDeny($t);return}}function Vp(ce){if(!P(r.debug))return;console.error(`CC Safety Net debug: ${zp(ce.stage)}: ${_e(ce.cause)}`)}function zp(ce){if(ce==="policy-protection")return"hook policy protection failed";if(ce==="config-load")return"hook config loading failed";if(ce==="secret-protection")return"hook secret protection failed";return"hook analysis failed"}function Kp(ce){return typeof ce==="string"?ce:void 0}function Jp(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return;if(Object.hasOwn(ce,"tool_input"))return ce.tool_input;let me=ce.toolCall;if(me&&typeof me==="object"&&!Array.isArray(me))return me.args;return}function Wp(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return null;let me=ce.cwd;if(typeof me==="string")return me;let ge=ce.toolCall;if(!ge||typeof ge!=="object"||Array.isArray(ge))return null;let he=ge.args;if(!he||typeof he!=="object"||Array.isArray(he))return null;let Se=he.Cwd;return typeof Se==="string"?Se:null}async function nn(ce){let me=(Se)=>Up(ce.createDenyOutput,Se),ge=ce.createAllowOutput;await qp({...ce,outputDeny:me,outputAllow:ge?()=>console.log(JSON.stringify(ge())):void 0})}function pr(ce){return Yp(ce,".gemini","config","hooks.json")}var Xp=new Map([["run_command","auto"]]),Qp=new Set(["absolutepath","directorypath","file_path","filepath","path","searchdirectory","searchpath","target_file","targetfile"]);function zs(ce){return tn(ce,Xp)}async function Ks(){await nn({agent:"antigravity-cli",createDenyOutput:(ce)=>({decision:"deny",reason:ce}),isSupported:()=>!0,getToolName:(ce)=>ce.toolCall?.name,getToolInput:(ce,me)=>({ok:!0,input:o2(ce.toolCall?.args,me),route:zs(me)}),getContext:e2,getSessionId:(ce)=>ce.conversationId})}function e2(ce,me,ge,he){let Fe=r2(ce).flatMap((At)=>{let Tt=N([At]);return Tt?[Tt]:[]});if(!Fe[0])return An(he,me,ge),null;if(ge!=="run_command"){let At;try{At=t2(me,ge,Fe)}catch(Tt){if(Tt instanceof a)return An(he,void 0,ge),null;if(!(Tt instanceof s))throw Tt;return An(he,me,ge),null}if(!At)return An(he,me,ge),null;return{configCwd:At,executionCwd:At}}let He=ce.toolCall?.args;if(!He||!Object.hasOwn(He,"Cwd"))return{configCwd:Fe[0],executionCwd:Fe[0]};let Ge=He.Cwd;if(typeof Ge!=="string"||Ge.trim()==="")return An(he,me,ge),null;let Dt=O(Ge,Fe);if(Dt){let At=Js(Dt,Fe);if(!At)return An(he,me,ge,Ge),null;return{configCwd:At,executionCwd:Dt}}return An(he,me,ge,Ge),null}function t2(ce,me,ge){let he=zs(me),Se=[...We(ce,Qp),...he.kind==="patch"?Ue(ce):[]].filter(Vs),Fe=re(),He=new Set(Se.flatMap((Ge)=>{let Dt=Js(i(Ge,m,Fe),ge);return Dt?[Dt]:[]}));if(He.size>1)return null;return[...He][0]??ge[0]??null}function Js(ce,me){return me.filter((ge)=>n2(ce,ge)).reduce((ge,he)=>he.length>ge.length?he:ge,"")||null}function n2(ce,me){let ge=Zp(me,ce);return ge===""||!ge.startsWith("..")&&!Vs(ge)}function An(ce,me,ge,he){let Se=me&&typeof me==="object"?me.command:void 0;ce(T({command:typeof Se==="string"?Se:void 0,segment:he,toolName:ge}))}function r2(ce){if(ce.workspacePaths===void 0)return[process.cwd()];let me=Array.isArray(ce.workspacePaths)?ce.workspacePaths.filter((ge)=>typeof ge==="string"&&ge.trim()!==""):[];return N(me)?me:[]}function o2(ce,me){if(!ce)return;if(me!=="run_command")return ce;return{...ce,command:typeof ce.CommandLine==="string"&&ce.CommandLine!==""?ce.CommandLine:void 0}}var fr=[{id:"antigravity-cli",displayName:"Antigravity CLI",doctorOrder:3,runtime:{order:1,flags:["-ac","--agy-cli"],description:"Run as Antigravity CLI PreToolUse hook",legacyTopLevelFlags:[]},install:{order:2,flag:"--agy-cli",artifactKind:"hook config",probeCommand:["agy","--version"]}},{id:"claude-code",displayName:"Claude Code",doctorOrder:1,runtime:{order:2,displayName:"Coding CLI",flags:["-cc","--coding-cli"],legacyFlags:["--claude-code"],description:"Run as Coding CLI PreToolUse hook",legacyTopLevelFlags:["-cc","--claude-code"]},install:{order:3,flag:"--claude-code",artifactKind:"plugin",probeCommand:["claude","--version"]}},{id:"codex",displayName:"Codex",doctorOrder:4,runtime:{order:3,flags:["-cx","--codex"],description:"Run as a Codex PreToolUse hook",legacyTopLevelFlags:[]},install:{order:4,flag:"--codex",artifactKind:"plugin",probeCommand:["codex","--version"]}},{id:"copilot-cli",displayName:"GitHub Copilot CLI",doctorOrder:7,runtime:{order:6,flags:["-cp","--copilot-cli"],description:"Run as GitHub Copilot CLI PreToolUse hook",legacyTopLevelFlags:["-cp","--copilot-cli"]},install:{order:7,flag:"--copilot-cli",artifactKind:"plugin",probeCommand:["copilot","--binary-version"]}},{id:"gemini-cli",displayName:"Gemini CLI",doctorOrder:6,runtime:{order:5,flags:["-gc","--gemini-cli"],description:"Run as Gemini CLI BeforeTool hook",legacyTopLevelFlags:["-gc","--gemini-cli"]},install:{order:6,flag:"--gemini-cli",artifactKind:"extension",probeCommand:["gemini","--version"]}},{id:"grok-build",displayName:"Grok Build",doctorOrder:8,runtime:{order:7,flags:["-gb","--grok-build"],description:"Run as Grok Build PreToolUse hook",legacyTopLevelFlags:[]},install:{order:8,flag:"--grok-build",artifactKind:"hook config",probeCommand:["grok","--version"]}},{id:"hermes-agent",displayName:"Hermes Agent",doctorOrder:9,runtime:{order:8,flags:["-ha","--hermes-agent"],description:"Run as Hermes Agent pre_tool_call hook",legacyTopLevelFlags:[]},install:{order:9,flag:"--hermes-agent",artifactKind:"plugin",probeCommand:["hermes","--version"]}},{id:"kimi-code",displayName:"Kimi Code",doctorOrder:10,runtime:{order:9,flags:["-kc","--kimi-code"],description:"Run as Kimi Code PreToolUse hook",legacyTopLevelFlags:[]},install:{order:10,flag:"--kimi-code",artifactKind:"hook config",probeCommand:["kimi","--version"]}},{id:"openclaw",displayName:"OpenClaw",doctorOrder:11,install:{order:11,flag:"--openclaw",artifactKind:"plugin",probeCommand:["openclaw","--version"]}},{id:"opencode",displayName:"OpenCode",doctorOrder:12,install:{order:12,flag:"--opencode",artifactKind:"plugin",probeCommand:["opencode","--version"]}},{id:"pi",displayName:"Pi",doctorOrder:13,install:{order:13,flag:"--pi",artifactKind:"package",probeCommand:["pi","--version"]}},{id:"cursor",displayName:"Cursor",doctorOrder:5,runtime:{order:4,flags:["-cu","--cursor"],description:"Run as Cursor preToolUse hook",legacyTopLevelFlags:[]},install:{order:5,flag:"--cursor",artifactKind:"hook config",probeCommand:["cursor","--version"]}},{id:"amp",displayName:"Amp Code",doctorOrder:2,install:{order:1,flag:"--amp",artifactKind:"plugin",probeCommand:["amp","--version"]}}],Hr=fr.slice().sort((ce,me)=>ce.doctorOrder-me.doctorOrder).map((ce)=>ce.id),Ws=fr.filter((ce)=>("runtime"in ce)).slice().sort((ce,me)=>ce.runtime.order-me.runtime.order).map((ce)=>({id:ce.id,displayName:"displayName"in ce.runtime?ce.runtime.displayName:ce.displayName,flags:ce.runtime.flags,legacyFlags:"legacyFlags"in ce.runtime?ce.runtime.legacyFlags:[],description:ce.runtime.description,legacyTopLevelFlags:ce.runtime.legacyTopLevelFlags})),an=fr.slice().sort((ce,me)=>ce.install.order-me.install.order).map((ce)=>({id:ce.id,...ce.install})).map(({order:ce,...me})=>me),Qv=Object.fromEntries(fr.map((ce)=>[ce.id,ce.displayName]));function Kt(ce){return fr.find((me)=>me.id===ce)?.displayName??ce}import{homedir as i2}from"node:os";import{isAbsolute as Ys,join as Zo}from"node:path";function Zs(ce){if(ce!==void 0&&ce!==null&&typeof ce!=="string")return"unknown";if(typeof ce==="string"&&!Ys(ce))return"unknown";try{let me=re(),ge=typeof ce==="string"&&ce?i(ce,m,me):void 0,he=process.env.HOME||i2(),Se=[["codex",process.env.CODEX_HOME||Zo(he,".codex")],["copilot-cli",process.env.COPILOT_HOME||Zo(he,".copilot")],["claude-code",process.env.CLAUDE_CONFIG_DIR||Zo(he,".claude")]],Fe=ge?Se.flatMap(([He,Ge])=>{if(!Ys(Ge))return[];return ct(ge,i(Ge,m,me))?[He]:[]}):[];if(Fe.length===1)return Fe[0]??"unknown";if(Fe.length>1)return"unknown"}catch(me){if(me instanceof s)return"unknown";return"unknown"}if(process.env.CLAUDECODE==="1"||Boolean(process.env.CLAUDE_CODE_ENTRYPOINT))return"claude-code";return"unknown"}var Xo="PreToolUse",Xs="BeforeTool",Qs="pre_tool_call",Qo="PreToolUse";async function Mr(ce){await nn({agent:ce.agent,...ce.getAgent?{getAgent:ce.getAgent}:{},createDenyOutput:(me)=>({hookSpecificOutput:{hookEventName:Xo,permissionDecision:"deny",permissionDecisionReason:me}}),isSupported:(me)=>me.hook_event_name===Xo,getToolName:(me)=>me.tool_name,getToolInput:(me,ge)=>({ok:!0,input:me.tool_input,route:ce.getToolRoute(ge)}),getContext:(me,ge,he,Se)=>pn(me.cwd,ge,he,Se),getSessionId:(me)=>me.session_id})}var s2=new Map([["Bash","posix"],["PowerShell","powershell"]]);function a2(ce){return tn(ce,s2)}async function ea(){await Mr({agent:"claude-code",getAgent:(ce)=>Zs(ce.transcript_path),getToolRoute:a2})}var l2=new Map([["Bash","auto"]]);async function ta(){await Mr({agent:"codex",getToolRoute:(ce)=>tn(ce,l2)})}var c2=new Map([["bash","auto"],["Bash","auto"],["powershell","powershell"],["PowerShell","powershell"]]);function d2(ce){return tn(ce,c2)}async function na(){await nn({agent:"copilot-cli",createDenyOutput:(ce)=>({permissionDecision:"deny",permissionDecisionReason:ce}),isSupported:()=>!0,getToolName:(ce)=>ce.toolName,getToolInput:(ce,me,ge)=>{if(typeof ce.toolArgs!=="string")return ge({reason:"Failed to parse toolArgs JSON."}),{ok:!1};let he=Yo(ce.toolArgs,ge,"Failed to parse toolArgs JSON.");if(he===void 0)return{ok:!1};return{ok:!0,input:he,route:d2(me)}},getContext:(ce,me,ge,he)=>pn(ce.cwd,me,ge,he),getSessionId:(ce)=>typeof ce.sessionId==="string"&&ce.sessionId.trim()?ce.sessionId:void 0})}var u2=new Map([["Shell","auto"]]);function p2(ce){return tn(ce,u2)}async function ra(){await nn({agent:"cursor",createDenyOutput:(ce)=>({permission:"deny",user_message:ce,agent_message:ce}),createAllowOutput:()=>({permission:"allow"}),isSupported:()=>!0,getToolName:(ce)=>ce.tool_name,getToolInput:(ce,me)=>({ok:!0,input:ce.tool_input,route:p2(me)}),getContext:f2,getSessionId:(ce)=>ce.conversation_id})}function f2(ce,me,ge,he){let Se=m2(ce);if(!Se[0])return Zt(he,me,ge),null;let Fe=O(h2(ce.cwd),Se);if(!Fe)return Zt(he,me,ge,typeof ce.cwd==="string"?ce.cwd:void 0),null;if(me===null||typeof me!=="object"||Array.isArray(me))return{configCwd:Fe,executionCwd:Fe};if(!Object.hasOwn(me,"working_directory"))return{configCwd:Fe,executionCwd:Fe};let He=me.working_directory;if(typeof He!=="string"||He.trim()==="")return Zt(he,me,ge),null;let Ge=O(He,Se);if(!Ge)return Zt(he,me,ge,He),null;return{configCwd:Fe,executionCwd:Ge}}function m2(ce){return g2(ce).flatMap((me)=>{let ge=N([me]);return ge?[ge]:[]})}function g2(ce){if(ce.workspace_roots===void 0)return typeof ce.cwd==="string"&&ce.cwd.trim()!==""?[ce.cwd]:[];if(!Array.isArray(ce.workspace_roots))return[];return ce.workspace_roots.filter((me)=>typeof me==="string"&&me.trim()!=="")}function h2(ce){return typeof ce==="string"&&ce.trim()!==""?ce:"."}var y2=new Map([["run_shell_command","auto"]]);function v2(ce){return tn(ce,y2)}async function oa(){await nn({agent:"gemini-cli",createDenyOutput:(ce)=>({decision:"deny",reason:ce,systemMessage:ce}),isSupported:(ce)=>ce.hook_event_name===Xs,getToolName:(ce)=>ce.tool_name,getToolInput:(ce,me)=>({ok:!0,input:ce.tool_input,route:v2(me)}),getContext:(ce,me,ge,he)=>pn(ce.cwd,me,ge,he),getSessionId:(ce)=>ce.session_id})}var b2=new Map([["run_terminal_command","auto"]]);function L2(ce){return tn(ce,b2)}async function ia(){await nn({agent:"grok-build",createDenyOutput:(ce)=>({decision:"deny",reason:ce}),createAllowOutput:()=>({decision:"allow"}),isSupported:()=>!0,getToolName:(ce)=>ce.toolName,getToolInput:(ce,me,ge)=>{if(ce.toolInputTruncated===!0)return Zt(ge,ce.toolInput,me),{ok:!1};return{ok:!0,input:ce.toolInput,route:L2(me)}},getContext:w2,getSessionId:(ce)=>ce.sessionId})}function w2(ce,me,ge,he){let Se=N(k2(ce));if(!Se)return Zt(he,me,ge),null;let Fe=O(x2(ce.cwd),[Se]);if(!Fe)return Zt(he,me,ge,typeof ce.cwd==="string"?ce.cwd:void 0),null;return{configCwd:Fe,executionCwd:Fe}}function k2(ce){let me=ce.workspaceRoot===void 0?ce.cwd:ce.workspaceRoot;return typeof me==="string"&&me.trim()!==""?[me]:[]}function x2(ce){return typeof ce==="string"&&ce.trim()!==""?ce:"."}import{resolve as C2}from"node:path";var S2=new Map([["terminal","posix"]]);async function sa(){await nn({agent:"hermes-agent",createDenyOutput:(ce)=>({action:"block",message:ce}),isSupported:(ce)=>ce.hook_event_name===Qs,getToolName:(ce)=>ce.tool_name,getToolInput:(ce,me)=>({ok:!0,input:ce.tool_input,route:tn(me,S2)}),getContext:R2,getSessionId:(ce)=>ce.session_id})}function R2(ce,me,ge,he){let Se=pn(ce.cwd,me,ge,he);if(!Se)return null;if(!me||typeof me!=="object"||Array.isArray(me))return Se;if(!Object.hasOwn(me,"workdir"))return Se;let Fe=me.workdir;if(typeof Fe!=="string"||Fe.trim()==="")return Zt(he,me,ge),null;let He=N([C2(Se.configCwd,Fe)]);if(!He)return Zt(he,me,ge,Fe),null;return{...Se,executionCwd:He}}var aa=new Map([["Bash","posix"]]);function P2(ce){return tn(ce,aa)}async function la(){await nn({agent:"kimi-code",createDenyOutput:(ce)=>({hookSpecificOutput:{hookEventName:Qo,permissionDecision:"deny",permissionDecisionReason:ce}}),isSupported:(ce)=>ce.hook_event_name===Qo,getToolName:(ce)=>ce.tool_name,getToolInput:(ce,me)=>({ok:!0,input:ce.tool_input,route:P2(me)}),getContext:(ce,me,ge,he)=>{let Se=pn(ce.cwd,me,ge,he);if(!Se)return null;let Fe=ce.tool_input;if(!aa.has(ge)||!Fe||!Object.hasOwn(Fe,"cwd"))return Se;let He=Fe.cwd;if(typeof He!=="string"||He.trim()==="")return Zt(he,me,ge),null;let Ge=O(He,[Se.configCwd]);if(!Ge)return Zt(he,me,ge,He),null;return{configCwd:Se.configCwd,executionCwd:Ge}},getSessionId:(ce)=>ce.session_id})}var D2={"antigravity-cli":Ks,"claude-code":ea,codex:ta,"copilot-cli":na,cursor:ra,"gemini-cli":oa,"grok-build":ia,"hermes-agent":sa,"kimi-code":la},zn=Ws.map((ce)=>({...ce,run:D2[ce.id]}));function ca(ce){let me=Wt({label:"hook",booleans:Object.fromEntries(zn.map((he)=>[he.id,[...he.flags,...he.legacyFlags]]))},ce);if(me.errors.length>0)return;let ge=zn.filter((he)=>me.flags[he.id]);return ge.length===1?ge[0]:void 0}function da(ce){return zn.find((me)=>me.legacyTopLevelFlags.some((ge)=>ge===ce))}var A2=zn.map((ce)=>({flags:ce.flags.join(", "),description:ce.description})),E2=zn.flatMap((ce)=>ce.flags.map((me)=>`cc-safety-net hook ${me}`)),ua={name:"hook",description:"Run as an agent CLI hook (reads JSON from stdin)",usage:"hook INTEGRATION_FLAG",options:[...A2,{flags:"-h, --help",description:"Show this help"}],examples:E2};var pa={name:"install",description:"Install CC Safety Net into a coding agent CLI",usage:"install [TARGET_FLAG]",options:[...an.map((ce)=>({flags:ce.flag,description:`Install ${Kt(ce.id)} ${ce.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net install",...an.map((ce)=>`cc-safety-net install ${ce.flag}`)]},fa={name:"uninstall",description:"Uninstall CC Safety Net from a coding agent CLI",usage:"uninstall [TARGET_FLAG]",options:[...an.map((ce)=>({flags:ce.flag,description:`Uninstall ${Kt(ce.id)} ${ce.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net uninstall",...an.map((ce)=>`cc-safety-net uninstall ${ce.flag}`)]},ma={name:"update",description:"Update every installed CC Safety Net integration to the latest version",usage:"update",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net update"]};var ga={name:"logs",description:"Browse audit log entries recorded by hooks",usage:"logs [options]",options:[{flags:"--id",argument:"<id>",description:"Show one entry from retained history by its 16-character id (not guaranteed once it is older than the configured retention)"},{flags:"--limit",argument:"<n>",description:"Maximum entries to print",default:"20"},{flags:"--since",argument:"<days>",description:"Only include entries newer than this many days (max: the configured audit retention, 1-365)",default:"30"},{flags:"--agent",argument:"<name>",description:"Filter by agent name"},{flags:"--rule",argument:"<ruleId>",description:"Filter by rule id"},{flags:"--session",argument:"<id>",description:"Filter by session id"},{flags:"--project",argument:"<path>",description:"Filter by project path"},{flags:"--suspect",description:"Only denials that look like false positives"},{flags:"--all",description:"Include allow entries"},{flags:"--prune-legacy",description:"Permanently delete all legacy root-level logs; nested logs are untouched"},{flags:"--dry-run",description:"With --prune-legacy, report what would be deleted and delete nothing"},{flags:"--json",description:"Output entries as JSON"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net logs --id 3fa9c2d1a70e8b42","cc-safety-net logs --agent claude-code","cc-safety-net logs --project . --since 7","cc-safety-net logs --suspect --since 7","cc-safety-net logs --json","cc-safety-net logs --prune-legacy --dry-run","cc-safety-net logs --prune-legacy"]};var Ur={name:"policy",description:"Check and apply project or user policy proposals",usage:"policy <subcommand>",subcommands:[{usage:"check <file>",description:"Validate a policy proposal and print its diff"},{usage:"apply <file>",description:"Apply a proposal after confirming in a terminal"}],options:[{flags:"-g, --global",description:"Use the user-scope policy instead of the project one"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net policy check proposal.json","cc-safety-net policy apply proposal.json","cc-safety-net policy apply proposal.json --global"]};var ei=[{flags:"--ref",argument:"<ref>",description:"Use a branch, tag, or commit"},{flags:"--only",argument:"<rulebook...>",description:"Add only these repository rulebooks"},{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"-h, --help",description:"Show this help"}],ti=["cc-safety-net rule add project-rules","cc-safety-net rule add acme/safety-rules","cc-safety-net rule add acme/safety-rules --only aws gcloud","cc-safety-net rule add acme/safety-rules --ref v2 --only aws","cc-safety-net rule add --only terraform aws"],Kn={name:"rule",description:"Manage CC Safety Net rule config and rulebook sources",usage:"rule <subcommand>",subcommands:[{usage:"init [--example]",description:"Create inert rule config"},{usage:"add [source] [--ref <ref>] [--only <rulebook...>]",description:"Add rulebook sources and sync"},{usage:"remove <source>",description:"Remove a rulebook source and sync"},{usage:"update [source]",description:"Re-fetch and vendor remote rulebooks"},{usage:"sync",description:"Deprecated: migrate lock and cache leftovers"},{usage:"list",description:"List active rulebooks"},{usage:"wrapper add <command>",description:"Trust a transparent command wrapper"},{usage:"wrapper remove <command>",description:"Remove a transparent command wrapper"},{usage:"wrapper list",description:"List transparent command wrappers"},{usage:"migrate [--cleanup]",description:"Migrate legacy inline rules"},{usage:"doc",description:"Print the rulebook authoring guide"},{usage:"verify",description:"Validate rule config files"}],options:[{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"--cleanup",description:"Delete legacy files after rule migrate verifies them"},{flags:"--delete-source",description:"Delete clean local source directory on remove"},{flags:"--example",description:"Create an inactive example rulebook with rule init"},...ei.slice(0,2),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net rule init","cc-safety-net rule init --example","cc-safety-net rule wrapper add rtk",...ti,"cc-safety-net rule update","cc-safety-net rule migrate --cleanup","cc-safety-net rule verify"]};var ha={name:"status",description:"Show what the runtime is enforcing right now",usage:"status",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net status"]};var ya={name:"statusline",description:"Print status line with mode indicators for shell integration",usage:"statusline --claude-code",options:[{flags:"-cc, --claude-code",description:"Print status line for Claude Code"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net statusline -cc","cc-safety-net statusline --claude-code"]};var Gr=[ha,Gs,ga,Bs,Kn,Ur,pa,ma,fa,ua,qs,ya];function _2(ce){return ce.aliases??[]}function Br(ce){let me=ce.toLowerCase();return Gr.find((ge)=>ge.name.toLowerCase()===me||_2(ge).some((he)=>he.toLowerCase()===me))}import{basename as T2}from"node:path";function qr(ce=7,me=F()){let ge=Date.now()-ce*24*60*60*1000,he=[],Se=new Set,Fe=0,He,Ge,Dt,At;if(me)q(me);let Tt={count:0},Ft=me?kn(me,Tt):[];for(let It of Ft)for(let $t of Dn(It,Tt)){if($t.decision==="allow")continue;let Ot=new Date($t.ts).getTime();if(Ot>=ge){if(Fe++,Se.add($t.sessionId??T2(It,".jsonl")),Ge===void 0||Ot<=Ge)He=$t.ts,Ge=Ot;if(At===void 0||Ot>At)Dt=$t.ts,At=Ot;I2(he,$t,Ot)}}let jt=he.map((It)=>({timestamp:It.ts,command:It.command,reason:It.reason,relativeTime:$o(new Date(It.ts))}));return{totalBlocked:Fe,sessionCount:Se.size,recentEntries:jt,oldestEntry:He,newestEntry:Dt,unreadable:Tt.count}}function I2(ce,me,ge){let he=ce.findIndex((Se)=>ge>new Date(Se.ts).getTime());if(he===-1){if(ce.length<3)ce.push(me);return}if(ce.splice(he,0,me),ce.length>3)ce.pop()}import{dirname as $2}from"node:path";function va(ce,me,ge){let he;try{if(n(me)===null)return{path:ce,exists:!1,valid:!1,ruleCount:0};he=bn(me),he.errors.push(...M(ce,ge))}catch(Se){if(!(Se instanceof t))throw Se;he={errors:[Se.message],ruleNames:new Set}}return{path:ce,exists:!0,valid:he.errors.length===0,ruleCount:he.ruleNames.size,...he.errors.length>0?{errors:he.errors}:{}}}function O2(ce,me){return{source:me,name:ce.name,command:ce.command,subcommand:ce.subcommand,blockArgs:[...ce.block_args],reason:ce.reason}}function ba(ce,me){let ge=me?.userConfigPath??D(),he=me?.projectConfigPath??I(ce),Se=$2(ge),Fe=V({cwd:ce,userConfigPath:ge,projectConfigPath:he,userConfigDir:Se}),He=H({cwd:ce,userConfigPath:ge,projectConfigPath:he,userConfigDir:Se}),Ge=new Map(Fe.rulebooks.flatMap((Dt)=>Dt.rules.map((At)=>[At,Dt.source])));return{userConfig:va(ge,He.userConfigTarget,He.userScope),projectConfig:va(he,He.projectConfigTarget,He.projectScope),effectiveRules:Fe.rules.map((Dt)=>O2(Dt,Ge.get(Dt.name)??"project")),shadowedRules:[]}}var F2=[{flag:r.level,description:"Safety level preset: standard, strict, or paranoid",defaultBehavior:"standard"},{flag:r.strict,description:"Legacy; equivalent to safety.overrides.fail_closed",defaultBehavior:"permissive"},{flag:r.paranoid,description:"Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",defaultBehavior:"off"},{flag:r.paranoidRm,description:"Legacy; equivalent to safety.overrides.paranoid_rm",defaultBehavior:"off"},{flag:r.paranoidInterpreters,description:"Legacy; equivalent to safety.overrides.paranoid_interpreters",defaultBehavior:"off"},{flag:r.worktree,description:"Allow local git discards in linked worktrees",defaultBehavior:"off"},{flag:r.debug,description:"Print diagnostic messages to stderr",defaultBehavior:"off"},{flag:r.auditScope,description:"Command decisions recorded: all, or blocked (privacy-minimizing, denials only)",defaultBehavior:"all"}];function La(){return[...F2.map((ce)=>({name:ce.flag.name,value:Le(ce.flag),isSet:ut(ce.flag),legacyName:ce.flag.legacyName,legacyValue:ce.flag.legacyName?process.env[ce.flag.legacyName]:void 0,legacyIsSet:ce.flag.legacyName?process.env[ce.flag.legacyName]!==void 0:void 0,description:ce.description,defaultBehavior:ce.defaultBehavior})),{name:"CC_SAFETY_NET_HOME",value:process.env.CC_SAFETY_NET_HOME,isSet:process.env.CC_SAFETY_NET_HOME!==void 0,description:"Override user-scope config/cache directory",defaultBehavior:"~/.cc-safety-net"}]}var wa={error:0,warning:1,info:2},j2=["policy","config","audit"];function N2(ce){return ce.map((me)=>{if(me==="ownership")return"is not owned by the current user";if(me==="permissions")return"has unsafe permissions";if(me==="symlink")return"is a symbolic link";return"is not a directory"}).join(" and ")}var H2=[{derive:(ce)=>ce.hooks.length>0&&ce.hooks.every((me)=>!me.configured)?[{checkId:"integration.none-configured",severity:"error",title:"No integration configured",detail:"CC Safety Net is not connected to any supported coding-agent integration.",fixHint:"Run `cc-safety-net install` and configure at least one integration."}]:[]},{derive:(ce)=>ce.hooks.filter((me)=>me.inspectionStatus==="failed").map((me)=>{let ge=Kt(me.platform);return{checkId:"integration.inspection-failed",severity:"error",title:`${ge} inspection failed`,detail:`Doctor could not verify the ${ge} integration configuration.`,fixHint:`Correct the reported ${ge} configuration error, then run \`cc-safety-net doctor\` again.`,integration:me.platform}})},{derive:(ce)=>ce.userConfig.exists&&!ce.userConfig.valid?[{checkId:"config.user-invalid",severity:"error",title:"User configuration is invalid",detail:"Doctor could not load a valid user rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:ce.userConfig.path}]:[]},{derive:(ce)=>ce.projectConfig.exists&&!ce.projectConfig.valid?[{checkId:"config.project-invalid",severity:"error",title:"Project configuration is invalid",detail:"Doctor could not load a valid project rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:ce.projectConfig.path}]:[]},{derive:(ce)=>ce.configState.state==="degraded"?[{checkId:"config.runtime-degraded",severity:"warning",title:"Runtime is enforcing a fallback configuration",detail:`The rejected candidate configuration is not active: ${ce.configState.reason}`,fixHint:"Fix the file named in the reason, or run `cc-safety-net rule update` to vendor a remote source, then rerun doctor."}]:[]},{derive:(ce)=>ce.v2Leftovers&&ce.v2Leftovers.length>0?[{checkId:"config.v2-leftovers",severity:"info",title:"Rulebook lock and cache leftovers detected",detail:`Files an earlier version left behind are no longer read: ${ce.v2Leftovers.join(", ")}.`,fixHint:"Run `cc-safety-net rule sync` (add `--global` for user scope) to migrate them, then rerun doctor."}]:[]},{derive:(ce)=>{let me=ce.environment.find((ge)=>ge.name==="CC_SAFETY_NET_AUDIT_SCOPE");return Be(me?.value)==="invalid"?[{checkId:"environment.audit-scope-invalid",severity:"warning",title:"Audit scope value is invalid",detail:"CC_SAFETY_NET_AUDIT_SCOPE is not `all` or `blocked`, so allowed command decisions are not recorded.",fixHint:"Set CC_SAFETY_NET_AUDIT_SCOPE to `all` or `blocked`, then restart the integration."}]:[]}},...j2.map((ce)=>({derive:(me)=>me.posture.directories.filter((ge)=>ge.kind===ce&&ge.status==="unsafe").map((ge)=>({checkId:`posture.${ce}-directory-unsafe`,severity:"error",title:`${ce[0]?.toUpperCase()}${ce.slice(1)} directory is unsafe`,detail:`The ${ce} directory ${N2(ge.issues)}.`,fixHint:"Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.",...ge.path?{path:ge.path}:{}}))})),{derive:(ce)=>{let me=[...ce.effectiveSafety.weakenedRuleOverrides].sort();return me.length>0?[{checkId:"posture.rule-overrides-weaken-preset",severity:"warning",title:"Rule overrides weaken the selected preset",detail:`Explicit overrides disable rules the resolved preset would enable: ${me.join(", ")}.`,fixHint:`Remove these \`off\` overrides or set them to \`on\`: ${me.join(", ")}.`}]:[]}}];function ka(ce){return H2.flatMap((me,ge)=>me.derive(ce).map((he,Se)=>({finding:he,catalogOrder:ge,occurrence:Se}))).sort((me,ge)=>wa[me.finding.severity]-wa[ge.finding.severity]||me.catalogOrder-ge.catalogOrder||me.occurrence-ge.occurrence).map((me)=>me.finding)}function fn(){return Boolean(process.stdout.isTTY&&!process.env.NO_COLOR)}var M2=(ce)=>fn()?`\x1B[32m${ce}\x1B[0m`:ce,U2=(ce)=>fn()?`\x1B[33m${ce}\x1B[0m`:ce,G2=(ce)=>fn()?`\x1B[34m${ce}\x1B[0m`:ce,B2=(ce)=>fn()?`\x1B[35m${ce}\x1B[0m`:ce,q2=(ce)=>fn()?`\x1B[36m${ce}\x1B[0m`:ce,V2=(ce)=>fn()?`\x1B[31m${ce}\x1B[0m`:ce,z2=(ce)=>fn()?`\x1B[2m${ce}\x1B[0m`:ce,K2=(ce)=>fn()?`\x1B[1m${ce}\x1B[0m`:ce,Ht={green:M2,yellow:U2,blue:G2,magenta:B2,cyan:q2,red:V2,dim:z2,bold:K2},J2="\x1B[0m",W2=[39,82,198,226,208,51,196,46,201,214,93,154,220,27,49,190,200,33,129,227,45,160,63,118,123,202];function Y2(ce){let me=ce;return()=>(me=(me*1664525+1013904223)%4294967296,me/4294967296)}function Z2(ce){let me=[...W2],ge=Y2(ce);for(let he=me.length-1;he>0;he--){let Se=Math.floor(ge()*(he+1)),Fe=me[he];me[he]=me[Se],me[Se]=Fe}return me}function X2(ce,me=0){if(!fn())return"";let ge=Z2(me);return`\x1B[38;5;${ge[ce%ge.length]}m`}function xa(ce,me,ge=0){if(!fn())return`"${ce}"`;return`${X2(me,ge)}"${ce}"${J2}`}function Vr(ce){return ce==="default"?"built-in default":`${ce} policy`}var Q2=new RegExp("\x1B\\[[0-9;]*m","g"),ni=(ce)=>ce.replace(Q2,"").length;function En(ce){let me=(ce.headers??ce.rows[0]??[]).map((He,Ge)=>{let Dt=Math.max(...ce.rows.map((At)=>ni(At[Ge]??"")));return Math.max(ni(He),Dt)}),ge=(He,Ge)=>He+" ".repeat(Math.max(0,Ge-ni(He))),he=(He,Ge)=>Ge[0]+me.map((Dt)=>He.repeat(Dt+2)).join(Ge[1])+Ge[2],Se=(He)=>`│ ${He.map((Ge,Dt)=>ge(Ge,me[Dt]??0)).join(" │ ")} │`,Fe=ce.headers?[`   ${Se(ce.headers)}`,`   ${he("─",["├","┼","┤"])}`]:[];return[`   ${he("─",["┌","┬","┐"])}`,...Fe,...ce.rows.map((He)=>`   ${Se(He)}`),`   ${he("─",["└","┴","┘"])}`].join(`
`)}function Ca(ce){let me=[];me.push("Hook Integration"),me.push(ef(ce));let ge=[],he=[];for(let Se of ce){let Fe=Kt(Se.platform);if(Se.errors&&Se.errors.length>0)for(let He of Se.errors)if(Se.configured)ge.push({platform:Fe,message:He});else he.push({platform:Fe,message:He})}for(let Se of ge)me.push(`   Warning (${Se.platform}): ${Se.message}`);for(let Se of he)me.push(Ht.red(`   Error (${Se.platform}): ${Se.message}`));return me.join(`
`)}function ef(ce){let me=["Platform","Discovery","Configuration","Inspection"],ge=ce.map((he)=>{let Se=Kt(he.platform);if(he.inspectionStatus==="not-inspected"){let Dt=Ht.dim("Not inspected");return[Se,Dt,Dt,Dt]}let Fe=he.detected?Ht.green("Detected"):he.inspectionStatus==="failed"?Ht.red("Unknown"):Ht.dim("Not detected"),He=he.configured?Ht.green("Configured"):he.detected?Ht.yellow("Not configured"):he.inspectionStatus==="failed"?Ht.red("Unknown"):Ht.dim("Not applicable"),Ge=he.inspectionStatus==="verified"?Ht.green("Verified"):he.inspectionStatus==="failed"?Ht.red("Failed"):Ht.dim("Not applicable");return[Se,Fe,He,Ge]});return En({headers:me,rows:ge})}function Sa(ce){let ge=["Guard Engine Verification",`   Synthetic self-test: ${ce.failed>0?Ht.red(`${ce.passed}/${ce.total} FAIL`):Ht.green(`${ce.passed}/${ce.total} passed`)}`],he=ce.results.filter((Se)=>!Se.passed);if(he.length>0){ge.push(""),ge.push(Ht.red("   Failures:"));for(let Se of he)ge.push(Ht.red(`   • ${Se.description}`)),ge.push(Ht.red(`     expected ${Se.expected}, got ${Se.actual}`))}return ge.join(`
`)}function tf(ce){if(ce.length===0)return"   (no custom rules)";let me=["Source","Name","Command","Block Args"],ge=ce.map((he)=>[he.source,he.name,he.subcommand?`${he.command} ${he.subcommand}`:he.command,he.blockArgs.join(", ")]);return En({headers:me,rows:ge})}function Ra(ce){let me=[];if(me.push("Configuration"),me.push(nf(ce.userConfig,ce.projectConfig)),me.push(""),ce.effectiveRules.length>0)me.push(`   Effective rules (${ce.effectiveRules.length} total):`),me.push(tf(ce.effectiveRules));else me.push("   Effective rules: (none - using built-in rules only)");for(let ge of ce.shadowedRules)me.push(""),me.push(`   Note: Project rule "${ge.name}" shadows user rule with same name`);return me.join(`
`)}function nf(ce,me){let ge=["Scope","Status"],he=(Fe)=>{if(!Fe.exists)return Ht.dim("N/A");if(!Fe.valid)return Ht.red(`Invalid (${Fe.errors?.[0]??"unknown error"})`);return Ht.green("Configured")},Se=[["User",he(ce)],["Project",he(me)]];return En({headers:ge,rows:Se})}function Pa(ce){let me=[];return me.push("Environment"),me.push(rf(ce)),me.join(`
`)}function Da(ce){let me=ce.effectiveSafety.policyScopes,ge=["Effective Safety",`   Selected preset: ${ce.effectiveSafety.selectedPreset}${me?` (${Vr(me.levelScope)})`:""}`,`   Effective: ${ce.effectiveSafety.level}`],he=[["fail_closed","fail_closed"],["paranoid_rm","paranoid_rm"],["paranoid_interpreters","paranoid_interpreters"]];for(let[Se,Fe]of he){let He=ce.effectiveSafety.capabilities[Se],Ge=He.enabled?Ht.green("ON"):Ht.dim("OFF"),Dt=He.sources.length>0?` (${He.sources.join(", ")})`:"";ge.push(`   ${Fe}: ${Ge} via ${He.source}${Dt}`)}if(me&&me.weakenings.length>0){ge.push("   Project policy deltas:");for(let Se of me.weakenings)ge.push(`      ${Se}`)}ge.push(`   Stored rule customizations: ${ce.effectiveSafety.ruleCounts.stored}`),ge.push(`   Effective rule customizations: ${ce.effectiveSafety.ruleCounts.effective}`);for(let[Se,Fe]of Object.entries(ce.effectiveSafety.ruleOverrides))ge.push(`   ${Se}: ${Fe}`);return ge.join(`
`)}function Aa(ce){let me=["Findings"];if(ce.length===0)return me.push("   No findings from inspected doctor facts."),me.join(`
`);for(let ge of ce){let he=`[${ge.severity.toUpperCase()}] ${ge.checkId}: ${en(ge.title)}`,Se=ge.severity==="error"?Ht.red:ge.severity==="warning"?Ht.yellow:Ht.blue;if(me.push(`   ${Se(he)}`),me.push(`      ${en(ge.detail)}`),ge.path)me.push(`      Path: ${en(ge.path)}`);if(ge.fixHint)me.push(`      Fix: ${en(ge.fixHint)}`)}return me.join(`
`)}function rf(ce){let me=["Variable","Status","Legacy"],ge=ce.map((he)=>{let Se=he.isSet?Ht.green("✓"):Ht.dim("✗"),Fe=he.legacyName&&he.legacyIsSet?`${he.legacyName} ${Ht.green("✓")}`:he.legacyName??"";return[he.name,Se,Fe]});return En({headers:me,rows:ge})}function Ea(ce){let me=[];if(ce.totalBlocked===0)me.push("Recent Activity"),me.push("   No blocked commands in the last 7 days"),me.push("   Tip: This is normal for new installations");else me.push(`Recent Activity · last 7 days (${ce.totalBlocked} blocked / ${ce.sessionCount} sessions)`),me.push(of(ce.recentEntries));if(ce.unreadable>0)me.push(`   Warning: ${ce.unreadable} audit log ${ce.unreadable===1?"source":"sources"} could not be read; this summary is incomplete`);return me.join(`
`)}function of(ce){let me=["Time","Command"],ge=ce.map((he)=>{let Se=en(he.command.replace(/\r\n|\r|\n/g," ↵ ").replace(/\t/g," ")),Fe=Se.length>40?`${Se.slice(0,37)}...`:Se;return[he.relativeTime,Fe]});return En({headers:me,rows:ge})}function _a(ce){let me=[];if(me.push("Update Check"),ce.latestVersion===null&&!ce.error)return me.push(zr([["Status",Ht.dim("Skipped")],["Installed",ce.currentVersion]])),me.join(`
`);if(ce.error)return me.push(zr([["Status",`${Ht.yellow("⚠")} Error`],["Installed",ce.currentVersion],["Error",Ht.dim(ce.error)]])),me.join(`
`);if(ce.updateAvailable)return me.push(zr([["Status",`${Ht.yellow("⚠")} Update Available`],["Current",ce.currentVersion],["Latest",Ht.green(ce.latestVersion??"")]])),me.push(""),me.push("   Run: bunx cc-safety-net@latest doctor"),me.push("   Or:  npx cc-safety-net@latest doctor"),me.join(`
`);return me.push(zr([["Status",`${Ht.green("✓")} Up to date`],["Version",ce.currentVersion]])),me.join(`
`)}function zr(ce){return En({rows:ce})}function Ta(ce){let me=[];return me.push("System Info"),me.push(sf(ce)),me.join(`
`)}function sf(ce){let me=["Component","Version"],ge=(Fe)=>{if(Fe===null)return Ht.dim("not found");return Fe},Se=[{label:"cc-safety-net",value:ce.version},...Hr.map((Fe)=>({label:Kt(Fe),value:ce.versions[Fe]??null})),{label:"Node.js",value:ce.nodeVersion},{label:"npm",value:ce.npmVersion},{label:"Bun",value:ce.bunVersion},{label:"Platform",value:ce.platform}].map((Fe)=>[Fe.label,ge(Fe.value)]);return En({headers:me,rows:Se})}function Ia(ce){if(ce.findings.length===0)return Ht.green(`
No findings from inspected doctor facts.`);let me={error:ce.findings.filter((Fe)=>Fe.severity==="error").length,warning:ce.findings.filter((Fe)=>Fe.severity==="warning").length,info:ce.findings.filter((Fe)=>Fe.severity==="info").length},ge=["error","warning","info"].filter((Fe)=>me[Fe]>0).map((Fe)=>`${me[Fe]} ${Fe}`),he=ce.findings.length===1?"finding":"findings",Se=`
${ce.findings.length} ${he}: ${ge.join(", ")}.`;if(me.error>0)return Ht.red(Se);if(me.warning>0)return Ht.yellow(Se);return Ht.blue(Se)}import{lstatSync as af}from"node:fs";import{dirname as ri}from"node:path";function oi(ce,me){try{let ge=af(me);if(ge.isSymbolicLink())return{kind:ce,path:me,status:"unsafe",issues:["symlink"]};if(!ge.isDirectory())return{kind:ce,path:me,status:"unsafe",issues:["not-directory"]};if(process.platform==="win32"||typeof process.getuid!=="function")return{kind:ce,path:me,status:"unknown",issues:[]};let he=[...ge.uid!==process.getuid()?["ownership"]:[],...(ge.mode&18)!==0?["permissions"]:[]];return{kind:ce,path:me,status:he.length>0?"unsafe":"safe",issues:he}}catch(ge){if(typeof ge==="object"&&ge!==null&&"code"in ge&&ge.code==="ENOENT")return{kind:ce,path:me,status:"not-applicable",issues:[]};return{kind:ce,path:me,status:"unknown",issues:[]}}}function $a(ce){let me=F();return{directories:[oi("policy",ri(ri(ce))),oi("config",ri(ce)),...me?[oi("audit",me)]:[{kind:"audit",status:"unknown",issues:[]}]]}}import{spawn as lf}from"node:child_process";import{existsSync as Oa}from"node:fs";import{delimiter as cf,extname as df,join as uf}from"node:path";import{stripVTControlCharacters as Fa}from"node:util";var Na="2.3.3",pf=5000,ff="_CC_SAFETY_NET_TEST_SPAWN_PLATFORM";function Xt(){return Na}function ii(ce,me){let ge=ce[me];if(ge)return ge;let he=Object.keys(ce).find((Se)=>Se.toLowerCase()===me.toLowerCase()&&!!ce[Se]);return he?ce[he]:ge}function mf(ce){return(ii(ce,"PATHEXT")||".COM;.EXE;.BAT;.CMD").split(";").filter((me)=>me.length>0)}function gf(ce,me){let ge=df(ce)?[ce]:[...mf(me).map((he)=>`${ce}${he}`),ce];if(ce.includes("/")||ce.includes("\\"))return ge.find((he)=>Oa(he))??ce;return(ii(me,"PATH")??"").split(cf).flatMap((he)=>ge.map((Se)=>uf(he,Se))).find((he)=>Oa(he))??ce}function ja(ce){if(!/[\s"&|<>^]/.test(ce))return ce;return`"${ce.replace(/"/g,'""')}"`}function _n(ce,me){let[ge,...he]=ce,Se=me[ff]==="win32"?"win32":process.platform;if(!ge||Se!=="win32")return{cmd:ge??"",args:he};let Fe=gf(ge,me);if(!/\.(?:bat|cmd)$/i.test(Fe))return{cmd:Fe,args:he};return{cmd:ii(me,"COMSPEC")??"cmd.exe",args:["/d","/c",["call",ja(Fe),...he.map(ja)].join(" ")]}}var Jn=async(ce,me=pf)=>{let ge=await hf(ce,{timeoutMs:me});if(ge.code!==0)return null;return Fa(ge.stdout).trim()||Fa(ge.stderr).trim()||null};function hf(ce,me){let[ge,...he]=ce;if(!ge)return Promise.resolve({code:null,stdout:"",stderr:""});return new Promise((Se)=>{try{let Fe=_n([ge,...he],process.env),He=lf(Fe.cmd,Fe.args,{stdio:["ignore","pipe","pipe"]}),Ge=!1,Dt="",At="";He.stdout.on("data",(jt)=>{Dt+=jt.toString()}),He.stderr.on("data",(jt)=>{At+=jt.toString()});let Tt=(jt)=>{if(Ge)return;Ge=!0,clearTimeout(Ft),Se(jt)},Ft=setTimeout(()=>{He.kill(),Tt({code:null,stdout:Dt,stderr:At})},me.timeoutMs);He.on("close",(jt)=>{Tt({code:jt,stdout:Dt,stderr:At})}),He.on("error",()=>{Tt({code:null,stdout:Dt,stderr:At})})}catch{Se({code:null,stdout:"",stderr:""})}})}function Kr(ce){if(!ce)return null;let me=/Claude Code\s+(\d+\.\d+\.\d+)/i.exec(ce);if(me)return me[1]??null;let ge=/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(ce);if(ge)return ge[1]??null;return ce.split(`
`)[0]?.trim()||null}async function mr(ce=Jn){let[me,ge,he,Se,Fe,He]=await Promise.all([Promise.all(an.map(async(Ge)=>[Ge.id,Kr(await ce([...Ge.probeCommand]))])),ce(["codex","plugin","list"],30000),ce(["amp","plugins","list"],30000),ce(["node","--version"]),ce(["npm","--version"]),ce(["bun","--version"])]);return{version:Na,versions:Object.fromEntries(me),codexPluginListOutput:ge,ampPluginListOutput:he,nodeVersion:Kr(Se),npmVersion:Kr(Fe),bunVersion:Kr(He),platform:`${process.platform} ${process.arch}`}}function si(ce,me){if(me==="dev")return!1;let ge=ce.split(".").map(Number),he=me.split(".").map(Number),[Se=0,Fe=0,He=0]=ge,[Ge=0,Dt=0,At=0]=he;if(Se!==Ge)return Se>Ge;if(Fe!==Dt)return Fe>Dt;return He>At}async function Cn(){let ce=Xt(),me=new AbortController,ge=setTimeout(()=>me.abort(),3000);try{let he=await fetch("https://registry.npmjs.org/cc-safety-net/latest",{signal:me.signal});if(!he.ok)return{currentVersion:ce,latestVersion:null,updateAvailable:!1,error:`npm registry returned ${he.status}`};let Se=await he.json(),Fe=si(Se.version,ce);return{currentVersion:ce,latestVersion:Se.version,updateAvailable:Fe}}catch(he){return{currentVersion:ce,latestVersion:null,updateAvailable:!1,error:he instanceof Error?he.message:"Network error"}}finally{clearTimeout(ge)}}import*as za from"node:readline";var Ga=(ce)=>`\x1B[${ce}B`,yf=(ce)=>`\x1B[${ce}A`;var Ha=["░","▒","▓","╱","╲","┃","━","┏","┓","┗","┛","╋"];function vf(ce){return new Promise((me)=>setTimeout(me,ce))}function bf(ce,me,ge){if(!ge)return me(ce);if(ge.aborted)return Promise.resolve();return new Promise((he,Se)=>{let Fe=()=>ge.removeEventListener("abort",He),He=()=>{Fe(),he()};ge.addEventListener("abort",He,{once:!0}),me(ce).then(()=>{Fe(),he()},(Ge)=>{Fe(),Se(Ge)})})}function gr(ce,me){return ce&&ce>0?ce:me}function Jr(ce){return Math.max(0,Math.min(1,ce))}function Wn(ce){return Math.max(0,Math.min(255,Math.round(ce)))}function ai(ce){return ce<=0.0031308?12.92*ce:1.055*ce**0.4166666666666667-0.055}function Lf(ce,me,ge){let he=ge*Math.PI/180,Se=me*Math.cos(he),Fe=me*Math.sin(he),He=(ce+0.3963377774*Se+0.2158037573*Fe)**3,Ge=(ce-0.1055613458*Se-0.0638541728*Fe)**3,Dt=(ce-0.0894841775*Se-1.291485548*Fe)**3;return{blue:Wn(ai(Jr(-0.0041960863*He-0.7034186147*Ge+1.707614701*Dt))*255),green:Wn(ai(Jr(-1.2684380046*He+2.6097574011*Ge-0.3413193965*Dt))*255),red:Wn(ai(Jr(4.0767416621*He-3.3077115913*Ge+0.2309699292*Dt))*255)}}function li(ce,me){let ge=(me*ce*180/Math.PI%360+360)%360;return Lf(0.72,0.15,ge)}function Ba(ce,me=0.1){let ge=li(me,ce);return`\x1B[38;2;${ge.red};${ge.green};${ge.blue}m`}function wf(ce,me){return{blue:Wn(ce.blue+(255-ce.blue)*me),green:Wn(ce.green+(255-ce.green)*me),red:Wn(ce.red+(255-ce.red)*me)}}function qa(ce,me,ge){let he=Math.imul(ce+2654435769,2246822507)^Math.imul(me+3266489909,668265263)^Math.imul(ge+374761393,2654435761),Se=he^he>>>15,Fe=Math.imul(Se,739982445),He=Fe^Fe>>>12,Ge=Math.imul(He,695872825);return((Ge^Ge>>>15)>>>0)/4294967296}function kf(ce,me,ge){let he=Math.floor(qa(ce,me,ge)*Ha.length);return Ha[he]??"░"}function Ma(ce){let me=Jr(ce);return me*me*me*(me*(me*6-15)+10)}function xf(ce){if(ce.length===0)return"";let me=[],ge=!1,he="";for(let Se of ce){let Fe=`${Se.red};${Se.green};${Se.blue}`;if(Se.bold!==ge)me.push(Se.bold?"\x1B[1m":"\x1B[22m"),ge=Se.bold;if(Fe!==he)me.push(`\x1B[38;2;${Fe}m`),he=Fe;me.push(Se.character)}return`${me.join("")}\x1B[22m\x1B[39m`}function Cf(ce,me,ge,he,Se){return ce.map((Fe,He)=>({...li(ge,he+me+He/Se),bold:!1,character:Fe}))}function Sf(ce,me,ge,he,Se,Fe,He,Ge){let Dt=Math.max(1,he*0.75),At=Math.min(1,ge/Dt),Tt=Se*Ma(At),Ft=Math.max(0,(ge-Dt)/Math.max(1,he-Dt)),jt=(1-Ma(ge/he))*Ge*2,It=0.35*Math.max(0,1-Ft*2),$t=At>=1,Ot=Math.min(ce.length,Math.ceil(Tt+2+1));return ce.slice(0,Ot).map((Ut,Gt)=>{let Nt=li(Fe,He+me+Gt/Ge+jt),Vt=Gt+qa(me,Gt,7919)*2-1;if(Vt>Tt+2)return{...Nt,bold:!1,character:" "};let Mt=Tt-Vt,zt=0.8*Math.exp(-(Mt*Mt)/12.5),un=Math.min(0.9,zt+It),Ir=!$t&&Vt>Tt-4;return{...wf(Nt,un),bold:un>0.3,character:Ir?kf(me,Gt,ge):Ut}})}function Ua(ce){return`\x1B[?2026h${ce.map((me,ge)=>`\x1B8${ge>0?Ga(ge):""}${xf(me)}`).join("")}\x1B[?2026l`}async function ci(ce,me={}){if(!ce)return;let ge=me.output??process.stdout,he=me.sleep??vf,Se=gr(me.frequency,0.1),Fe=me.seed??0,He=gr(me.speed,40),Ge=gr(me.spread,3),Dt=gr(me.frameRate,60),At=Math.max(1,Math.floor(gr(me.duration,12))),Tt=ce.split(`
`).map((Ot)=>Array.from(Ot)),Ft=Math.max(...Tt.map((Ot)=>Ot.length)),jt=1000*At*Tt.filter((Ot)=>Ot.length>0).length/He,It=Ft>0?Math.max(1,Math.ceil(jt/(1000/Dt))):0,$t=It>0?jt/It:0;ge.write(`\x1B[?25l${Tt.length>1?`${`
`.repeat(Tt.length-1)}${yf(Tt.length-1)}`:""}\x1B7`);try{for(let Ot=1;Ot<=It;Ot+=1){if(me.signal?.aborted)break;ge.write(Ua(Tt.map((Ut,Gt)=>Sf(Ut,Gt,Ot,It,Ft,Se,Fe,Ge)))),await bf($t,he,me.signal)}}finally{if(ge.write(Ua(Tt.map((Ot,Ut)=>Cf(Ot,Ut,Se,Fe,Ge)))),ge.write("\x1B8"),Tt.length>1)ge.write(Ga(Tt.length-1));ge.write(`
\x1B[0m\x1B[?25h`)}}var Va=["┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛","┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ","━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "].join(`
`);function Rf(ce){return Boolean(ce.isTTY)}async function hr(ce={}){let me=ce.output??process.stdout;if(!Rf(me))return;let ge=ce.input??process.stdin,he={duration:ce.duration,frequency:ce.frequency,output:me,seed:ce.seed??Math.random()*8192,sleep:ce.sleep,speed:ce.speed,spread:ce.spread};if(!ge.isTTY||typeof ge.setRawMode!=="function"){await ci(Va,he);return}let Se=new AbortController,Fe=ge.readableFlowing===!0,He=ge.isRaw===!0,Ge=!1,Dt=(At,Tt)=>{if(Tt.ctrl&&Tt.name==="c")Ge=!0;if(Ge||Tt.name==="return"||Tt.name==="enter")Se.abort()};za.emitKeypressEvents(ge),ge.on("keypress",Dt),ge.setRawMode(!0),ge.resume();try{await ci(Va,{...he,signal:Se.signal})}finally{if(ge.off("keypress",Dt),ge.setRawMode(He),!Fe)ge.pause()}if(!Ge)return;if(ce.onInterrupt){ce.onInterrupt();return}process.kill(process.pid,"SIGINT")}import{createHash as Pf}from"node:crypto";import{existsSync as Ka}from"node:fs";import{dirname as Wr,join as Ja}from"node:path";var Df="`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.",Af="cache",Ef="rulebooks";function Wa(ce={}){let me=C(ce),ge=o(me.filesystemScope,Za(me.configDir)),he=n(me.lockTarget);if(console.log(Df),he===null&&!Ka(ge.path))return console.log(`No v2 lock or cache leftovers found in ${Wr(me.configDir)}; nothing to migrate.`),0;let Se=Of(he),Fe=p(me.configTarget);if(!Fe.config&&(n(me.configTarget)!==null||Se.size>0))return console.error(`Cannot migrate: the rules config in ${Wr(me.configDir)} is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.`),1;let He=Fe.config?.rules??[];for(let Ge of He.flatMap((Dt)=>_f(Dt,Se,me,ge,ce.global===!0)))console.log(Ge);return Y(me.lockTarget),vt(ge),console.log(`Removed the v2 lock and cache under ${Wr(me.configDir)}.`),0}function Ya(ce){return[...new Set([{cwd:ce},{cwd:ce,global:!0}].flatMap((me)=>{let ge=C(me);return[ge.lockPath,Za(ge.configDir)]}))].filter((me)=>Ka(me))}function _f(ce,me,ge,he,Se){if(!b(ce))return[];let Fe=G(ce).name,He=o(ge.filesystemScope,W(ge.configDir,Fe)),Ge=n(He);if(Ge!==null&&Tf(Ge,Fe))return[];let Dt=me.get(ce),At=Dt?If(Dt,Fe,he.path,ge.filesystemScope):null;if(At===null)return[`Could not migrate ${ce} from the v2 cache. Run \`cc-safety-net rule update ${ce}${Se?" --global":""}\` to vendor it.`];if(v(He,At),Ge!==null)return[`Restored ${ce} from the v2 cache over an invalid file.`];return[`Vendored ${ce} from the v2 cache.`]}function Tf(ce,me){let ge=Re(ce);return!("problem"in ge)&&ge.rulebook.name===me}function If(ce,me,ge,he){let Se=Ja(ge,Ef,`${$f(ce)}--${ce.digest.replace("sha256:","").slice(0,12)}`,we),Fe=n(o(he,Se));if(Fe===null||Nf(Fe)!==ce.digest)return null;let He=Re(Fe);if("problem"in He||He.rulebook.name!==me)return null;return Fe}function Za(ce){return Ja(Wr(ce),Af)}function $f(ce){return([ce.owner,ce.repo,ce.display_ref,ce.name].every((he)=>typeof he==="string"&&he!=="")?`${ce.owner}/${ce.repo}#${ce.display_ref}/${ce.name}`:ce.spec).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"rulebook"}function Of(ce){let me=ce===null?null:jf(ce),ge=Xa(me)&&Array.isArray(me.rulebooks)?me.rulebooks:[];return new Map(ge.filter(Ff).map((he)=>[he.spec,he]))}function Ff(ce){return Xa(ce)&&typeof ce.spec==="string"&&typeof ce.digest==="string"}function Xa(ce){return!!ce&&typeof ce==="object"}function jf(ce){try{return JSON.parse(ce)}catch{return null}}function Nf(ce){return`sha256:${Pf("sha256").update(ce).digest("hex")}`}var Qa="\r\x1B[2K",Hf="\x1B[?25l",Mf="\x1B[39m",Uf="\x1B[?25h",Gf=100,Bf=0.55,qf=80,el=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Vf(ce){return new Promise((me)=>setTimeout(me,ce))}async function Yr(ce,me={}){let ge=me.output??process.stdout;if(!ge.isTTY)return ce;let he=me.sleep??Vf,Se=!1,Fe=ce.then((Ge)=>(Se=!0,Ge),(Ge)=>{throw Se=!0,Ge});if(await Promise.race([Fe.then(()=>!0),he(Gf).then(()=>!1)]))return Fe;ge.write(Hf);try{for(let Ge=0;!Se;Ge+=1)ge.write(`${Qa}${Ba(Ge*Bf)}${el[Ge%el.length]}${Mf} ${me.loadingMessage??"Loading…"}`),await Promise.race([Fe,he(qf)]);return await Fe}finally{ge.write(`${Qa}${Uf}`)}}async function yr(ce,me,ge,he={}){let Se=me();if(ce)await ge();if(ce&&Se.ready)await Yr(Se.ready,he);return Se.finish()}import{homedir as Lg}from"node:os";import{stripVTControlCharacters as zf}from"node:util";var Zr="amp plugins list",Kf=/^\s*[✓✗]\s+cc-safety-net(?:\.ts)?\s+\(User Plugins\)\s+(\S+)\s*$/;function tl(ce){if(!ce.ampPluginListOutput)return{platform:"amp",status:"n/a"};let me=zf(ce.ampPluginListOutput).split(`
`).map((ge)=>Kf.exec(ge)?.[1]).find((ge)=>ge!==void 0);if(!me)return{platform:"amp",status:"n/a"};if(me!=="active")return{platform:"amp",status:"disabled",method:Zr,configPath:Zr,errors:[`Amp personal plugin cc-safety-net is ${me}; run "plugins: reload" in Amp or reinstall with install --amp`]};return{platform:"amp",status:"configured",method:Zr,configPath:Zr}}import{existsSync as Jf,readFileSync as Wf}from"node:fs";var Yf=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;function Zf(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return[];return Object.values(ce).flatMap((me)=>{if(!me||typeof me!=="object"||Array.isArray(me))return[];let ge=me,he=ge.PreToolUse;if(!Array.isArray(he))return[];return he.flatMap((Se)=>{if(!Se||typeof Se!=="object"||Array.isArray(Se))return[];let Fe=Se.hooks;if(!Array.isArray(Fe))return[];return Fe.flatMap((He)=>{if(!He||typeof He!=="object"||Array.isArray(He))return[];let Ge=He.command;if(typeof Ge!=="string"||!Yf.test(Ge))return[];return[{command:Ge,enabled:ge.enabled!==!1}]})})})}function nl(ce){let me=pr(ce.homeDir);if(!Jf(me))return{platform:"antigravity-cli",status:"n/a",configPath:me};let ge;try{ge=Zf(JSON.parse(Wf(me,"utf-8")))}catch(he){return{platform:"antigravity-cli",status:"n/a",configPath:me,errors:[`Failed to parse Antigravity hooks config ${me}: ${he instanceof Error?he.message:String(he)}`]}}if(ge.some((he)=>he.enabled))return{platform:"antigravity-cli",status:"configured",method:"hook config",configPath:me};if(ge.length>0)return{platform:"antigravity-cli",status:"disabled",method:"hook config",configPath:me};return{platform:"antigravity-cli",status:"n/a",configPath:me}}import{join as rl}from"node:path";import{existsSync as Xf,lstatSync as Qf,readFileSync as em}from"node:fs";function mn(ce,me=(ge)=>ge){if(!Xf(ce))return{kind:"missing"};try{return{kind:"ok",value:JSON.parse(me(em(ce,"utf-8")))}}catch{return{kind:"unreadable"}}}function Yt(ce){try{return Qf(ce)}catch{return}}function Xr(ce,me){let ge=Yt(me);if(!ge)return{platform:ce,status:"n/a",configPath:me};if(!ge.isSymbolicLink()&&ge.isDirectory())return;return{platform:ce,status:"n/a",configPath:me,errors:[`${me} is a symlink or not a directory; move or remove it before installing`]}}function Bt(ce,me){return typeof ce==="object"&&ce!==null?ce[me]:void 0}var di="cc-safety-net@cc-marketplace";function ol(ce){return rl(ce,".claude","plugins","installed_plugins.json")}function il(ce,me){let ge=Bt(Bt(ce,"plugins"),me);return Array.isArray(ge)&&ge.length>0}function Qr(ce,me){let ge=mn(ol(ce));return ge.kind==="ok"&&il(ge.value,me)}function ui(ce){let me=ol(ce),ge=mn(me);if(ge.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(ge.kind==="missing")return{platform:"claude-code",status:"n/a"};if(!il(ge.value,di))return{platform:"claude-code",status:"n/a"};let he=rl(ce,".claude","settings.json"),Se=mn(he);if(Se.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(!(Se.kind==="ok"&&Bt(Bt(Se.value,"enabledPlugins"),di)===!0))return{platform:"claude-code",status:"disabled",method:"plugin config",configPath:he,errors:[`${di} is installed but not enabled in Claude Code`]};return{platform:"claude-code",status:"configured",method:"plugin config",configPath:me}}function sl(ce){return ui(ce.homeDir)}function al(ce){if(!ce.codexPluginListOutput)return{platform:"codex",status:"n/a"};let me=ce.codexPluginListOutput.split(`
`).find((ge)=>ge.includes("https://github.com/kenryu42/cc-safety-net.git"));if(!me)return{platform:"codex",status:"n/a"};if(!me.includes("installed,"))return{platform:"codex",status:"n/a"};if(!me.includes("installed, enabled"))return{platform:"codex",status:"disabled",method:"codex plugin list",configPath:"codex plugin list",errors:["Codex plugin line for https://github.com/kenryu42/cc-safety-net.git must contain installed, enabled."]};return{platform:"codex",status:"configured",method:"codex plugin list",configPath:"codex plugin list"}}import{existsSync as ro,readdirSync as tm,readFileSync as nm}from"node:fs";import{join as rn}from"node:path";var gn="cc-safety-net@cc-marketplace",eo=["cc-marketplace","cc-safety-net"],ll=["_direct","copilot-safety-net"],cl=["cc-marketplace","safety-net"],dl="safety-net@cc-marketplace";function to(ce,me){let ge=me.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(^|[^a-z0-9-])${ge}([^a-z0-9-]|$)`,"m").test(ce??"")}function ul(ce){return to(ce,"cc-safety-net@cc-marketplace")}function pl(ce){return to(ce,"cc-marketplace")}function fl(ce){return to(ce,"copilot-safety-net")}function ml(ce){return to(ce,"safety-net@cc-marketplace")}function sn(ce){let me="",ge=0,he=!1,Se=!1,Fe=-1;while(ge<ce.length){let He=ce[ge],Ge=ce[ge+1];if(Se){me+=He,Se=!1,ge++;continue}if(He==='"'&&!he){he=!0,Fe=-1,me+=He,ge++;continue}if(He==='"'&&he){he=!1,me+=He,ge++;continue}if(He==="\\"&&he){Se=!0,me+=He,ge++;continue}if(he){me+=He,ge++;continue}if(He==="/"&&Ge==="/"){while(ge<ce.length&&ce[ge]!==`
`)ge++;continue}if(He==="/"&&Ge==="*"){ge+=2;while(ge<ce.length-1){if(ce[ge]==="*"&&ce[ge+1]==="/"){ge+=2;break}ge++}continue}if(He===","){Fe=me.length,me+=He,ge++;continue}if(He==="}"||He==="]"){if(Fe!==-1){let Dt=me.slice(Fe+1);if(/^\s*$/.test(Dt))me=me.slice(0,Fe)+Dt}Fe=-1,me+=He,ge++;continue}if(!/\s/.test(He))Fe=-1;me+=He,ge++}return me}function pi(ce){if(!ce?.includes("cc-safety-net"))return!1;return/(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(ce)}function hl(ce,me){if(!ce)return null;let ge=ce.match(/(\d+)\.(\d+)\.(\d+)/);if(!ge)return null;let he=[Number(ge[1]),Number(ge[2]),Number(ge[3])];for(let Se=0;Se<me.length;Se++){let Fe=he[Se]??0,He=me[Se]??0;if(Fe!==He)return Fe>He}return!0}function rm(ce){return hl(ce,[0,0,422])}function om(ce){return hl(ce,[1,0,8])}function vr(ce){return process.env.COPILOT_HOME||rn(ce,".copilot")}function fi(ce){return(ce.hooks?.preToolUse??[]).some((ge)=>{if(ge.type!=="command")return!1;return pi(ge.command)||pi(ge.bash)||pi(ge.powershell)})}function no(ce){return ce===void 0||typeof ce==="string"}function im(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return!1;let me=ce;if(me.disableAllHooks!==void 0&&typeof me.disableAllHooks!=="boolean")return!1;if(me.hooks===void 0)return!0;if(!me.hooks||typeof me.hooks!=="object"||Array.isArray(me.hooks))return!1;let ge=me.hooks.preToolUse;if(ge===void 0)return!0;return Array.isArray(ge)&&ge.every((he)=>he!==null&&typeof he==="object"&&!Array.isArray(he)&&no(he.type)&&no(he.command)&&no(he.bash)&&no(he.powershell))}function mi(ce,me){try{let ge=JSON.parse(sn(nm(ce,"utf-8")));if(!im(ge)){me?.push(`Invalid hook config ${ce}: hooks.preToolUse must be an array of hook objects`);return}return ge}catch(ge){me?.push(`Failed to parse ${ce}: ${ge instanceof Error?ge.message:String(ge)}`);return}}function yl(ce,me){try{return tm(ce).filter((ge)=>ge.endsWith(".json")).sort((ge,he)=>ge.localeCompare(he))}catch(ge){return me?.push(`Failed to read ${ce}: ${ge instanceof Error?ge.message:String(ge)}`),[]}}function sm(ce,me){if(!ro(ce))return[];let ge=[];for(let he of yl(ce,me)){let Se=rn(ce,he),Fe=mi(Se,me);if(Fe&&fi(Fe))ge.push(Se)}return ge}function Yn(ce,me){if(!ro(ce))return;let ge=mi(ce,me);if(!ge)return;return{path:ce,config:ge}}function gl(ce,me,ge,he){if(me){ce.push(`GitHub Copilot CLI ${me} does not support ${ge}; requires ${he}+`);return}ce.push(`GitHub Copilot CLI version unavailable; skipping ${ge} because it requires ${he}+`)}function am(ce){for(let me of ce){if(me?.config.disableAllHooks===!0)return me.path;if(me?.config.disableAllHooks===!1)return}return}function lm(ce,me,ge,he){let Se=vr(ce),Fe=rn(me,".github","hooks"),He=rn(Se,"hooks"),Ge=rn(me,".github","copilot"),Dt=rn(me,".claude"),At=om(ge),Tt=At===!0?he:void 0,Ft=[Yn(rn(Ge,"settings.local.json"),Tt),Yn(rn(Ge,"settings.json"),Tt),Yn(rn(Dt,"settings.local.json"),Tt),Yn(rn(Dt,"settings.json"),Tt)],jt=[Yn(rn(Se,"settings.json"),Tt),Yn(rn(Se,"config.json"),Tt)];if(At!==!1){let Mt=am([...Ft,...jt]);if(Mt){if(At===null)he.push(`GitHub Copilot CLI version unavailable; treating disableAllHooks in ${Mt} as active`);return{activeConfigPaths:[],disabledBy:Mt}}}let It=sm(Fe,he),$t=rm(ge),Ot=$t===!0?he:void 0,Ut=ro(He)?yl(He,Ot):[],Gt=[];for(let Mt of Ut){let zt=rn(He,Mt),un=mi(zt,Ot);if(un&&fi(un))Gt.push(zt)}if($t!==!0&&Gt.length>0)gl(he,ge,`user hook files in ${He}`,"0.0.422"),Gt.length=0;let Nt=[];for(let Mt of[...Ft,...jt]){if(!Mt)continue;if(!fi(Mt.config))continue;if(At===!0){Nt.push(Mt);continue}gl(he,ge,"inline hook definitions in Copilot config files","1.0.8");break}let Vt=(Mt)=>Mt.filter((zt)=>!!zt&&Nt.includes(zt)).map((zt)=>zt.path);return{activeConfigPaths:[...Vt(Ft),...It,...Vt(jt),...Gt]}}function vl(ce){let me=[],ge=lm(ce.homeDir,ce.cwd,ce.copilotCliVersion,me);if(ge.disabledBy)return{platform:"copilot-cli",status:"disabled",method:"hook config",configPath:ge.disabledBy,configPaths:[ge.disabledBy],errors:me.length>0?me:void 0};let he=vr(ce.homeDir),Se=rn(he,"installed-plugins",...eo),Fe=ro(Se),He=rn(he,"settings.json"),Ge=mn(He,sn);if(Fe&&Ge.kind==="unreadable")return{platform:"copilot-cli",status:"not-inspected"};if(Fe&&Ge.kind==="ok"&&Bt(Bt(Ge.value,"enabledPlugins"),gn)===!1)return{platform:"copilot-cli",status:"disabled",method:"plugin config",configPath:He,errors:[`${gn} is installed but not enabled in Copilot CLI`]};if(Fe||ge.activeConfigPaths.length>0){let Dt=Fe,At=ge.activeConfigPaths[0];return{platform:"copilot-cli",status:"configured",method:Dt?"plugin config":"hook config",configPath:At??(Dt?Se:void 0),configPaths:ge.activeConfigPaths.length>0?ge.activeConfigPaths:void 0,errors:me.length>0?me:void 0}}return{platform:"copilot-cli",status:"n/a",errors:me.length>0?me:void 0}}import{existsSync as vm,readFileSync as bm}from"node:fs";import{existsSync as bl,mkdirSync as um,readFileSync as pm}from"node:fs";import{dirname as fm,join as mm}from"node:path";import{renameSync as cm,writeFileSync as dm}from"node:fs";function Qt(ce,me){let ge=`${ce}.${process.pid}.tmp`;dm(ge,me),cm(ge,ce)}var br="npx -y cc-safety-net hook --cursor",Ll=30;function io(ce){return mm(ce,".cursor","hooks.json")}function Tn(ce){return typeof ce==="object"&&ce!==null&&!Array.isArray(ce)}function gi(){return{command:br,timeout:Ll,failClosed:!0}}function oo(ce){return Tn(ce)&&ce.command===br}function gm(ce){return Object.keys(ce).length===3&&ce.command===br&&ce.timeout===Ll&&ce.failClosed===!0}function hm(ce){try{return JSON.parse(pm(ce,"utf-8"))}catch(me){if(me instanceof SyntaxError)throw Error(`Failed to parse Cursor hooks config ${ce}: ${me.message}`);throw me}}function wl(ce){let me=hm(ce);if(!Tn(me))throw Error(`Cursor hooks config ${ce} must be a JSON object`);if(me.version!==1)throw Error(`Cursor hooks config ${ce} must set "version": 1`);if(me.hooks!==void 0&&!Tn(me.hooks))throw Error(`Cursor hooks config ${ce} "hooks" must be an object`);let ge=Tn(me.hooks)?me.hooks.preToolUse:void 0;if(ge!==void 0&&!Array.isArray(ge))throw Error(`Cursor hooks config ${ce} "hooks.preToolUse" must be an array`);return me}function kl(ce){let me=Tn(ce.hooks)?ce.hooks.preToolUse:void 0;return Array.isArray(me)?me:[]}function ym(ce){if(!ce.some(oo))return[...ce,gi()];return ce.reduce((me,ge)=>{if(!oo(ge))return me.result.push(ge),me;if(!me.inserted)me.result.push(gi()),me.inserted=!0;return me},{result:[],inserted:!1}).result}function xl(ce,me,ge){let he=Tn(me.hooks)?me.hooks:{},Se={...me,hooks:{...he,preToolUse:ge}};Qt(ce,`${JSON.stringify(Se,null,2)}
`)}function Cl(ce){let me=io(ce);if(!bl(me))return um(fm(me),{recursive:!0}),Qt(me,`${JSON.stringify({version:1,hooks:{preToolUse:[gi()]}},null,2)}
`),{path:me,alreadyInstalled:!1};let ge=wl(me),he=kl(ge),Se=he.filter(oo);if(Tn(ge.hooks)&&Array.isArray(ge.hooks.preToolUse)&&Se.length===1&&Se[0]!==void 0&&gm(Se[0]))return{path:me,alreadyInstalled:!0};return xl(me,ge,ym(he)),{path:me,alreadyInstalled:!1}}function Sl(ce){let me=io(ce);if(!bl(me))return{path:me,alreadyInstalled:!1};let ge=wl(me),he=kl(ge),Se=he.filter((Fe)=>!oo(Fe));if(Se.length===he.length)return{path:me,alreadyInstalled:!1};return xl(me,ge,Se),{path:me,alreadyInstalled:!0}}function Lm(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return[];let me=ce.hooks;if(!me||typeof me!=="object"||Array.isArray(me))return[];let ge=me.preToolUse;if(!Array.isArray(ge))return[];return ge.filter((he)=>!!he&&typeof he==="object"&&!Array.isArray(he)&&he.command===br)}function wm(ce){let me=[];if(ce.length>1)me.push("Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates");let ge=ce[0];if(ge&&ge.failClosed!==!0)me.push('Managed hook is missing "failClosed": true; reinstall to repair');if(ge&&ge.timeout!==30)me.push('Managed hook "timeout" is not 30; reinstall to repair');return me}function Rl(ce){let me=io(ce.homeDir);if(!vm(me))return{platform:"cursor",status:"n/a",configPath:me};let ge;try{ge=JSON.parse(bm(me,"utf-8"))}catch(Fe){return{platform:"cursor",status:"n/a",configPath:me,errors:[`Failed to parse Cursor hooks config ${me}: ${Fe instanceof Error?Fe.message:String(Fe)}`]}}let he=Lm(ge);if(he.length===0)return{platform:"cursor",status:"n/a",configPath:me};let Se=wm(he);return{platform:"cursor",status:"configured",method:"hook config",configPath:me,errors:Se.length>0?Se:void 0}}import{existsSync as km}from"node:fs";import{join as hi}from"node:path";var yi="gemini-safety-net";function vi(ce){let me=hi(ce,".gemini","extensions"),ge=hi(me,yi);if(!km(ge))return{platform:"gemini-cli",status:"n/a"};let he=hi(me,"extension-enablement.json"),Se=mn(he);if(Se.kind==="unreadable")return{platform:"gemini-cli",status:"not-inspected"};let Fe=Se.kind==="ok"?Bt(Bt(Se.value,yi),"overrides"):void 0;if(Array.isArray(Fe)&&Fe.some((Ge)=>typeof Ge==="string"&&Ge.startsWith("!")))return{platform:"gemini-cli",status:"disabled",method:"extension config",configPath:he,errors:[`${yi} is disabled in Gemini CLI`]};return{platform:"gemini-cli",status:"configured",method:"extension config",configPath:ge}}function Pl(ce){return vi(ce.homeDir)}import{existsSync as Rm,readFileSync as Pm}from"node:fs";import{existsSync as Al,mkdirSync as xm,readFileSync as El,rmSync as Cm}from"node:fs";import{dirname as Sm,join as Dl}from"node:path";var Lr="npx -y cc-safety-net hook --grok-build",lo=30;function co(ce){return Dl(process.env.GROK_HOME??Dl(ce,".grok"),"hooks","cc-safety-net.json")}function In(ce){return typeof ce==="object"&&ce!==null&&!Array.isArray(ce)}function so(){return{hooks:[{type:"command",command:Lr,timeout:lo}]}}function _l(ce){return In(ce)&&ce.command===Lr}function Tl(ce){return ce.flatMap((me)=>{if(!In(me)||!Array.isArray(me.hooks))return[me];let ge=me.hooks.filter((he)=>!_l(he));if(ge.length===me.hooks.length)return[me];return ge.length===0?[]:[{...me,hooks:ge}]})}function Il(ce){try{let me=JSON.parse(ce);return In(me)?me:null}catch{return null}}function $l(ce){let me=In(ce.hooks)?ce.hooks.PreToolUse:void 0;return Array.isArray(me)?me:[]}function ao(ce,me,ge){let he=In(me.hooks)?me.hooks:{};Qt(ce,`${JSON.stringify({...me,hooks:{...he,PreToolUse:ge}},null,2)}
`)}function Ol(ce){let me=co(ce);if(!Al(me))return xm(Sm(me),{recursive:!0}),ao(me,{},[so()]),{path:me,alreadyInstalled:!1};let ge=Il(El(me,"utf-8"));if(!ge)return ao(me,{},[so()]),{path:me,alreadyInstalled:!1};let he=$l(ge),Se=he.filter((Fe)=>In(Fe)&&Array.isArray(Fe.hooks)&&Fe.hooks.some(_l));if(Se.length===1&&JSON.stringify(Se[0])===JSON.stringify(so()))return{path:me,alreadyInstalled:!0};return ao(me,ge,[...Tl(he),so()]),{path:me,alreadyInstalled:!1}}function Fl(ce){let me=co(ce);if(!Al(me))return{path:me,alreadyInstalled:!1};let ge=Il(El(me,"utf-8"));if(!ge)return{path:me,alreadyInstalled:!1};let he=$l(ge),Se=Tl(he);if(JSON.stringify(Se)===JSON.stringify(he))return{path:me,alreadyInstalled:!1};let Fe=In(ge.hooks)?ge.hooks:{};if(Se.length===0&&Object.keys(ge).length===1&&Object.keys(Fe).length===1)return Cm(me),{path:me,alreadyInstalled:!0};return ao(me,ge,Se),{path:me,alreadyInstalled:!0}}function wr(ce){return!!ce&&typeof ce==="object"&&!Array.isArray(ce)}function Dm(ce){if(!wr(ce)||!wr(ce.hooks))return[];let me=ce.hooks.PreToolUse;if(!Array.isArray(me))return[];return me.filter((ge)=>wr(ge)&&Array.isArray(ge.hooks)&&ge.hooks.some((he)=>wr(he)&&he.command===Lr))}function Am(ce){let ge=(Array.isArray(ce.hooks)?ce.hooks.filter(wr):[]).find((he)=>he.command===Lr);return[...ce.matcher===void 0||ce.matcher===""||ce.matcher==="*"?[]:['Managed hook has a "matcher" that narrows coverage; reinstall to repair'],...ge?.type==="command"?[]:['Managed hook "type" is not "command"; reinstall to repair'],...ge?.timeout===lo?[]:[`Managed hook "timeout" is not ${lo}; reinstall to repair`]]}function jl(ce){let me=co(ce.homeDir);if(!Rm(me))return{platform:"grok-build",status:"n/a",configPath:me};let ge;try{ge=JSON.parse(Pm(me,"utf-8"))}catch(Fe){return{platform:"grok-build",status:"n/a",configPath:me,errors:[`Failed to parse Grok Build hooks config ${me}: ${Fe instanceof Error?Fe.message:String(Fe)}`]}}let he=Dm(ge)[0];if(!he)return{platform:"grok-build",status:"n/a",configPath:me};let Se=Am(he);return{platform:"grok-build",status:"configured",method:"hook config",configPath:me,errors:Se.length>0?Se:void 0}}import{readFileSync as zl}from"node:fs";import{join as Kl}from"node:path";var ln="cc-safety-net",Nl="# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent";function Hl(ce){return`# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent
# version: ${ce}
`}function Em(ce){return`${Hl(ce)}name: cc-safety-net
version: "${ce}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`}function _m(ce){return`${Hl(ce)}"""CC Safety Net guard for Hermes Agent.

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
ANALYZER = ["npx", "-y", "cc-safety-net", "hook", "--hermes-agent"]
TIMEOUT_SECONDS = ${"30"}


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
`}function kr(ce){return[{name:"__init__.py",content:_m(ce)},{name:"plugin.yaml",content:Em(ce)}]}import{mkdirSync as Tm,readdirSync as Im,readFileSync as $m,rmSync as bi}from"node:fs";import{join as $n}from"node:path";var Om="__pycache__";function Li(ce){let me=process.env.HERMES_HOME?.trim();return me?me:$n(ce,".hermes")}function wi(ce){return $n(Li(ce),"plugins",ln)}function ki(ce){return ce.startsWith(Nl)}function xi(ce,me){let ge=wi(ce),he=Yt(ge);if(he&&(he.isSymbolicLink()||!he.isDirectory()))throw Error(`Refusing to ${me} ${ge}: not a regular directory. Move or remove it and rerun ${me==="install"?"install":"uninstall"} --hermes-agent.`);return ge}function Ml(ce,me){let ge=Yt(ce);if(!ge)return;if(ge.isSymbolicLink()||!ge.isFile())throw Error(`Refusing to ${me} ${ce}: not a regular file. Move or remove it.`);let he=$m(ce,"utf-8");if(!ki(he))throw Error(`Refusing to ${me} unmanaged file at ${ce}. Move or remove it.`);return he}function Ul(ce){let me=xi(ce,"install"),ge=kr(Xt());if(ge.map((Se)=>Ml($n(me,Se.name),"overwrite")).every((Se,Fe)=>Se===ge[Fe]?.content))return{path:me,alreadyInstalled:!0};return Tm(me,{recursive:!0}),ge.forEach((Se)=>{Qt($n(me,Se.name),Se.content)}),{path:me,alreadyInstalled:!1}}function Ci(ce){let me=xi(ce,"remove");if(!Yt(me))return[];return kr(Xt()).filter((ge)=>Ml($n(me,ge.name),"remove")!==void 0)}function Gl(ce){let me=xi(ce,"remove");if(!Yt(me))return{path:me,alreadyInstalled:!1};let ge=Ci(ce);if(ge.forEach((he)=>{bi($n(me,he.name))}),bi($n(me,Om),{recursive:!0,force:!0}),Im(me).length===0)bi(me,{recursive:!0});return{path:me,alreadyInstalled:ge.length>0}}var uo="hermes-agent",Bl=/^([^\s#][^:]*):/,Fm=/^\s+([A-Za-z_][\w-]*):/,ql=/^\s+-\s*(.*)$/;function jm(ce){return ce.trim().replace(/^(["'])(.*)\1$/,"$2")}function Nm(ce){let me=ce.split(/\r?\n/),ge=me.findIndex((Fe)=>Bl.exec(Fe)?.[1]?.trim()==="plugins");if(ge===-1)return[];let he=me.slice(ge+1),Se=he.findIndex((Fe)=>Bl.test(Fe));return Se===-1?he:he.slice(0,Se)}function Vl(ce,me){let ge=Nm(ce),he=ge.findIndex((He)=>Fm.exec(He)?.[1]===me);if(he===-1)return[];let Se=ge.slice(he+1),Fe=Se.findIndex((He)=>!ql.test(He));return(Fe===-1?Se:Se.slice(0,Fe)).map((He)=>jm(ql.exec(He)?.[1]??""))}function Hm(ce){try{return zl(Kl(Li(ce),"config.yaml"),"utf-8")}catch{return}}function Si(ce){let me=Hm(ce)??"";return Vl(me,"enabled").includes(ln)&&!Vl(me,"disabled").includes(ln)}function Jl(ce){return/^# version:\s*(.+)$/m.exec(ce)?.[1]?.trim()}function Mm(ce,me){let ge=Yt(ce);if(!ge)return{error:`${me.name} is missing from ${ce}; run install --hermes-agent`};if(ge.isSymbolicLink()||!ge.isFile())return{error:`${ce} is a symlink or not a regular file; move or remove it`};try{let he=zl(ce,"utf-8");if(!ki(he))return{error:`Unmanaged ${me.name} occupies ${ce}; move or remove it`};if(Jl(he)===Xt()&&he!==me.content)return{error:`Modified ${me.name} occupies ${ce}; run install --hermes-agent to restore it`};return{content:he}}catch(he){return{error:`Failed to read ${ce}: ${he instanceof Error?he.message:String(he)}`}}}function Wl(ce){let me=wi(ce.homeDir),ge=Xr(uo,me);if(ge)return ge;let he=kr(Xt()).map((Ge)=>Mm(Kl(me,Ge.name),Ge)),Se=he.flatMap((Ge)=>("error"in Ge)?[Ge.error]:[]);if(Se.length>0)return{platform:uo,status:"n/a",configPath:me,errors:Se};let Fe=he.some((Ge)=>("content"in Ge)&&Jl(Ge.content)!==Xt()),He=Fe?["Installed Hermes Agent plugin is outdated; run install --hermes-agent to update"]:[];if(!Si(ce.homeDir))return{platform:uo,status:"disabled",method:"plugin directory",configPath:me,errors:[`${ln} is not enabled in Hermes; run \`hermes plugins enable ${ln}\``,...He]};return{platform:uo,status:"configured",method:"plugin directory",configPath:me,errors:Fe?He:void 0}}import{existsSync as Um,readFileSync as Gm}from"node:fs";import{join as Yl}from"node:path";var Bm=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;function qm(ce){return Yl(process.env.KIMI_CODE_HOME||Yl(ce,".kimi-code"),"config.toml")}function xr(ce){let me=qm(ce.homeDir);if(!Um(me))return{platform:"kimi-code",status:"n/a",configPath:me};try{if(!Bm.test(Gm(me,"utf-8")))return{platform:"kimi-code",status:"n/a",configPath:me}}catch(ge){return{platform:"kimi-code",status:"n/a",configPath:me,errors:[`Failed to read ${me}: ${ge instanceof Error?ge.message:String(ge)}`]}}return{platform:"kimi-code",status:"configured",method:"hook config",configPath:me}}import{readFileSync as sc}from"node:fs";import{join as Sr}from"node:path";var Jt="cc-safety-net",cn="index.js",Zn="openclaw.plugin.json",Xn="package.json";var po="// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw";import{existsSync as Km,lstatSync as Jm,readdirSync as Wm,readFileSync as Ym}from"node:fs";import{dirname as Ql,join as Sn}from"node:path";import{fileURLToPath as Zm}from"node:url";import{spawn as Vm}from"node:child_process";function zm(ce){return ce.join(" ")}function Ri(ce,me,ge){return[`Failed to run ${zm(ce)}${me===null?"":` (exit ${me})`}.`,ge.trim()].filter(Boolean).join(`
`)}function Pi(ce){let me={stdout:"",stderr:""};return ce.stdout.setEncoding("utf-8"),ce.stderr.setEncoding("utf-8"),ce.stdout.on("data",(ge)=>{me.stdout+=ge}),ce.stderr.on("data",(ge)=>{me.stderr+=ge}),me}function hn(ce,me){return new Promise((ge,he)=>{let Se=_n([...ce],process.env),Fe=Vm(Se.cmd,Se.args,{stdio:["ignore","pipe","pipe"]}),He=Pi(Fe),Ge=()=>[He.stdout,He.stderr].filter(Boolean).join(`
`),Dt=me?.timeoutMs??120000,At=setTimeout(()=>{Fe.kill(),he(Error(Ri(ce,null,`Timed out after ${Dt}ms.
${Ge()}`.trim())))},Dt);Fe.on("error",(Tt)=>{clearTimeout(At),he(Error(Ri(ce,null,`${Tt.message}
${Ge()}`.trim())))}),Fe.on("close",(Tt)=>{if(clearTimeout(At),Tt!==0){he(Error(Ri(ce,Tt,Ge())));return}ge(me?.stdoutOnly?He.stdout:Ge())})})}async function Di(ce){for(let me of ce)await hn(me)}async function Zl(ce){for(let me of ce)try{await hn(me)}catch(ge){console.warn(ge instanceof Error?ge.message:String(ge))}}var Xl=Sn("openclaw",Jt),Xm=[cn,Zn,Xn];function Ai(ce,me){if(ce==="~")return me;if(ce.startsWith("~/")||ce.startsWith("~\\"))return Sn(me,ce.slice(2));return ce}function ec(ce){let me=process.env.OPENCLAW_STATE_DIR?.trim();if(me)return Ai(me,ce);let ge=process.env.OPENCLAW_CONFIG_PATH?.trim();return ge?Ql(Ai(ge,ce)):Sn(ce,".openclaw")}function tc(ce){let me=process.env.OPENCLAW_CONFIG_PATH?.trim();return me?Ai(me,ce):Sn(ec(ce),"openclaw.json")}function Ei(ce){return Sn(ec(ce),"extensions",Jt)}function Qm(ce){let me=Wm(ce);if(me.length===0)return!0;if(me.some((Se)=>!Xm.includes(Se)))return!1;let ge=Sn(ce,cn),he=Yt(ge);return he!==void 0&&!he.isSymbolicLink()&&he.isFile()&&Ym(ge,"utf-8").startsWith(po)}function _i(ce){let me=Ei(ce),ge=Yt(me);if(!ge)return;if(!ge.isSymbolicLink()&&ge.isDirectory()&&Qm(me))return;throw Error(`Refusing to modify ${me}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`)}function nc(){let ce=Ql(Zm(import.meta.url));return[Sn(ce,"..",Xl),Sn(ce,"..","..","..","dist",Xl)]}function Ti(ce=nc()){return ce.find((me)=>Km(me)&&Jm(me).isDirectory())}function eg(ce=nc()){let me=Ti(ce);if(!me)throw Error("Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.");return me}function rc(ce=eg()){return[["openclaw","plugins","install",ce,"--force"],["openclaw","plugins","enable",Jt]]}function tg(ce){let me=(()=>{try{return JSON.parse(ce)}catch{return}})(),ge=Bt(Bt(me,"plugin"),"status");return typeof ge==="string"?ge:void 0}async function oc(){let ce=tg(await hn(["openclaw","plugins","inspect",Jt,"--runtime","--json"],{stdoutOnly:!0}));if(ce==="loaded")return;throw Error(`${ce===void 0?`The ${Jt} plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable.`:`OpenClaw reports the ${Jt} plugin with status "${ce}".`} Run \`openclaw plugins inspect ${Jt} --runtime\` for details.`)}var fo="openclaw",Cr=`run \`openclaw plugins enable ${Jt}\``;function Qn(ce,me){let ge=Sr(ce,me),he=Yt(ge);if(!he)return{error:`${me} is missing from ${ge}; run install --openclaw`};if(he.isSymbolicLink()||!he.isFile())return{error:`${ge} is a symlink or not a regular file; move or remove it`};try{return{content:sc(ge,"utf-8")}}catch(Se){return{error:`Failed to read ${ge}: ${Se instanceof Error?Se.message:String(Se)}`}}}function ac(ce){try{return JSON.parse(sn(ce))}catch{return}}function ng(ce){let me=Qn(ce,Zn);if("error"in me)return me.error;if(Bt(ac(me.content),"id")===Jt)return;return`${Sr(ce,Zn)} is not a valid ${Jt} manifest; run install --openclaw`}function rg(ce){let me=Qn(ce,Xn);if("error"in me)return me.error;let ge=Bt(Bt(ac(me.content),"openclaw"),"extensions");if(Array.isArray(ge)&&ge.includes(`./${cn}`))return;return`${Sr(ce,Xn)} does not point OpenClaw at ${cn}; run install --openclaw`}function ic(ce){return Array.isArray(ce)?ce.filter((me)=>typeof me==="string"):[]}function og(ce){let me=tc(ce);if(!Yt(me))return`${Jt} is not enabled; ${Cr}`;let ge=(()=>{try{return JSON.parse(sn(sc(me,"utf-8")))}catch{return}})();if(ge===void 0)return`Failed to read ${me}; fix it, then ${Cr}`;let he=Bt(ge,"plugins");if(Bt(he,"enabled")===!1)return`plugins.enabled is false in ${me}; no OpenClaw plugin loads`;let Se=Bt(Bt(Bt(he,"entries"),Jt),"enabled");if(ic(Bt(he,"deny")).includes(Jt)||Se===!1)return`${Jt} is disabled in ${me}; ${Cr}`;let Fe=ic(Bt(he,"allow"));if(Fe.length>0&&!Fe.includes(Jt))return`plugins.allow in ${me} does not list ${Jt}; add it, then ${Cr}`;if(Fe.includes(Jt)||Se===!0)return;return`${Jt} is not enabled; ${Cr}`}function lc(ce){return/^\/\/ version:\s*(.+)$/m.exec(ce)?.[1]?.trim()}function ig(ce,me,ge){if(ge===void 0)return[];let he=Qn(ge,cn);if("error"in he||lc(he.content)!==me)return[];return[cn,Zn,Xn].flatMap((Se)=>{let Fe=Qn(ce,Se),He=Qn(ge,Se);if("error"in Fe||"error"in He||Fe.content===He.content)return[];return[`Modified ${Se} occupies ${Sr(ce,Se)}; run install --openclaw to restore it`]})}function cc(ce){let me=Ei(ce.homeDir),ge=Xr(fo,me);if(ge)return ge;let he=Qn(me,cn),Fe=["error"in he?he.error:he.content.startsWith(po)?void 0:`Unmanaged ${cn} occupies ${Sr(me,cn)}; move or remove it`,ng(me),rg(me)].filter((Tt)=>Tt!==void 0),He="content"in he?lc(he.content):void 0,Ge=Fe.length>0?Fe:ig(me,He,Ti());if(Ge.length>0)return{platform:fo,status:"n/a",configPath:me,errors:Ge};let Dt=He===Xt()?[]:["Installed OpenClaw plugin is outdated; run install --openclaw to update"],At=og(ce.homeDir);if(At)return{platform:fo,status:"disabled",method:"plugin directory",configPath:me,errors:[At,...Dt]};return{platform:fo,status:"configured",method:"plugin directory",configPath:me,errors:Dt.length>0?Dt:void 0}}import{existsSync as hg,readFileSync as yg}from"node:fs";import{join as vg}from"node:path";import{existsSync as Ii,readFileSync as mc,rmSync as ag}from"node:fs";import{join as Ln}from"node:path";import{pathToFileURL as lg}from"node:url";function dc(ce){return ce!==void 0&&/\s/.test(ce)}function sg(ce,me,ge){let he=me+1,Se=!1;while(he<ce.length){let Fe=ce[he];if(Se){Se=!1,he++;continue}if(Fe==="\\"){Se=!0,he++;continue}if(Fe==='"')return he+1;he++}throw Error(ge)}function mo(ce,me,ge){let he=ce[me],Se=he==="["?"]":"}",Fe=0,He=me;while(He<ce.length){let Ge=ge.skipComment?.(ce,He)??He;if(Ge!==He){He=Ge;continue}if(ce[He]==='"'){He=sg(ce,He,ge.stringError);continue}if(ce[He]===he)Fe++;if(ce[He]===Se){if(Fe--,Fe===0)return He}He++}throw Error(ge.bracketError)}function uc(ce,me){let ge=ce.lastIndexOf(`
`,me)+1;return/^[ \t]*/.exec(ce.slice(ge))?.[0]??""}function go(ce,me){let{start:ge,end:he,end:Se}=me;while(dc(ce[Se]))Se++;if(ce[Se]===","){if(he=Se+1,ce[he]===`
`)he++;return`${ce.slice(0,ge)}${ce.slice(he)}`}Se=me.start-1;while(dc(ce[Se]))Se--;if(ce[Se]===","){ge=Se;let Fe=ce.lastIndexOf(`
`,ge-1);if(Fe!==-1&&/^\s*$/.test(ce.slice(Fe+1,ge)))ge=Fe}return`${ce.slice(0,ge)}${ce.slice(he)}`}var ho="cc-safety-net",gc=`${ho}@latest`,hc=["opencode.json","opencode.jsonc"],pc="CCSafetyNetPlugin";function yo(ce){return Ln(process.env.XDG_CONFIG_HOME||Ln(ce,".config"),"opencode")}function cg(ce){return Ln(yo(ce),hc[0])}function dg(ce){return hc.map((me)=>Ln(yo(ce),me))}function yc(ce){return Ln(process.env.XDG_CACHE_HOME||Ln(ce,".cache"),"opencode","packages",gc)}function $i(ce){ag(yc(ce),{recursive:!0,force:!0})}async function vc(ce){let me=Ln(yc(ce),"node_modules",ho),ge=Ln(me,"package.json");if(!Ii(ge))throw Error(`The OpenCode plugin cache at ${me} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f ${gc}\` for details.`);let he=Bt(JSON.parse(mc(ge,"utf-8")),"main");if(typeof he!=="string")throw Error(`The cached OpenCode plugin at ${me} declares no "main" entry.`);let Se=Ln(me,he);if(typeof(await import(lg(Se).href))[pc]==="function")return;throw Error(`The cached OpenCode plugin at ${Se} does not export a callable ${pc}, so OpenCode would load nothing and fail open.`)}function vo(ce,me){if(ce[me]==="/"&&ce[me+1]==="/"){let ge=ce.indexOf(`
`,me+2);return ge===-1?ce.length:ge+1}if(ce[me]==="/"&&ce[me+1]==="*"){let ge=ce.indexOf("*/",me+2);return ge===-1?ce.length:ge+2}return me}function fc(ce,me){let ge=me;while(ge<ce.length){if(/\s/.test(ce[ge]??"")){ge++;continue}let he=vo(ce,ge);if(he===ge)return ge;ge=he}return ge}function bc(ce,me){let ge=me+1,he=!1;while(ge<ce.length){if(he){he=!1,ge++;continue}if(ce[ge]==="\\"){he=!0,ge++;continue}if(ce[ge]==='"')return ge+1;ge++}throw Error("Unterminated string in OpenCode config")}function Lc(ce,me,ge){return JSON.parse(ce.slice(me,ge))}function ug(ce,me){return mo(ce,me,{skipComment:vo,stringError:"Unterminated string in OpenCode config",bracketError:"Unmatched plugin array in OpenCode config"})}function pg(ce){let me=0,ge=0;while(ge<ce.length){let he=vo(ce,ge);if(he!==ge){ge=he;continue}if(ce[ge]==='"'){let Se=bc(ce,ge);if(me===1&&Lc(ce,ge,Se)==="plugin"){let Fe=fc(ce,Se),He=fc(ce,Fe+1);if(ce[Fe]===":"&&ce[He]==="[")return{start:He,end:ug(ce,He)}}ge=Se;continue}if(ce[ge]==="{"||ce[ge]==="[")me++;if(ce[ge]==="}"||ce[ge]==="]")me--;ge++}return}function fg(ce,me){let ge=[],he=me.start+1;while(he<me.end){let Se=vo(ce,he);if(Se!==he){he=Se;continue}if(ce[he]==='"'){let Fe=bc(ce,he),He=Lc(ce,he,Fe);if(typeof He==="string"&&He.includes(ho))ge.push({start:he,end:Fe});he=Fe;continue}he++}return ge}function wc(ce,me){try{return JSON.parse(sn(ce))}catch(ge){if(ge instanceof SyntaxError)throw Error(`Failed to parse OpenCode config ${me}: ${ge.message}`);throw ge}}function mg(ce){if(!ce||typeof ce!=="object"||Array.isArray(ce))return!1;let me=ce.plugin;if(!Array.isArray(me))return!1;return me.some((ge)=>typeof ge==="string"&&ge.includes(ho))}function gg(ce,me){let ge=pg(ce);if(!ge)throw Error(`Failed to locate OpenCode plugin array in ${me}`);let he=[...fg(ce,ge)].reverse().reduce(go,ce);return wc(he,me),he}function kc(ce){$i(ce);let me=dg(ce),ge=me.find((Se)=>Ii(Se)),he=[];for(let Se of me){if(!Ii(Se))continue;try{let Fe=mc(Se,"utf-8");if(!mg(wc(Fe,Se)))continue;return Qt(Se,gg(Fe,Se)),{path:Se,alreadyInstalled:!0}}catch(Fe){he.push(Fe instanceof Error?Fe.message:String(Fe))}}if(he.length>0)throw Error(he.join(`
`));return{path:ge??cg(ce),alreadyInstalled:!1}}function xc(ce){let me=[],ge=yo(ce.homeDir),he=["opencode.json","opencode.jsonc"];for(let Se of he){let Fe=vg(ge,Se);if(hg(Fe))try{let He=yg(Fe,"utf-8"),Ge=sn(He);if((JSON.parse(Ge).plugin??[]).some((Ft)=>Ft.includes("cc-safety-net")))return{platform:"opencode",status:"configured",method:"plugin array",configPath:Fe,errors:me.length>0?me:void 0}}catch(He){me.push(`Failed to parse ${Se}: ${He instanceof Error?He.message:String(He)}`)}}return{platform:"opencode",status:"n/a",errors:me.length>0?me:void 0}}import{join as bg}from"node:path";function Oi(ce){return bg(ce,".pi","agent","settings.json")}function Fi(ce){if(typeof ce!=="string")return!1;return ce==="npm:cc-safety-net"||ce.startsWith("npm:cc-safety-net@")}function Cc(ce){let me=Oi(ce.homeDir),ge=mn(me);if(ge.kind==="unreadable")return{platform:"pi",status:"not-inspected"};if(ge.kind==="missing")return{platform:"pi",status:"n/a"};let he=Bt(ge.value,"packages");if(!Array.isArray(he))return{platform:"pi",status:"n/a"};let Se=he.find((Ge)=>Fi(typeof Ge==="string"?Ge:Bt(Ge,"source")));if(Se===void 0)return{platform:"pi",status:"n/a"};let Fe=Bt(Se,"extensions");if(Array.isArray(Fe)&&Fe.some((Ge)=>typeof Ge==="string"&&Ge.startsWith("-")))return{platform:"pi",status:"disabled",method:"package config",configPath:me,errors:["npm:cc-safety-net is installed but its extension is disabled in Pi settings"]};return{platform:"pi",status:"configured",method:"package config",configPath:me}}var wg={amp:tl,"antigravity-cli":nl,"claude-code":sl,codex:al,"copilot-cli":vl,cursor:Rl,"gemini-cli":Pl,"grok-build":jl,"hermes-agent":Wl,"kimi-code":xr,openclaw:cc,opencode:xc,pi:Cc};function er(ce,me){let ge={...me,cwd:ce,homeDir:me?.homeDir??Lg()};return Hr.map((he)=>kg(wg[he](ge)))}function kg(ce){if(ce.status==="not-inspected")return{platform:ce.platform,detected:!1,configured:!1,inspectionStatus:"not-inspected"};return{platform:ce.platform,detected:ce.status!=="n/a",configured:ce.status==="configured",inspectionStatus:ce.status!=="n/a"?"verified":ce.errors&&ce.errors.length>0?"failed":"not-applicable",method:ce.method,configPath:ce.configPath,configPaths:ce.configPaths,errors:ce.errors}}import{tmpdir as xg}from"node:os";import{join as Cg}from"node:path";var Sg=Object.freeze([{command:"git reset --hard",description:"git reset --hard",expectBlocked:!0},{command:"rm -rf /",description:"rm -rf /",expectBlocked:!0},{command:"rm -rf ./node_modules",description:"rm in cwd (safe)",expectBlocked:!1}]),Rg=Object.freeze({state:"ready",diagnostics:Object.freeze([]),ruleMetadata:Object.freeze({}),policy:Object.freeze({rules:Object.freeze([]),transparentWrappers:Object.freeze([]),safety:Object.freeze({}),worktreeMode:!1,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:Object.freeze({}),destructiveCommandAllowPaths:Object.freeze([]),secretProtection:Object.freeze({enabled:!0,disabledRules:Object.freeze([]),denyPaths:Object.freeze([]),allowPaths:Object.freeze([])})})}),Pg={strict:!1,paranoidRm:!1,paranoidInterpreters:!1,worktreeMode:!1,effectiveLevel:"standard",capabilities:{fail_closed:{enabled:!1,source:"preset",sources:[]},paranoid_rm:{enabled:!1,source:"preset",sources:[]},paranoid_interpreters:{enabled:!1,source:"preset",sources:[]}}};function Sc(){let ce=Cg(xg(),"cc-safety-net-self-test"),me=Sg.map((ge)=>{let he=j(c("self-test",{command:ge.command},{kind:"command",shell:"auto"},{configCwd:ce,executionCwd:ce},ge.command),{guard:{dependencies:{loadPolicySnapshot:()=>Rg,getModes:()=>Pg,findPolicyMutation:()=>null}},audit:{agent:"self-test",getSessionId:()=>{return}}}),Se=ge.expectBlocked?"blocked":"allowed",Fe=he.decision.kind==="deny"?"blocked":"allowed";return{command:ge.command,description:ge.description,expected:Se,actual:Fe,passed:Se===Fe,reason:he.decision.kind==="deny"?he.decision.reason:void 0,ruleId:he.decision.kind==="deny"?he.decision.ruleId:void 0}});return{passed:me.filter((ge)=>ge.passed).length,failed:me.filter((ge)=>!ge.passed).length,total:me.length,results:me}}function ji(ce){let me=Wt({label:"doctor",booleans:{json:["--json"],skipUpdateCheck:["--skip-update-check"]}},ce);if(vn(me.errors))return null;return{json:me.flags.json,skipUpdateCheck:me.flags.skipUpdateCheck}}async function Rc(ce={}){let me=await yr(!ce.json,()=>{let ge=Dg(ce);return{ready:ge,finish:()=>ge}},()=>hr(),{loadingMessage:"Checking system status…"});if(ce.json)console.log(JSON.stringify(me,null,2));else Ag(me);return me.engineSelfTest.failed>0||me.findings.some((ge)=>ge.severity==="error")?1:0}async function Dg(ce){let me=ce.cwd??process.cwd(),ge=await mr(),he=er(me,{ampPluginListOutput:ge.ampPluginListOutput,codexPluginListOutput:ge.codexPluginListOutput,copilotCliVersion:ge.versions["copilot-cli"]}),Se=ba(me),Fe=La(),He=x({cwd:me}),Ge=He.policy,Dt=E(Ge),At=U(Ge,Dt.capabilities),Tt=qr(7),Ft=Ya(me),jt=ce.skipUpdateCheck?{currentVersion:Xt(),latestVersion:null,updateAvailable:!1}:await Cn(),It={hooks:he,engineSelfTest:Sc(),userConfig:Se.userConfig,projectConfig:Se.projectConfig,configState:$e(He),effectiveRules:Se.effectiveRules,shadowedRules:Se.shadowedRules,environment:Fe,effectiveSafety:{selectedPreset:Ge.safety.level??"standard",level:Dt.effectiveLevel,capabilities:Dt.capabilities,ruleOverrides:Ge.destructiveCommandRuleOverrides,weakenedRuleOverrides:Object.entries(At).filter(([,$t])=>$t.source==="rule_override"&&$t.override==="off"&&$t.inheritedEnabled&&$t.changesInherited).map(([$t])=>$t),ruleCounts:{stored:Object.keys(Ge.destructiveCommandRuleOverrides).length,effective:Object.values(At).filter(($t)=>$t.changesInherited).length},...He.policyScopes?{policyScopes:He.policyScopes}:{}},...Ft.length>0?{v2Leftovers:Ft}:{},posture:$a(Se.userConfig.path),activity:Tt,update:jt,system:ge};return{...It,findings:ka(It)}}function Ag(ce){console.log(),console.log(Ca(ce.hooks)),console.log(),console.log(Sa(ce.engineSelfTest)),console.log(),console.log(Ra(ce)),console.log(),console.log(Pa(ce.environment)),console.log(),console.log(Da(ce)),console.log(),console.log(Aa(ce.findings)),console.log(),console.log(Ea(ce.activity)),console.log(),console.log(Ta(ce.system)),console.log(),console.log(_a(ce.update)),console.log(Ia(ce))}import{existsSync as Eg}from"node:fs";var _g=/^[A-Za-z0-9_@%+=:,./-]+$/,Pc="Usage: cc-safety-net explain [--json] [--cwd <path>] <command>";function Ni(ce){let me=Wt({label:"explain",booleans:{json:["--json"]},values:{cwd:["--cwd"]},positionals:"tail"},ce);if(vn(me.errors))return console.error(Pc),console.error("Pass -- before a command that starts with dashes."),null;if(me.values.cwd!==void 0&&!Eg(me.values.cwd))return console.error(`Error: --cwd path does not exist: ${me.values.cwd}`),null;let ge=me.positionals.length===1?me.positionals[0]:me.positionals.map((he)=>_g.test(he)?he:`'${he.replaceAll("'","'\\''")}'`).join(" ");if(!ge)return console.error("Error: No command provided"),console.error(Pc),null;return{json:me.flags.json,cwd:me.values.cwd,command:ge}}function Dc(ce){if(ce)return{dh:"=",dv:"|",dtl:"+",dtr:"+",dbl:"+",dbr:"+",h:"-",v:"|",tl:"+",tr:"+",bl:"+",br:"+",sh:"="};return{dh:"═",dv:"║",dtl:"╔",dtr:"╗",dbl:"╚",dbr:"╝",h:"─",v:"│",tl:"┌",tr:"┐",bl:"└",br:"┘",sh:"━"}}function Ac(ce,me){let he=me-18;return[`${ce.dtl}${ce.dh.repeat(me)}${ce.dtr}`,`${ce.dv}  Command Analysis${" ".repeat(he)}${ce.dv}`,`${ce.dbl}${ce.dh.repeat(me)}${ce.dbr}`]}function Hi(ce){return JSON.stringify(ce)}function Ec(ce,me=0){return`[${ce.map((he,Se)=>xa(he,Se,me)).join(",")}]`}function Rr(ce,me,ge=70){let he=ce.split(" "),Se=[],Fe="";for(let He of he)if(Fe&&Fe.length+He.length+1>ge)Se.push(Fe),Fe=He;else Fe=Fe?`${Fe} ${He}`:He;if(Fe)Se.push(Fe);return Se.map((He,Ge)=>Ge===0?He:`${me}${He}`)}function _c(ce,me,ge){let he=[];switch(ce.type){case"parse":return null;case"env-strip":return he.push(""),he.push(`STEP ${me} ${ge.h} Strip environment variables`),he.push(`  Removed: ${ce.envVars.map((Se)=>`${Se}=<redacted>`).join(", ")}`),he.push(`  Tokens:  ${Hi(ce.output)}`),{lines:he,incrementStep:!0};case"leading-tokens-stripped":return he.push(""),he.push(`STEP ${me} ${ge.h} Strip wrappers`),he.push(`  Removed: ${ce.removed.join(", ")}`),he.push(`  Tokens:  ${Hi(ce.output)}`),{lines:he,incrementStep:!0};case"shell-wrapper":return he.push(""),he.push(`STEP ${me} ${ge.h} Detect shell wrapper`),he.push(`  Wrapper: ${ce.wrapper} -c`),he.push(`  Inner:   ${ce.innerCommand}`),{lines:he,incrementStep:!0};case"interpreter":{if(he.push(""),he.push(`STEP ${me} ${ge.h} Detect interpreter`),he.push(`  Interpreter: ${ce.interpreter}`),he.push(`  Code:        ${ce.codeArg}`),ce.paranoidBlocked)he.push("  Result:      ✗ BLOCKED (paranoid mode)");return{lines:he,incrementStep:!0}}case"busybox":return he.push(""),he.push(`STEP ${me} ${ge.h} Busybox wrapper`),he.push(`  Subcommand: ${ce.subcommand}`),{lines:he,incrementStep:!0};case"transparent-wrapper":return he.push(""),he.push(`STEP ${me} ${ge.h} Transparent wrapper`),he.push(`  Wrapper: ${ce.wrapper}`),he.push(`  Tokens:  ${Hi(ce.output)}`),{lines:he,incrementStep:!0};case"recurse":return{lines:[],incrementStep:!1};case"rule-check":{if(he.push(""),he.push(`STEP ${me} ${ge.h} Match rules`),he.push(`  Rule:   ${ce.rule}()`),ce.matched)he.push("  Result: MATCHED");else he.push("  Result: No match");return{lines:he,incrementStep:!0}}case"worktree-relaxation":return he.push(""),he.push(`STEP ${me} ${ge.h} Worktree relaxation`),he.push(`  Mode:   ${r.worktree.name}`),he.push(`  Git cwd: ${ce.gitCwd}`),he.push("  Result: Allowed local discard in linked worktree"),{lines:he,incrementStep:!0};case"tmpdir-check":return null;case"fallback-scan":{if(ce.embeddedCommandFound)return he.push(""),he.push(`STEP ${me} ${ge.h} Fallback scan`),he.push(`  Found: ${ce.embeddedCommandFound}`),{lines:he,incrementStep:!0};return null}case"custom-rules-check":{if(ce.rulesChecked){if(he.push(""),he.push(`STEP ${me} ${ge.h} Custom rules`),ce.matched)he.push("  Result: MATCHED");else he.push("  Result: No match");return{lines:he,incrementStep:!0}}return null}case"cwd-change":return null;case"dangerous-text":{if(ce.matched)return he.push(""),he.push(`STEP ${me} ${ge.h} Dangerous text check`),he.push(`  Token:  ${ce.token}`),he.push("  Result: MATCHED"),{lines:he,incrementStep:!0};return null}case"strict-unparseable":return he.push(""),he.push(`STEP ${me} ${ge.h} Strict mode check`),he.push(`  Command: ${ce.rawCommand}`),he.push("  Result:  ✗ UNPARSEABLE"),{lines:he,incrementStep:!0};case"segment-skipped":return null;case"error":return he.push(""),he.push(`ERROR: ${ce.message}`),{lines:he,incrementStep:!1};default:return ce}}function Mi(ce,me){let ge=Dc(me?.asciiOnly??!1),he=58,Se=[],Fe=1;Se.push(...Ac(ge,58)),Se.push("");let He=ce.trace.steps.find(($t)=>$t.type==="error");if(He&&He.type==="error"){Se.push("ERROR"),Se.push(`  ${He.message}`),Se.push(""),Se.push("RESULT"),Se.push(`  Status: ${ce.result==="blocked"?Ht.red("BLOCKED"):Ht.green("ALLOWED")}`),Se.push(""),Se.push("CONFIG");let $t=ce.configSource??"none";return Se.push(`  Path: ${$t}`),Se.join(`
`)}let Ge=ce.trace.steps.find(($t)=>$t.type==="parse");if(Ge&&Ge.type==="parse"){Se.push("INPUT"),Se.push(`  ${Ge.input}`),Se.push(""),Se.push(`STEP ${Fe} ${ge.h} Split shell commands`),Fe++;for(let $t=0;$t<Ge.segments.length;$t++){let Ot=Ge.segments[$t];if(Ot){let Ut=Math.random();Se.push(`  Segment ${$t+1}: ${Ec(Ot,Ut)}`)}}}let Dt=ce.trace.segments,At=Dt.length>1;for(let $t of Dt){if(At){Se.push("");let Nt="";if(Ge&&Ge.type==="parse"){let Io=Ge.segments[$t.index];if(Io)Nt=Io.join(" ")}let Vt=54,Mt=Nt,zt=` Segment ${$t.index+1}: `,un=" ";if(Nt){if(zt.length+Nt.length+un.length>Vt){let bu=Vt-zt.length-un.length;Mt=`${Nt.substring(0,bu-1)}…`}}let Ir=Nt?`${zt}${Mt}${un}`:` Segment ${$t.index+1} `,yu=Nt?`${zt}${Ht.cyan(Mt)}${un}`:Ir,us=58-Ir.length,ps=Math.floor(us/2),vu=us-ps;Se.push(`${ge.sh.repeat(ps)}${yu}${ge.sh.repeat(vu)}`)}if($t.steps.find((Nt)=>Nt.type==="segment-skipped")){Se.push(""),Se.push("  (skipped — prior segment blocked)");continue}let Ut=!1,Gt=!1;for(let Nt of $t.steps){let Vt=_c(Nt,Fe,ge);if(Vt){if(Gt=!0,Nt.type==="recurse"){Se.push("");let Mt=" RECURSING ",zt=58-Mt.length-4;Se.push(`  ${ge.tl}${ge.h}${Mt}${ge.h.repeat(zt)}`),Se.push(`  ${ge.v}`),Ut=!0;continue}for(let Mt of Vt.lines)if(Ut)Se.push(`  ${ge.v} ${Mt}`);else Se.push(Mt);if(Vt.incrementStep)Fe++}}if(Ut)Se.push(`  ${ge.v}`),Se.push(`  ${ge.bl}${ge.h.repeat(56)}`),Ut=!1;if(!Gt)Se.push(""),Se.push(`  ${Ht.green("✓")} Allowed (no matching rules)`)}if(Se.push(""),Se.push("RESULT"),ce.result==="blocked"){if(Se.push(`  Status: ${Ht.red("BLOCKED")}`),ce.customRule){if(Se.push(`  Rule: ${ce.customRule.id}`),ce.customRule.rulebook)Se.push(`  Rulebook: ${ce.customRule.rulebook.name} ${ce.customRule.rulebook.version}`);if(ce.customRule.source)Se.push(`  Source: ${ce.customRule.source}`);if(ce.customRule.override)Se.push(`  Override: reason ${ce.customRule.override.reason}`)}if(ce.reason){let $t=Rr(ce.reason,"          ");Se.push(`  Reason: ${$t[0]}`);for(let Ot=1;Ot<$t.length;Ot++)Se.push($t[Ot]??"")}}else Se.push(`  Status: ${Ht.green("ALLOWED")}`);Se.push(""),Se.push("CONFIG");let Tt=ce.configSource??"none",Ft=ce.configValid?"":" (invalid)";Se.push(`  Path: ${Tt}${Ft}`);let jt=ce.safetyPresetScope;Se.push(`  Safety preset: ${ce.selectedPreset??"standard"}${jt?` (${Vr(jt)})`:""}`),Se.push(`  Effective capabilities: ${ce.effectiveLevel}`);let It=Object.entries(ce.destructiveCommandRuleOverrides??{});if(Se.push(`  Rule customizations: ${It.length}`),ce.ruleActivation)Se.push(`  Rule activation: ${ce.ruleActivation.id} — ${ce.ruleActivation.enabled?"on":"off"} via ${ce.ruleActivation.source}`);return Se.join(`
`)}function Ui(ce){return JSON.stringify(ce,null,2)}function Tc(ce){return new Promise((me)=>{process.stdout.write(`${ce}
`,()=>me())})}async function Ic(ce){let me=Ni(ce);if(!me)return 1;try{let ge=qn(me.command,{cwd:me.cwd}),he=!!process.env.NO_COLOR||!process.stdout.isTTY;return await Tc(me.json?Ui(ge):Mi(ge,{asciiOnly:he})),0}catch(ge){if(!(ge instanceof w)&&!(ge instanceof s)&&!(ge instanceof a))throw ge;if(me.json)return await Tc(JSON.stringify({error:ge.message})),1;return console.error(ge.message),1}}var $c="2.3.3",dn="  ",On="cc-safety-net";function Oc(ce){return ce.argument?`${ce.flags} ${ce.argument}`:ce.flags}function Tg(ce){return Math.max(...ce.map((me)=>Oc(me).length))}function Ig(ce){return Math.max(...ce.map((me)=>me.usage.length))}function $g(ce){return Math.max(...ce.map((me)=>`${On} ${me.usage}`.length))}function Og(ce,me){let ge=`${On} ${ce.usage}`;return`${dn}${ge.padEnd(me+2)}${ce.description}`}function wn(ce,me){return`${dn}${ce.padEnd(Math.max(40,ce.length+2))}${me}`}function tr(ce,me=console.log){let ge=[];if(ge.push(`${On} ${ce.name}`),ge.push(""),ge.push(`${dn}${ce.description}`),ge.push(""),ge.push("USAGE:"),ge.push(`${dn}${On} ${ce.usage}`),ge.push(""),ce.subcommands&&ce.subcommands.length>0){ge.push("SUBCOMMANDS:");let he=Ig(ce.subcommands);for(let Se of ce.subcommands)ge.push(`${dn}${Se.usage.padEnd(he+2)}${Se.description}`);ge.push("")}if(ce.options.length>0){ge.push("OPTIONS:");let he=Tg(ce.options);for(let Se of ce.options){let Fe=Oc(Se),He=Se.default?`${Se.description} (default: ${Se.default})`:Se.description;ge.push(`${dn}${Fe.padEnd(he+2)}${He}`)}ge.push("")}if(ce.examples&&ce.examples.length>0){ge.push("EXAMPLES:");for(let he of ce.examples)ge.push(`${dn}${he}`)}me(ge.join(`
`))}function Gi(){let ce=$g(Gr),me=[];me.push(`${On} v${$c}`),me.push(""),me.push("Blocks destructive commands and secret access."),me.push(""),me.push("COMMANDS:");for(let ge of Gr)me.push(Og(ge,ce));me.push(""),me.push("GLOBAL OPTIONS:"),me.push(`${dn}-h, --help       Show help (use with command for command-specific help)`),me.push(`${dn}-V, --version    Show version`),me.push(""),me.push("HELP:"),me.push(`${dn}${On} help <command>     Show help for a specific command`),me.push(`${dn}${On} <command> --help   Show help for a specific command`),me.push(""),me.push("ENVIRONMENT VARIABLES:"),me.push(wn(`${r.level.name}=standard|strict|paranoid`,"Set session safety level")),me.push(wn(`${r.worktree.name}=1`,"Allow local git discards in linked worktrees")),me.push(wn(`${r.debug.name}=1`,"Print diagnostic messages to stderr")),me.push(wn(`${r.auditScope.name}=all|blocked`,"Record all command decisions, or denials only")),me.push(wn("CC_SAFETY_NET_HOME","Override rule config home directory")),me.push(""),me.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"),me.push(wn(`${r.strict.name}=1`,"Force safety.overrides.fail_closed on")),me.push(wn(`${r.paranoid.name}=1`,"Force paranoid_rm and paranoid_interpreters on")),me.push(wn(`${r.paranoidRm.name}=1`,"Force safety.overrides.paranoid_rm on")),me.push(wn(`${r.paranoidInterpreters.name}=1`,"Force safety.overrides.paranoid_interpreters on")),me.push(""),me.push("Documentation:        https://ccsafetynet.com/docs"),console.log(me.join(`
`))}function Fc(){console.log($c)}function Pr(ce,me=console.log){let ge=Br(ce);if(!ge)return!1;if(ge.name.toLowerCase()!==ce.toLowerCase())return!1;return tr(ge,me),!0}import{existsSync as es,readFileSync as Dd}from"node:fs";import{homedir as Th,tmpdir as Ih}from"node:os";import{join as Xi}from"node:path";import*as Rn from"node:readline";function Fg(ce){return ce==="install"?"Install":"Uninstall"}function jg(ce){return ce==="install"?"Installing":"Uninstalling"}function Ng(ce){return ce==="install"?"into":"from"}function Hc(ce){return ce?.available===!0}function Hg(ce,me){let ge=new Set(me);return ce.filter((he)=>ge.has(he.target)).map((he)=>he.target)}function jc(ce,me,ge){if(ce.length===0||ce.every((he)=>!he.available))return me;return Array.from({length:ce.length},(he,Se)=>Se+1).map((he)=>(me+he*ge+ce.length)%ce.length).find((he)=>Hc(ce[he]))}function Mg(ce,me,ge){if(ge.ctrl&&ge.name==="c")return"interrupt";if(ge.name==="escape"||me==="q")return"abort";if(ce==="install"&&(me==="u"||me==="U"))return"update";if(ge.name==="up"||me==="k")return"up";if(ge.name==="down"||me==="j")return"down";if(ge.name==="space"||me===" ")return"toggle";if(ge.name==="return"||ge.name==="enter")return"confirm";return null}function Ug(ce){return{cursor:ce.findIndex((me)=>me.available),selected:[]}}function Gg(ce,me,ge){if(ge==="confirm"||ge==="update"||ge==="abort"||ge==="interrupt")return{state:ce,done:ge};if(ge==="up")return{state:{...ce,cursor:jc(me,ce.cursor,-1)}};if(ge==="down")return{state:{...ce,cursor:jc(me,ce.cursor,1)}};let he=me[ce.cursor];if(!Hc(he))return{state:ce};let Se=ce.selected.includes(he.target)?ce.selected.filter((Fe)=>Fe!==he.target):Hg(me,[...ce.selected,he.target]);return{state:{...ce,selected:Se}}}var Mc="◉",Uc="◯",Gc=">",Bc=" ";function Bg(ce,me,ge,he={}){let Se=he.color!==!1,Fe=Se?Ht.dim:(Dt)=>Dt,He=Se?Ht.green:(Dt)=>Dt,Ge=Se?Ht.bold:(Dt)=>Dt;return["",`${Fg(ce)} CC Safety Net ${Ng(ce)}:`,"",...me.map((Dt,At)=>{let Tt=ge.selected.includes(Dt.target),Ft=At===ge.cursor,jt=Tt?Mc:Uc,It=Ft?Gc:Bc,$t=Dt.available?"":` (${Dt.unavailableReason??"not installed"})`,Ot=`${jt} ${Dt.label}${$t}`,Ut=!Dt.available?Fe(Ot):Tt?He(Ot):Ft?Ge(Ot):Ot;return`${It} ${Ut}`}),"",ce==="install"?"Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel":me.some((Dt)=>Dt.available)?"Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel":`No selectable integrations found for ${ce}. q/Esc: close`].join(`
`)}var Nc=["global-hook","plugin"];function qg(ce,me,ge={}){let he=ge.color!==!1?Ht.bold:(Fe)=>Fe;return["","Install the Kimi Code integration as:","",...[`Global hook — ${me?"already installed; selecting it reports the current state":"write the hook into ~/.kimi-code/config.toml now"}`,"Native Kimi plugin — print the steps to run inside Kimi Code"].map((Fe,He)=>{let Ge=He===ce,Dt=`${Ge?Mc:Uc} ${Fe}`;return`${Ge?Gc:Bc} ${Ge?he(Dt):Dt}`}),"","Enter: confirm  Up/Down: move  q/Esc: cancel"].join(`
`)}function qc(ce){let{input:me,output:ge}=ce;Rn.emitKeypressEvents(me);let he=me.isRaw===!0;me.setRawMode(!0),me.resume();let Se=0,Fe=()=>{if(Se===0)return;Rn.moveCursor(ge,0,-Se),Rn.cursorTo(ge,0),Rn.clearScreenDown(ge)},He=()=>{Fe();let Ge=ce.render();ge.write(`${Ge}
`),Se=Ge.split(`
`).length};return new Promise((Ge)=>{let Dt=(Tt)=>{me.off("keypress",At),me.setRawMode(he),me.pause(),Fe(),Ge(Tt)};function At(Tt,Ft){ce.onKey(Tt,Ft,{finish:Dt,draw:He})}me.on("keypress",At),He()})}function Vc(ce={}){let me=0;return qc({input:ce.input??process.stdin,output:ce.output??process.stdout,render:()=>qg(me,ce.globalHookInstalled===!0),onKey:(ge,he,Se)=>{if(he.ctrl&&he.name==="c"){Se.finish(null),(ce.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(he.name==="escape"||ge==="q")return Se.finish(null);if(he.name==="return"||he.name==="enter")return Se.finish(Nc[me]);if(he.name==="up"||he.name==="down"||ge==="k"||ge==="j")me=(me+1)%Nc.length,Se.draw()}})}function Bi(ce=process.stdin,me=process.stdout){return Boolean(ce.isTTY&&me.isTTY&&typeof ce.setRawMode==="function")}function zc(ce,me,ge={}){let he=ge.output??process.stdout,Se=Ug(me);return qc({input:ge.input??process.stdin,output:he,render:()=>Bg(ce,me,Se),onKey:(Fe,He,Ge)=>{let Dt=Mg(ce,Fe,He);if(!Dt)return;let At=Gg(Se,me,Dt);if(Se=At.state,At.done==="interrupt"){Ge.finish(null),(ge.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(At.done==="abort")return Ge.finish(null);if(At.done==="update")return Ge.finish("update");if(At.done==="confirm"){if(Se.selected.length===0){he.write("\x07"),Ge.draw();return}Ge.finish([...Se.selected]),he.write(`${jg(ce)} selected integrations...
`);return}Ge.draw()}})}import{existsSync as Jc,lstatSync as zg,mkdirSync as Kg,mkdtempSync as Jg,readdirSync as Wg,readFileSync as rr,rmSync as Lo}from"node:fs";import{tmpdir as Yg}from"node:os";import{basename as Zg,dirname as Xg,join as on}from"node:path";import{fileURLToPath as Qg}from"node:url";var qi="// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp",Fn="cc-safety-net",jn="cc-safety-net/index.ts";import{spawn as Vg}from"node:child_process";var Vi=(ce,me)=>{let ge=_n([...ce],process.env);return new Promise((he)=>{let Se=Vg(ge.cmd,ge.args,{cwd:me,stdio:["ignore","pipe","pipe"]}),Fe=Pi(Se),He=!1,Ge=setTimeout(()=>{He=!0,Se.kill()},120000);Se.on("error",(Dt)=>{clearTimeout(Ge),he({status:null,errorCode:Dt.code,stdout:Fe.stdout,stderr:[Dt.message,Fe.stderr].filter(Boolean).join(`
`)})}),Se.on("close",(Dt)=>{clearTimeout(Ge),he({status:He?null:Dt,errorCode:He?"ETIMEDOUT":void 0,stdout:Fe.stdout,stderr:Fe.stderr})})})};var nr="cc-safety-net.ts",Kc=on("amp",jn);function eh(ce){return on(ce,".config","amp","plugins","cc-safety-net.ts")}function th(){let ce=Xg(Qg(import.meta.url));return[on(ce,"..",Kc),on(ce,"..","..","..","dist",Kc)]}function nh(ce=th()){let me=ce.find((ge)=>Jc(ge)&&zg(ge).isFile());if(!me)throw Error("Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.");return me}function Wc(ce){try{return JSON.parse(ce)}catch{return}}function wo(ce){return ce.subarray(0,Buffer.byteLength(qi)).toString("utf-8")===qi}async function Dr(ce,me,ge){let he=await ce(me,ge);if(he.status===0)return he;throw Error([`Failed to run ${me.join(" ")}${he.status===null?"":` (exit ${he.status})`}.`,[he.stdout,he.stderr].filter(Boolean).join(`
`).trim()].filter(Boolean).join(`
`))}async function Yc(ce){let me=await ce(["amp","plugins","repositories","--json"]);if(me.status===null)throw Error(`${me.errorCode==="ENOENT"?'Amp CLI not found. Install the amp CLI, sign in with "amp login", and rerun install --amp.':`amp plugins repositories --json did not finish (${me.errorCode??"terminated"}). Check that the amp CLI responds and rerun install --amp.`}
${me.stderr}`.trim());if(me.status!==0)throw Error(`Failed to run amp plugins repositories --json (exit ${me.status}). Sign in with "amp login" and rerun install --amp.
${[me.stdout,me.stderr].filter(Boolean).join(`
`)}`.trim());let ge=Wc(me.stdout),he=(Array.isArray(ge)?ge:[]).filter((Se)=>Bt(Se,"scope")==="user"&&Bt(Se,"exists")===!0&&Bt(Se,"viewerCanWrite")===!0).map((Se)=>Bt(Se,"cloneRef")).find((Se)=>typeof Se==="string"&&Se.length>0);if(!he)throw Error('Your Amp account has no writable Personal Plugins repository. Sign in with "amp login", open Amp once to create it, and rerun install --amp.');return he}async function Zc(ce,me){let ge=Jg(on(Yg(),"cc-safety-net-amp-"));try{return await Dr(ce,["amp","clone","user-plugins",ge]),await me(ge)}finally{Lo(ge,{recursive:!0,force:!0})}}function zi(ce){return`rerun ${ce==="overwrite"?"install":"uninstall"} --amp`}function Xc(ce,me,ge){let he=on(ce,me),Se=Yt(he);if(!Se)return;if(Se.isSymbolicLink()||!Se.isFile())throw Error(`Refusing to ${ge} ${me} in your Amp personal plugins repository: not a regular file. Remove it there and ${zi(ge)}.`);let Fe=rr(he);if(wo(Fe))return Fe;throw Error(`Refusing to ${ge} unmanaged file ${me} in your Amp personal plugins repository. Remove it there and ${zi(ge)}.`)}function Qc(ce,me){let ge=on(ce,Fn),he=Yt(ge);if(!he)return;if(he.isSymbolicLink()||!he.isDirectory())throw Error(`Refusing to ${me} ${Fn} in your Amp personal plugins repository: not a regular directory. Remove it there and ${zi(me)}.`);return Xc(ce,jn,me)}function rh(ce){let me=on(ce,nr),ge=Yt(me);if(!ge||ge.isSymbolicLink()||!ge.isFile())return;let he=rr(me);return wo(he)?he:void 0}async function ed(ce,me,ge,he){if(await Dr(ce,ge,me),(await Dr(ce,["git","status","--porcelain"],me)).stdout.trim()==="")return!1;return await Dr(ce,["git","-c","commit.gpgsign=false","-c","user.name=cc-safety-net","-c","user.email=cc-safety-net@localhost","commit","-m",he],me),await Dr(ce,["git","push","origin","HEAD"],me),!0}function bo(ce,me){oh(ce,me),ih(ce,me)}function td(ce,me){if(me==="keep")return;throw Error(`Local Amp plugin ${ce} is not a managed copy and masks the personal plugin. Remove it and rerun install --amp.`)}function oh(ce,me){let ge=eh(ce),he=Yt(ge);if(!he)return;if(!he.isSymbolicLink()&&he.isFile()&&wo(rr(ge))){Lo(ge);return}td(ge,me)}function ih(ce,me){let ge=on(ce,".config","amp","plugins",Fn),he=Yt(ge);if(!he)return;if(!he.isSymbolicLink()&&he.isDirectory()&&sh(ge)){Lo(ge,{recursive:!0});return}td(ge,me)}function sh(ce){let me=Zg(jn);if(Wg(ce).join("\x00")!==me)return!1;let ge=on(ce,me),he=Yt(ge);return!!he&&!he.isSymbolicLink()&&he.isFile()&&wo(rr(ge))}function ah(){let ce=y();if(!Jc(ce))return"";let me=Wc(rr(ce,"utf-8"));if(!me||typeof me!=="object"||Array.isArray(me))return"";return`;globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = ${JSON.stringify(f(me))};
`}async function nd(ce,me=nh(),ge=Vi){let he=Buffer.concat([rr(me),Buffer.from(ah(),"utf-8")]),Se=await Yc(ge);return Zc(ge,async(Fe)=>{let He=`${Se}/${Fn}`,Ge=Qc(Fe,"overwrite"),Dt=Xc(Fe,nr,"overwrite");if(Ge?.equals(he)&&!Dt)return bo(ce,"fail"),{path:He,alreadyInstalled:!0};if(Kg(on(Fe,Fn),{recursive:!0}),Qt(on(Fe,jn),he),Dt)Lo(on(Fe,nr));let At=await ed(ge,Fe,["git","add","--",jn,...Dt?[nr]:[]],`chore: update cc-safety-net plugin to v${Xt()}`);return bo(ce,"fail"),{path:He,alreadyInstalled:!At}})}async function rd(ce,me=Vi){let ge=await Yc(me);return Zc(me,async(he)=>{let Se=Qc(he,"remove"),Fe=rh(he),He=`${ge}/${Fe&&!Se?nr:Fn}`;if(!Se&&!Fe)return bo(ce,"keep"),{path:He,alreadyInstalled:!1};return await ed(me,he,["git","rm","--",...Se?[jn]:[],...Fe?[nr]:[]],`chore: remove cc-safety-net plugin v${Xt()}`),bo(ce,"keep"),{path:He,alreadyInstalled:!0}})}import{existsSync as od,mkdirSync as lh,readFileSync as ch}from"node:fs";import{dirname as dh}from"node:path";var Ki="npx -y cc-safety-net hook --agy-cli",Nn="cc-safety-net";function Hn(ce){return Boolean(ce)&&typeof ce==="object"&&!Array.isArray(ce)}function xo(){return{PreToolUse:[{hooks:[{type:"command",command:Ki,timeout:30}]}]}}function id(ce){try{let me=JSON.parse(ch(ce,"utf-8"));if(!me||typeof me!=="object"||Array.isArray(me))throw Error("Antigravity hooks config must be a JSON object");return me}catch(me){if(me instanceof SyntaxError)throw Error(`Failed to parse Antigravity hooks config ${ce}: ${me.message}`);throw me}}function sd(ce){let me=ce[Nn];if(me===void 0){let he=xo();return ce[Nn]=he,{definition:he,preToolUse:he.PreToolUse??[]}}if(!Hn(me))throw Error(`Antigravity hooks config entry "${Nn}" must be an object`);let ge=Array.isArray(me.PreToolUse)?me.PreToolUse:[];return me.PreToolUse=ge,{definition:me,preToolUse:ge}}function ad(ce){if(!Array.isArray(ce.PreToolUse))return!1;return ce.PreToolUse.some((me)=>Hn(me)&&Array.isArray(me.hooks)&&me.hooks.some((ge)=>Hn(ge)&&ge.command===Ki))}function uh(ce){return Object.values(ce).some((me)=>Hn(me)&&me.enabled!==!1&&ad(me))}function ph(ce){if(ce[Nn]===void 0)return!1;let me=sd(ce);if(me.definition.enabled!==!1||!ad(me.definition))return!1;return me.definition.enabled=!0,!0}function fh(ce){if(ce[Nn]===void 0){ce[Nn]=xo();return}let me=sd(ce);me.definition.enabled=!0,me.preToolUse.push(xo().PreToolUse?.[0]??{hooks:[]})}function mh(ce){let me=!1;for(let ge of Object.values(ce)){if(!Hn(ge)||!Array.isArray(ge.PreToolUse))continue;ge.PreToolUse=ge.PreToolUse.flatMap((he)=>{if(!Hn(he)||!Array.isArray(he.hooks))return[he];let Se=he.hooks.filter((Fe)=>!Hn(Fe)||Fe.command!==Ki);if(Se.length!==he.hooks.length)me=!0;return Se.length===0?[]:[{...he,hooks:Se}]})}return me}function ko(ce,me){Qt(ce,`${JSON.stringify(me,null,2)}
`)}function ld(ce){let me=pr(ce);if(lh(dh(me),{recursive:!0}),!od(me))return ko(me,{[Nn]:xo()}),{path:me,alreadyInstalled:!1};let ge=id(me);if(uh(ge))return{path:me,alreadyInstalled:!0};if(ph(ge))return ko(me,ge),{path:me,alreadyInstalled:!1};return fh(ge),ko(me,ge),{path:me,alreadyInstalled:!1}}function cd(ce){let me=pr(ce);if(!od(me))return{path:me,alreadyInstalled:!1};let ge=id(me);if(!mh(ge))return{path:me,alreadyInstalled:!1};return ko(me,ge),{path:me,alreadyInstalled:!0}}import{existsSync as gh,readdirSync as hh,rmSync as yh}from"node:fs";import{join as vh}from"node:path";function dd(ce,me=process.platform,ge){if(!gh(ce))return;let he=me==="win32"?/^bunx-\d+-cc-safety-net@/:new RegExp(`^bunx-${process.getuid?.()??0}-cc-safety-net@`);hh(ce).filter((Se)=>Se!==ge&&he.test(Se)).forEach((Se)=>{yh(vh(ce,Se),{recursive:!0,force:!0})})}import{spawn as bh}from"node:child_process";var yn=an.map((ce)=>({target:ce.id,flag:ce.flag,label:Kt(ce.id),probeCommand:ce.probeCommand}));function Ji(ce){let me=new Set(ce);return yn.map((ge)=>ge.target).filter((ge)=>me.has(ge))}async function ud(ce,me){for(let ge of ce)await me(ge)}var Lh=5000;function Wi(ce){return new Promise((me)=>{let ge=_n([...ce],process.env),he=bh(ge.cmd,ge.args,{env:process.env,stdio:"ignore"}),Se=!1,Fe=(Ge)=>{if(Se)return;Se=!0,clearTimeout(He),me(Ge)},He=setTimeout(()=>{he.kill(),Fe(!1)},Lh);he.on("error",()=>Fe(!1)),he.on("close",(Ge)=>Fe(Ge===0))})}function pd(ce=Wi,me={}){let ge=new Set(me.configuredTargets??[]);return Promise.all(yn.map(async(he)=>({target:he.target,flag:he.flag,label:he.label,...md(me.action,await ce(he.probeCommand),ge.has(he.target))})))}function fd(ce,me){let ge=new Set(me.configuredTargets??[]);return ce.map((he)=>({...he,...md(me.action,he.available,ge.has(he.target))}))}function md(ce,me,ge){if(ce==="uninstall")return ge?{available:!0}:{available:!1,unavailableReason:"not installed"};if(ce==="install"&&ge)return{available:!1,unavailableReason:"already installed"};if(!me)return{available:!1,unavailableReason:"CLI not installed"};return{available:!0}}import{existsSync as gd,readdirSync as wh,rmSync as kh}from"node:fs";import{join as or}from"node:path";function Co(ce,me=process.platform){let ge=or(process.env.npm_config_cache||(me==="win32"?or(process.env.LOCALAPPDATA||or(ce,"AppData","Local"),"npm-cache"):or(ce,".npm")),"_npx");if(!gd(ge))return;wh(ge).filter((he)=>gd(or(ge,he,"node_modules","cc-safety-net"))).forEach((he)=>{kh(or(ge,he),{recursive:!0,force:!0})})}import{existsSync as yd,mkdirSync as xh,readFileSync as vd}from"node:fs";import{dirname as Ch,join as hd}from"node:path";var Ar="npx -y cc-safety-net hook --kimi-code",Yi=`[[hooks]]
event = "PreToolUse"
command = "${Ar}"`,Zi=`{ event = "PreToolUse", command = "${Ar}" }`;function bd(ce){return hd(process.env.KIMI_CODE_HOME??hd(ce,".kimi-code"),"config.toml")}function Sh(ce){return ce.split(`
`).reduce((ge,he)=>{if(/^\s*\[/.test(he))return ge.activeTable=!0,ge.lines.push(he),ge;if(!ge.activeTable&&/^\s*hooks\s*=\s*\[\s*]\s*(?:#.*)?$/.test(he))return ge;return ge.lines.push(he),ge},{activeTable:!1,lines:[]}).lines.join(`
`)}function Rh(ce,me){if(ce[me]!=="#")return me;let ge=ce.indexOf(`
`,me+1);return ge===-1?ce.length:ge+1}function Ph(ce,me){return mo(ce,me,{skipComment:Rh,stringError:"Unterminated string in Kimi Code config",bracketError:"Unmatched hooks array in Kimi Code config"})}function Ld(ce){let me=!1,ge=0;while(ge<ce.length){let he=ce.indexOf(`
`,ge),Se=he===-1?ce.length:he,Fe=ce.slice(ge,Se);if(/^\s*\[/.test(Fe))me=!0;if(!me){let He=/^(\s*)hooks\s*=\s*\[/.exec(Fe);if(He){let Ge=ge+He[0].lastIndexOf("[");return{start:Ge,end:Ph(ce,Ge)}}}ge=he===-1?ce.length:he+1}return}function Dh(ce,me){let ge=ce.slice(0,me.end).trimEnd(),he=uc(ce,me.end),Se=he===""?"     ":`${he}  `,Fe=!ge.endsWith("[")&&!ge.endsWith(",");return`${ge}${Fe?",":""}
${Se}${Zi}${ce.slice(me.end)}`}function Ah(ce){let me=Ld(ce);if(me&&ce.slice(me.start+1,me.end).trim())return Dh(ce,me);let ge=Sh(ce).trimEnd();if(ge==="")return`${Yi}
`;return`${ge}

${Yi}
`}function Eh(ce){return ce.split(/(?=^\s*\[)/m).filter((ge)=>!/^\s*\[\[hooks]]\s*$/m.test(ge)||!ge.includes(Ar)).join("").trimEnd()}function _h(ce,me){let ge=ce.indexOf(Zi,me.start);if(ge===-1||ge>me.end)return ce;return go(ce,{start:ge,end:ge+Zi.length})}function wd(ce){let me=bd(ce);if(xh(Ch(me),{recursive:!0}),!yd(me))return Qt(me,`${Yi}
`),{path:me,alreadyInstalled:!1};let ge=vd(me,"utf-8");if(ge.includes(Ar))return{path:me,alreadyInstalled:!0};return Qt(me,Ah(ge)),{path:me,alreadyInstalled:!1}}function kd(ce){let me=bd(ce);if(!yd(me))return{path:me,alreadyInstalled:!1};let ge=vd(me,"utf-8");if(!ge.includes(Ar))return{path:me,alreadyInstalled:!1};let he=Ld(ge),Se=he?_h(ge,he):`${Eh(ge)}
`;return Qt(me,Se),{path:me,alreadyInstalled:!0}}var Qi="safety-net@cc-marketplace",xd=new Set(["claude-code","codex","copilot-cli","gemini-cli","hermes-agent","openclaw","opencode","pi"]),Cd=new Set(["antigravity-cli","cursor","grok-build","hermes-agent","kimi-code"]);function ts(ce){return/^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(ce??"")}function Ad(ce){return/^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(ce??"")}function $h(ce){return/^Marketplace `cc-marketplace`\s*$/m.test(ce??"")}var Ed={"claude-code":{installCommands:(ce)=>{let me=Qr(ce,"cc-safety-net@cc-marketplace");return{commands:[...me?[["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","update","cc-safety-net@cc-marketplace"]]:[["claude","plugin","marketplace","add","kenryu42/cc-marketplace"],["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","install","cc-safety-net@cc-marketplace"]],...ui(ce).status==="disabled"?[["claude","plugin","enable","cc-safety-net@cc-marketplace"]]:[]],cleanupCommands:Qr(ce,Qi)?[["claude","plugin","uninstall",Qi]]:[],update:me}},uninstallCommands:[["claude","plugin","uninstall","cc-safety-net@cc-marketplace"],["claude","plugin","marketplace","remove","cc-marketplace"]]},codex:{installCommands:async(ce,me)=>{let ge=me??await hn(["codex","plugin","list"]),he=Ad(ge);return{commands:[he||$h(ge)?["codex","plugin","marketplace","upgrade","cc-marketplace"]:["codex","plugin","marketplace","add","kenryu42/cc-marketplace"],["codex","plugin","add","cc-safety-net@cc-marketplace"]],cleanupCommands:ts(ge)?[["codex","plugin","remove","safety-net@cc-marketplace"]]:[],update:he}},uninstallCommands:[["codex","plugin","remove","cc-safety-net@cc-marketplace"],["codex","plugin","marketplace","remove","cc-marketplace"]],postInstallMessage:"Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it."},"copilot-cli":{installCommands:async()=>{let ce=await hn(["copilot","plugin","list"]),me=[...fl(ce)?[["copilot","plugin","uninstall","copilot-safety-net"]]:[],...ml(ce)?[["copilot","plugin","uninstall",dl]]:[]];if(ul(ce))return{commands:[["copilot","plugin","marketplace","update","cc-marketplace"],["copilot","plugin","update",gn]],cleanupCommands:me,update:!0};return{commands:[pl(await hn(["copilot","plugin","marketplace","list"]))?["copilot","plugin","marketplace","update","cc-marketplace"]:["copilot","plugin","marketplace","add","kenryu42/cc-marketplace"],["copilot","plugin","install",gn]],cleanupCommands:me}},uninstallCommands:[["copilot","plugin","uninstall","cc-safety-net@cc-marketplace"],["copilot","plugin","marketplace","remove","cc-marketplace"]]},"gemini-cli":{installCommands:(ce)=>{let me=vi(ce);if(me.status==="configured")return{commands:[["gemini","extensions","update","gemini-safety-net"]],update:!0};if(me.status==="disabled")return{commands:[["gemini","extensions","update","gemini-safety-net"],["gemini","extensions","enable","gemini-safety-net"]],update:!0};return{commands:[["gemini","extensions","install","https://github.com/kenryu42/gemini-safety-net","--consent"]]}},uninstallCommands:[["gemini","extensions","uninstall","gemini-safety-net"]]},openclaw:{beforeInstall:_i,installCommands:()=>({commands:rc()}),uninstallCommands:[["openclaw","plugins","uninstall",Jt,"--force"]],postInstallMessage:["Restart the OpenClaw Gateway to apply the change.","If plugins.allow is set in openclaw.json, it must also list cc-safety-net."].join(`
`)},opencode:{beforeInstall:$i,installCommands:[["opencode","plugin","-g","-f","cc-safety-net@latest"]]},pi:{installCommands:[["pi","install","npm:cc-safety-net"]],uninstallCommands:[["pi","uninstall","npm:cc-safety-net"]]}};function Ro(){return process.env.HOME??Th()}function _d(ce,me=(ge)=>ge){try{let ge=JSON.parse(me(Dd(ce,"utf-8")));if(!ge||typeof ge!=="object"||Array.isArray(ge))throw Error(`Settings file ${ce} must be a JSON object`);return ge}catch(ge){if(ge instanceof SyntaxError)throw Error(`Failed to parse ${ce}: ${ge.message}`);throw ge}}function Oh(ce){let me=Xi(vr(ce),"settings.json");if(!es(me))return;let ge=_d(me,sn),he=ge.enabledPlugins;if(!he||typeof he!=="object"||Array.isArray(he))return;if(he[gn]!==!1)return;let Se=Dd(me,"utf-8"),Fe=Se.replace(new RegExp(`("${gn}"\\s*:\\s*)false`),"$1true");return he[gn]=!0,Qt(me,Fe!==Se?Fe:`${JSON.stringify(ge,null,2)}
`),`Enabled ${gn} plugin in ${me}`}function Fh(ce){let me=Oi(ce);if(!es(me))return;let ge=_d(me);if(!Array.isArray(ge.packages))return;let he=ge.packages.find((Se)=>!!Se&&typeof Se==="object"&&!Array.isArray(Se)&&Fi(Se.source)&&("extensions"in Se));if(!he)return;return delete he.extensions,Qt(me,`${JSON.stringify(ge,null,2)}
`),`Enabled npm:cc-safety-net extensions in ${me}`}function Sd(ce,me){let ge=Wt({label:me,booleans:Object.fromEntries(yn.map((Fe)=>[Fe.target,[Fe.flag]]))},ce),he=ge.errors[0];if(he)throw Error(he);let Se=yn.filter((Fe)=>ge.flags[Fe.target]).map((Fe)=>Fe.target);if(Se.length!==1)throw Error(`Choose exactly one ${me} target: ${yn.map((Fe)=>Fe.flag).join(", ")}`);return Se[0]}async function Td(ce=Ro(),me=Jn){let[ge,he,Se]=await Promise.all([me(["amp","plugins","list"],30000),me(["codex","plugin","list"],30000),me(["copilot","--binary-version"])]);return{codexPluginListOutput:he,hooks:er(process.cwd(),{homeDir:ce,ampPluginListOutput:ge,codexPluginListOutput:he,copilotCliVersion:Se})}}async function jh(ce,me=Jn){let ge=await Td(Ro(),me);return ge.hooks.filter((he)=>ce==="install"?he.configured:he.detected||he.inspectionStatus==="not-inspected").filter((he)=>he.platform!=="codex"||!ts(ge.codexPluginListOutput)||Ad(ge.codexPluginListOutput)).map((he)=>he.platform)}function Nh(ce,me,ge){if(me.length>0)return{finish:async()=>[Sd(me,ce)]};if(!ge.selectTargets&&!Bi(ge.input,ge.output))return{finish:async()=>[Sd(me,ce)]};let he=ge.detectConfiguredTargets??(()=>jh(ce,ge.fetchVersion)),Se=Promise.all([pd(ge.probeTargets),he()]);return{ready:Se,finish:async()=>{let[Fe,He]=await Se,Ge=fd(Fe,{action:ce,configuredTargets:He}),Dt=ge.selectTargets?await ge.selectTargets(ce,Pd(ce,Ge)):await zc(ce,Pd(ce,Ge),{input:ge.input,output:ge.output});if(Dt==="update")return Dt;if(!Dt||Dt.length===0)return null;return Ji(Dt)}}}async function Mn(ce,me,ge=!1,he){let Se=Ed[ce];Se.beforeInstall?.(me);let Fe=typeof Se.installCommands==="function"?await Se.installCommands(me,he):{commands:Se.installCommands};return await Di(Fe.commands),await Zl(Fe.cleanupCommands??[]),[`${Fe.update||ge?"Updated":"Installed"} ${Kt(ce)} integration`,Se.postInstallMessage].filter(Boolean).join(`
`)}async function ir(ce){let me=Ed[ce];if(!me.uninstallCommands)throw Error(`${Kt(ce)} uninstall is not supported`);return await Di(me.uninstallCommands),`Uninstalled ${Kt(ce)} integration`}function Hh(ce){let me=kc(ce);return me.alreadyInstalled?`Uninstalled OpenCode plugin from ${me.path}`:`OpenCode plugin not installed in ${me.path}`}var Mh={"antigravity-cli":{install:ld,uninstall:cd},cursor:{install:Cl,uninstall:Sl},"grok-build":{install:Ol,uninstall:Fl},"kimi-code":{install:wd,uninstall:kd}};function Pn(ce,me,ge,he=!1){if(ce==="install"&&!he)Co(ge);let Se=Mh[me][ce](ge),Fe=Kt(me),He=ce!=="install"?"Uninstalled":he?"Updated":"Installed";return ce==="install"&&Se.alreadyInstalled?he?`${Fe} hook up to date in ${Se.path}`:`${Fe} hook already installed in ${Se.path}`:ce==="uninstall"&&!Se.alreadyInstalled?`${Fe} hook not installed in ${Se.path}`:`${He} ${Fe} hook ${ce==="install"?"in":"from"} ${Se.path}`}var Uh={amp:{install:nd,uninstall:rd,restartNote:'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.'},"hermes-agent":{install:Ul,uninstall:Gl,afterInstall:async(ce)=>{let me=Si(ce);return await hn(["hermes","plugins","enable",ln,"--no-allow-tool-override"]),!me},beforeUninstall:async(ce)=>{Ci(ce);try{await hn(["hermes","plugins","disable",ln])}catch(me){console.warn(`${me instanceof Error?me.message:String(me)}
Removing the plugin files anyway; ${ln} may still be listed in the Hermes config.`)}},restartNote:"Restart Hermes to apply the change."}};async function So(ce,me,ge,he=!1){let Se=Uh[me];if(ce==="uninstall")await Se.beforeUninstall?.(ge);let Fe=ce==="install"?await Se.install(ge):await Se.uninstall(ge),He=ce==="install"&&await Se.afterInstall?.(ge),Ge=Kt(me),Dt=!He&&(ce==="install"&&Fe.alreadyInstalled||ce==="uninstall"&&!Fe.alreadyInstalled);return[Dt?ce==="install"?`${Ge} plugin ${he?"up to date":"already installed"} at ${Fe.path}`:`${Ge} plugin not installed at ${Fe.path}`:`${ce!=="install"?"Uninstalled":he?"Updated":"Installed"} ${Ge} plugin ${ce==="install"?"at":"from"} ${Fe.path}`,Dt?void 0:Se.restartNote].filter(Boolean).join(`
`)}var Gh={amp:{install:(ce,me)=>So("install","amp",ce,me),uninstall:(ce)=>So("uninstall","amp",ce)},"antigravity-cli":{install:(ce,me)=>Pn("install","antigravity-cli",ce,me),uninstall:(ce)=>Pn("uninstall","antigravity-cli",ce)},"claude-code":{install:(ce,me)=>Mn("claude-code",ce,me),uninstall:()=>ir("claude-code")},codex:{install:(ce,me,ge)=>Mn("codex",ce,me,ge),uninstall:()=>ir("codex")},"copilot-cli":{install:async(ce,me)=>[await Mn("copilot-cli",ce,me),Oh(ce)].filter(Boolean).join(`
`),uninstall:()=>ir("copilot-cli")},cursor:{install:(ce,me)=>Pn("install","cursor",ce,me),uninstall:(ce)=>Pn("uninstall","cursor",ce)},"gemini-cli":{install:(ce,me)=>Mn("gemini-cli",ce,me),uninstall:()=>ir("gemini-cli")},"grok-build":{install:(ce,me)=>Pn("install","grok-build",ce,me),uninstall:(ce)=>Pn("uninstall","grok-build",ce)},"hermes-agent":{install:(ce,me)=>{if(!me)Co(ce);return So("install","hermes-agent",ce,me)},uninstall:(ce)=>So("uninstall","hermes-agent",ce)},"kimi-code":{install:(ce,me)=>Pn("install","kimi-code",ce,me),uninstall:(ce)=>Pn("uninstall","kimi-code",ce)},openclaw:{install:async(ce,me)=>{let ge=await Mn("openclaw",ce,me);return await oc(),ge},uninstall:(ce)=>(_i(ce),ir("openclaw"))},opencode:{install:async(ce,me)=>{let ge=await Mn("opencode",ce,me);return await vc(ce),ge},uninstall:(ce)=>Hh(ce)},pi:{install:async(ce,me)=>[await Mn("pi",ce,me),Fh(ce)].filter(Boolean).join(`
`),uninstall:()=>ir("pi")}},Rd=["Install CC Safety Net as a native Kimi Code plugin:","","  1. Start Kimi Code and run: /plugins install https://github.com/kenryu42/cc-safety-net","     Confirm the trust prompt; it defaults to cancel.","  2. Run /reload, or start a new session.","","Note: Kimi Code hooks are fail-open. When the hook process cannot start, crashes, or times","out, Kimi Code allows the tool call."].join(`
`);function Bh(ce){if(xr({homeDir:ce,cwd:process.cwd()}).status!=="configured")return Rd;return[Rd,"",Ht.red(["CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.","After the plugin is active, remove it with: cc-safety-net uninstall --kimi-code"].join(`
`))].join(`
`)}function Pd(ce,me){return me.map((ge)=>ce==="install"&&ge.target==="kimi-code"&&ge.unavailableReason==="already installed"?{...ge,available:!0,unavailableReason:void 0,label:`${ge.label} (global hook installed)`}:ge)}function qh(ce,me){if(ce.selectKimiInstallMethod)return ce.selectKimiInstallMethod();if(!Bi(ce.input,ce.output))return Promise.resolve("global-hook");return Vc({input:ce.input,output:ce.output,globalHookInstalled:xr({homeDir:me,cwd:process.cwd()}).status==="configured"})}async function Id(ce,me,ge,he=!1,Se){return Gh[me][ce](ge,he,Se)}function Vh(ce){let me=Wt({label:"update"},ce).errors[0];if(me)throw Error(me)}async function zh(ce,me=Jn){let ge=await Td(ce,me),he=Xi(vr(ce),"installed-plugins");return{targets:Ji([...ge.hooks.filter((Fe)=>Fe.platform!=="copilot-cli"&&Fe.detected).map((Fe)=>Fe.platform),...[eo,cl,ll].flatMap((Fe)=>es(Xi(he,...Fe))?["copilot-cli"]:[]),...Qr(ce,Qi)?["claude-code"]:[],...ts(ge.codexPluginListOutput)?["codex"]:[]]),codexPluginListOutput:ge.codexPluginListOutput}}async function Kh(ce){let me=Ro(),ge=ce.output??process.stdout,he=(ce.scriptPath??process.argv[1]??"").split(/[\\/]/),Se=he.find((It)=>/^bunx-\d+-/.test(It)),Fe=Se!==void 0||he.includes("_npx")?null:(ce.checkLatestVersion??Cn)(),He=async()=>{let It=Fe&&await Fe;if(It?.updateAvailable)ge.write(`
Update available: cc-safety-net ${It.currentVersion} → ${It.latestVersion}. Update this CLI with your package manager, e.g. \`npm i -g cc-safety-net@latest\` for a global install.
`)},Ge=zh(me,ce.fetchVersion??Jn).then(async(It)=>{let $t=new Set(It.targets);return{targets:It.targets,codexPluginListOutput:It.codexPluginListOutput,available:new Map(await Promise.all(yn.filter((Ot)=>$t.has(Ot.target)&&xd.has(Ot.target)).map(async(Ot)=>[Ot.target,await Wi(Ot.probeCommand)])))}}),Dt=await yr(ce.showBanner??!0,()=>({ready:Ge,finish:()=>Ge}),()=>hr({input:ce.input??process.stdin,output:ge}),{loadingMessage:"Checking installed integrations…",output:ge}),At=await Promise.resolve().then(()=>(dd(Ih(),process.platform,Se),null)).catch((It)=>Er(It));if(Dt.targets.length===0){if(ge.write("No installed integrations found. Run `cc-safety-net install` to set one up.\n"),At!==null)console.error(At);return await He(),At===null?0:1}let Tt=Dt.targets.some((It)=>Cd.has(It))?await Promise.resolve().then(()=>(Co(me),null)).catch((It)=>Er(It)):null,Ft=await Yr(Promise.all(Dt.targets.map((It)=>{if(xd.has(It)&&!Dt.available.get(It))return Promise.resolve({message:`${Kt(It)} not found; skipped`,failed:!1});if(Tt!==null&&Cd.has(It))return Promise.resolve({message:Tt,failed:!0});return Id("install",It,me,!0,Dt.codexPluginListOutput).then(($t)=>({message:$t,failed:!1}),($t)=>({message:Er($t),failed:!0}))})),{loadingMessage:`Updating ${Dt.targets.length} integration${Dt.targets.length===1?"":"s"}…`,output:ge}),jt=At===null?Ft:[...Ft,{message:At,failed:!0}];return jt.forEach((It)=>{It.failed?console.error(It.message):ge.write(`${It.message}
`)}),await He(),jt.some((It)=>It.failed)?1:0}function ns(ce,me={}){return Promise.resolve().then(()=>Vh(ce)).then(()=>Kh(me)).catch((ge)=>(console.error(Er(ge)),1))}async function _r(ce,me,ge={}){try{let he=await yr(!0,()=>Nh(ce,me,ge),()=>hr({input:ge.input??process.stdin,output:ge.output??process.stdout}),{loadingMessage:ce==="install"?"Checking available integrations…":"Checking installed integrations…",output:ge.output??process.stdout});if(!he)return(ge.output??process.stdout).write(`Cancelled: nothing was ${ce}ed.
`),0;if(he==="update")return(ge.runUpdate??(()=>ns([],{fetchVersion:ge.fetchVersion,input:ge.input,output:ge.output,showBanner:!1})))();let Se=Ro(),Fe=ge.output??process.stdout;return await ud(he,async(He)=>{if(He==="kimi-code"&&ce==="install"){let Dt=await qh(ge,Se);if(Dt===null){Fe.write(`Cancelled: Kimi Code integration was not installed.
`);return}if(Dt==="plugin"){Fe.write(`${Bh(Se)}
`);return}}let Ge=await Yr(Id(ce,He,Se),{loadingMessage:`${ce==="install"?"Installing":"Uninstalling"} ${Kt(He)} integration…`,output:Fe});Fe.write(`${Ge}
`)}),0}catch(he){return console.error(Er(he)),1}}function Er(ce){let me=ce instanceof Error?ce.message:String(ce),ge=typeof ce==="object"&&ce!==null&&"code"in ce?ce.code:null;if(ge==="EACCES"||ge==="EPERM")return`${me}
Check file permissions for the target config file and parent directory.`;if(ge==="ENOENT")return`${me}
Check that the target config path and parent directory exist.`;if(ge==="ENOTDIR")return`${me}
Check that every parent path component is a directory.`;return me}import{mkdirSync as Jh}from"node:fs";import{dirname as Wh}from"node:path";import{createInterface as Yh}from"node:readline";var $d=new Set(["check","apply"]),Od="(unset)";async function jd(ce,me={}){let ge=Wt({label:"policy",booleans:{global:["-g","--global"]},positionals:"list"},ce),he=ge.positionals[0],Se=[...ge.errors,...he&&!$d.has(he)?[`Unknown policy subcommand: ${he}`]:[],...he&&$d.has(he)&&!ge.positionals[1]?[`policy ${he} requires a file`]:[],...ge.positionals.slice(2).map((It)=>`Unexpected policy argument: ${It}`)];if(Se.length>0){for(let It of Se)console.error(It);return 1}let Fe=ge.positionals[1];if(!he||!Fe)return tr(Ur,console.error),1;let He=ge.flags.global?y():g(me.cwd??process.cwd()),Ge=xn(Fe),Dt=[...Ge.errors,..._(Ge.value).map((It)=>`${Fe}: ${It}`),...!ge.flags.global&&Qh(Ge.value)&&Ge.value.audit!==void 0?[`${Fe}: audit settings are user scope only; remove the audit section from a project proposal`]:[]];if(Dt.length>0){for(let It of Dt)console.error(It);return 1}let At=f(Ge.value);if(console.log(`Scope: ${ge.flags.global?"user":"project"} (${He})`),console.log(`Proposal: ${Fe}`),ge.flags.global)Fd(f(xn(He).value),At,!0);if(!ge.flags.global){let It=Vn().baseline;console.log("Effective policy (user + project merged):"),Fd(X(It,le(xn(He).value).policy).policy,X(It,le(Ge.value).policy).policy,!1)}if(he==="check")return 0;let Tt=me.input??process.stdin,Ft=me.output??process.stdout;if(!Tt.isTTY||!Ft.isTTY)return console.error("policy apply confirms interactively; run this yourself in a terminal:"),console.error(`  cc-safety-net policy apply ${Fe}${ge.flags.global?" --global":""}`),1;if(!await Zh(`Apply this policy to ${He}? [y/N] `,Tt,Ft))return console.log("Cancelled; nothing was written."),0;return Xh(He,Ge.value,At,ge.flags.global),console.log(`Policy applied: ${He}`),0}function Zh(ce,me,ge){let he=Yh({input:me,output:ge,terminal:!1});return new Promise((Se)=>{he.once("close",()=>Se(!1)),he.question(ce,(Fe)=>{Se(/^y(es)?$/i.test(Fe.trim())),he.close()})})}function Xh(ce,me,ge,he){if(he){Q(ge);return}Jh(Wh(ce),{recursive:!0}),h(ce,ur(me,ge))}function Fd(ce,me,ge){let he=dr(ce,me,ge);if(he.length===0){console.log("No changes.");return}console.log(`Changes (${he.length}):`);for(let Se of he)console.log(`  ${Se.field}: ${Se.before??Od} -> ${Se.after??Od}`)}function Qh(ce){return!!ce&&typeof ce==="object"&&!Array.isArray(ce)}import{join as Oy}from"node:path";var Nd="# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Priority |\n|-------|-------------|---------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | First |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | Second |\n| GitHub source | Listed in a local `rule.json` | Vendored into the consumer's `<rulebook-name>/rulebook.json` by `rule add` | Source order |\n\nEvery rulebook is a live file: the runtime reads it on each tool call, so an edit applies to the next command with no publishing step.\n\nUser scope is evaluated before project scope; within a scope, sources apply in `rules` array order. A duplicate active rulebook name keeps the first claim and ignores the later rulebook with a warning, so a user-scoped name shadows a project-scoped one.\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook. `CC_SAFETY_NET_HOME` overrides the `~/.cc-safety-net` user root.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `$schema`: Optional. `cc-safety-net rule verify` inserts it into a valid `rule.json` that lacks it.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- `overrides` values are either `\"off\"` to disable a rule or an object with a required `reason` (replacement block reason) and an optional `intent` (one of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain`).\n- A project override cannot target a user-scoped rule: only that override is ignored, the user rule keeps its configured state, and `rule verify` reports the diagnostic as a failure.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- Run `cc-safety-net rule add owner/repo` to add every rulebook currently present on the repository's default branch.\n- Use `--only` to select one or more rulebooks while preserving their order: `cc-safety-net rule add owner/repo --only aws gcloud`.\n- Use `--ref` to select a branch, tag, or commit instead of the default branch: `cc-safety-net rule add owner/repo --ref v2 --only aws`.\n- GitHub sources are stored in canonical form as `owner/repo#ref/<rulebook-name>`. That form remains valid in `rule.json` and as direct CLI input.\n- GitHub refs may contain `/`-separated path segments, such as `feature/rulebook-v2`.\n- The GitHub source name, the repository directory name, and the rulebook `name` must match exactly.\n- Rulebook source strings must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` or `2` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | Free text; not type-checked at runtime |\n| `author` | No | Free text; not type-checked at runtime |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | No | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook (case-insensitive); same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `intent` | No | One of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain` |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Rule Fields (`rulebook_version` 2)\n\nVersion 2 replaces `subcommand` and `block_args` with an exact-token `match` object. Version 1 rulebooks keep their fields and their behavior; a client that does not support version 2 rejects the rulebook instead of applying broader version 1 semantics.\n\n```json\n{\n  \"name\": \"block-terraform-apply-destroy\",\n  \"command\": \"terraform\",\n  \"match\": {\n    \"command_path\": [\"apply\"],\n    \"any_args\": [\"-destroy\", \"--destroy\"]\n  },\n  \"reason\": \"Review a destroy plan first with 'terraform plan -destroy'.\",\n  \"intent\": \"use_alternative\"\n}\n```\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Same as version 1 |\n| `command` | Yes | Same as version 1 |\n| `match.command_path` | Yes | Non-empty array of non-empty command words |\n| `match.any_args` | No | Non-empty array of unique non-empty argument tokens |\n| `match.exclude_args` | No | Non-empty array of unique non-empty argument tokens |\n| `intent` | No | Same as version 1 |\n| `reason` | Yes | Same as version 1 |\n\n### Matching Behavior (`rulebook_version` 2)\n\n- **Command**: Normalized to lowercase basename, as in version 1.\n- **Command path**: After recognized global options and their values are skipped, the next command words must equal `command_path` exactly. AWS, gcloud, and Azure CLI value-taking global options are built in; Terraform's `-chdir=dir` is `=`-joined and is skipped with its own token.\n- **Unrecognized options**: A token starting with `-` that is not a recognized global option is skipped without consuming a value, so an unlisted value-taking option with a separate value (`--newflag value`) makes the rule miss. This fails open deliberately; document such gaps in the rulebook.\n- **`any_args`**: At least one listed token must appear literally among the arguments.\n- **`exclude_args`**: Any listed token appearing literally among the arguments prevents the match, which is how a safe preview such as `aws s3 rm --dryrun` stays allowed.\n- **No short-option expansion**: Arguments compare as exact tokens, so list every accepted spelling (`\"-destroy\"` and `\"--destroy\"`).\n- **Literal and case-sensitive**: No regex, glob, or substring matching. The first matching rule wins.\n- Release channels are separate rules: `gcloud beta compute instances delete` needs its own `command_path`.\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nFixtures are optional documentation of intended behavior. Version 1 fixtures are shape-validated only. Version 2 fixtures are evaluated against the rulebook's own rules when a source is fetched by `rule add` or `rule update`, and by `rule verify`; a failing fixture rejects that source before it is written. Loading a rulebook does not re-evaluate fixtures. CC Safety Net never executes fixture commands; they are analyzer inputs only.\n\n## Matching Behavior\n\nThe subcommand, argument, and option rules below describe `rulebook_version` 1 rules; version 2 rules match as described in Matching Behavior (`rulebook_version` 2). Execution order and transparent wrappers apply to both.\n\n- **Command**: Normalized to lowercase basename with any trailing `.exe` removed (`/usr/bin/git` → `git`).\n- **Subcommand**: The first command token after recognized Git and Docker global options and their values; `--` ends option parsing. An unrecognized option without `=` may consume the following token as its value.\n- **Arguments**: Each `block_args` value is compared literally against every command token, including expanded short options. The command is blocked if **any** item matches.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source; add `--only <rulebook...>` or `--ref <ref>` for repository selection. The command adds the selected sources and syncs them.\n5. Edit a local rulebook whenever you like: the edit is enforced on the next command, so there is nothing to run afterwards.\n6. Run `cc-safety-net rule update [source]` to re-fetch remote sources and rewrite the vendored copies; the command prints what changed. A source with an ordinary update failure keeps its vendored copy while the other selected sources still update. Resource-limit failures remain fatal for the whole update.\n7. Run `cc-safety-net rule verify` to validate config, local rulebooks, and shareable GitHub-source rulebook directories in the current repository (it does not fetch remote content).\n8. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nA missing or invalid rulebook file makes that source inactive, and an unreadable or invalid `rule.json` makes every source in its scope inactive. Inactive sources stop applying their rules while other custom rules and all built-in protections stay active. Fix the file named in the diagnostic, or run `cc-safety-net rule update` when a remote source has not been vendored yet. Run `cc-safety-net status` to see degraded sources.\n";function Po(ce,me){if(!ce.ok){Bd(ce);return}Ud(ce,me)}function Md(ce,me,ge){if(ce.ok)console.log(ge);if(!ce.add){Po(ce,`Added rulebook source: ${me}`);return}if(!ce.ok){Bd(ce);return}if(ce.add.added.length>0)console.log(`Added ${ce.add.added.length} ${ce.add.added.length===1?"rulebook":"rulebooks"} from ${ce.add.source} at ${ce.add.ref}:`),ce.add.added.forEach((he)=>{console.log(`  - ${he}`)});if(ce.add.alreadyConfigured.length>0)console.log(`Rulebooks already configured from ${ce.add.source} at ${ce.add.ref}: ${ce.add.alreadyConfigured.join(", ")}`);if(ce.add.commits.length>0)console.log(`Vendored at ${ce.add.commits.map((he)=>he.slice(0,7)).join(", ")}.`);Ud(ce,"Rule config updated.")}function Ud(ce,me){for(let ge of ce.changes??[])console.log(ge);console.log(me),console.log(""),ey(ce.entries)}function ey(ce){if(ce.length===0){console.log("Active rulebooks: (none)");return}console.log(`Active rulebooks (${ce.length}):`);for(let me of ce)console.log(`  - ${me.name} ${me.version} (${ty(me.ruleCount)})`),console.log(`    Source: ${me.spec}`)}function ty(ce){return`${ce} ${ce===1?"rule":"rules"}`}function Gd(ce){Un("Active sources",ce.rulebooks,(me)=>[`[${me.source}] ${me.name} ${me.version}`,`  Source: ${me.spec}`]),Un("Active rules",ce.rules,(me)=>[`[${ry(ce,me.name)}] ${me.name}`,...ny(me),`  Reason: ${me.reason}`]),Un("Disabled rules",Hd(ce,"off"),(me)=>[me.key]),Un("Reason overrides",Hd(ce,"reason"),(me)=>[me.key,`  Reason: ${me.value.reason}`]),Un("Transparent wrappers",ce.transparent_wrappers,(me)=>[me]),Un("Issues",ce.errors,(me)=>[me]),Un("Warnings",ce.warnings,(me)=>[me])}function Un(ce,me,ge){if(me.length===0){console.log(`${ce}: (none)`);return}console.log(`${ce} (${me.length}):`);for(let he of me){let[Se,...Fe]=ge(he);console.log(`  - ${Se}`);for(let He of Fe)console.log(`    ${He}`)}}function ny(ce){if(!ce.match)return[`  Command: ${ce.subcommand?`${ce.command} ${ce.subcommand}`:ce.command}`,`  Block args: ${ce.block_args.join(", ")}`];return[`  Command: ${[ce.command,...ce.match.command_path].join(" ")}`,...ce.match.any_args?[`  Any args: ${ce.match.any_args.join(", ")}`]:[],...ce.match.exclude_args?[`  Exclude args: ${ce.match.exclude_args.join(", ")}`]:[]]}function ry(ce,me){return ce.rulebooks.find((ge)=>ge.rules.includes(me))?.source??"project"}function Hd(ce,me){return Object.entries({...ce.userConfig?.overrides??{},...ce.projectConfig?.overrides??{}}).filter((ge)=>{if(me==="off")return ge[1]==="off";return!!ge[1]&&typeof ge[1]==="object"}).map(([ge,he])=>({key:ge,value:he}))}function Bd(ce){for(let me of ce.errors)console.error(me)}import{dirname as qd,join as Do}from"node:path";var oy=".safety-net.json",iy="~/.cc-safety-net/config.json";async function Kd(ce){return[await Vd({legacyPath:Ct({cwd:ce.cwd}),configPath:I(ce.cwd),defaultRulebookName:"project-rules",migratedFrom:oy,cleanup:ce.cleanup,syncOptions:{cwd:ce.cwd}}),await Vd({legacyPath:Ae(),configPath:D(),defaultRulebookName:"user-rules",migratedFrom:iy,cleanup:ce.cleanup,syncOptions:{cwd:ce.cwd,global:!0}})].every((ge)=>ge)?0:1}async function Vd(ce){let me=C(ce.syncOptions),ge=o(me.filesystemScope,ce.legacyPath),he=n(ge);if(he===null)return console.log(`No legacy config found at ${ce.legacyPath}`),!0;let Se=ay(he);if(!Se.ok){for(let jt of Se.errors)console.error(jt);return!1}let Fe=p(me.configTarget);if(Fe.errors.length>0){for(let jt of Fe.errors)console.error(jt);return!1}let He=Fe.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},Ge=ly(qd(ce.configPath),He.rules,ce.defaultRulebookName,ce.migratedFrom,me.filesystemScope),Dt=Do(qd(ce.configPath),Ge,"rulebook.json"),At=o(me.filesystemScope,Dt),Tt=[zd(me.configTarget),zd(At)],Ft=await sy(ce,me.configTarget,At,Ge,Se.config.rules,He.rules.includes(Ge)?He.rules:[...He.rules,Ge],He.overrides??{},He.transparent_wrappers??[]);if(!Ft.ok){uy(Tt);for(let jt of Ft.errors)console.error(jt);return!1}if(!ce.cleanup)return console.log(`Migrated legacy config at ${ce.legacyPath}. Legacy file is no longer used.`),!0;if(!dy(me.configTarget,At,Ge,ce.migratedFrom,Se.config.rules))return console.error(`Migration cleanup verification failed for ${ce.legacyPath}`),!1;return Y(ge),console.log(`Deleted legacy config at ${ce.legacyPath}`),!0}async function sy(ce,me,ge,he,Se,Fe,He,Ge){try{return h(me,{version:1,rules:Fe,overrides:He,transparent_wrappers:Ge}),h(ge,cy(he,ce.migratedFrom,Se)),await cr(ce.syncOptions)}catch(Dt){return{ok:!1,errors:[Dt instanceof Error?Dt.message:String(Dt)]}}}function ay(ce){try{let me=JSON.parse(ce),ge=No(me);if(ge.errors.length>0)return{ok:!1,errors:ge.errors};return{ok:!0,config:{version:1,rules:me.rules??[]}}}catch{return{ok:!1,errors:["Invalid JSON"]}}}function ly(ce,me,ge,he,Se){let Fe=me.find((He)=>py(o(Se,Do(ce,He,"rulebook.json")))===he);if(Fe)return Fe;if(n(o(Se,Do(ce,ge,"rulebook.json")))===null)return ge;for(let He=2;;He++){let Ge=`${ge}-${He}`;if(n(o(Se,Do(ce,Ge,"rulebook.json")))===null)return Ge}}function cy(ce,me,ge){return{rulebook_version:1,name:ce,version:"1.0.0",description:"Migrated CC Safety Net rules.",author:"project",migrated_from:me,allowed_commands:[...new Set(ge.map((he)=>he.command))],rules:ge,tests:ge.map((he)=>({command:[he.command,he.subcommand,he.block_args[0]].filter(Boolean).join(" "),expect:"blocked",rule:he.name}))}}function dy(ce,me,ge,he,Se){if(!p(ce).config?.rules.includes(ge))return!1;try{let He=n(me);if(He===null)return!1;let Ge=JSON.parse(He);return Ge.migrated_from===he&&JSON.stringify(Ge.rules)===JSON.stringify(Se)}catch{return!1}}function zd(ce){return{target:ce,content:n(ce)}}function uy(ce){for(let me of ce){if(me.content===null){Y(me.target);continue}v(me.target,me.content)}}function py(ce){let me=n(ce);if(me===null)return null;try{let ge=JSON.parse(me);return typeof ge.migrated_from==="string"?ge.migrated_from:null}catch{return null}}import{mkdir as fy,readFile as my,writeFile as gy}from"node:fs/promises";import{dirname as hy,join as yy}from"node:path";var vy=86400000,by=604800000;async function Wd(ce=Date.now()){if(process.env.CC_SAFETY_NET_NO_UPDATE_CHECK)return null;let me=Pe();if(!me)return null;let ge=yy(me,".cc-safety-net","update-check.json"),he=await Ly(ge,ce);if(!he.lastCheck||ce-he.lastCheck>vy){let He=await Cn();if(he.lastCheck=ce,He.latestVersion)he.latestVersion=He.latestVersion;if(!await Jd(ge,he))return null;if(He.error)return null}let Se=he.latestVersion,Fe=Xt();if(!Se||!si(Se,Fe))return null;if(he.notifiedVersion===Se&&he.notifiedAt!==void 0&&ce-he.notifiedAt<by)return null;if(he.notifiedVersion=Se,he.notifiedAt=ce,!await Jd(ge,he))return null;return`UPDATE_AVAILABLE: cc-safety-net v${Se} is available (running v${Fe}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`}async function Ly(ce,me){let ge=await my(ce,"utf8").then((Fe)=>JSON.parse(Fe)).catch(()=>{return});if(!ge||typeof ge!=="object"||Array.isArray(ge))return{};let he=ge,Se=(Fe)=>typeof Fe==="number"&&Number.isFinite(Fe)&&Fe<=me?Fe:void 0;return{lastCheck:Se(he.lastCheck),latestVersion:typeof he.latestVersion==="string"?he.latestVersion:void 0,notifiedVersion:typeof he.notifiedVersion==="string"?he.notifiedVersion:void 0,notifiedAt:Se(he.notifiedAt)}}async function Jd(ce,me){return fy(hy(ce),{recursive:!0,mode:448}).then(()=>gy(ce,JSON.stringify(me),{mode:384})).then(()=>!0).catch(()=>!1)}import{join as wy,resolve as rs}from"node:path";var Yd="CC Safety Net Config",ky="═".repeat(Yd.length),xy="https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json",Cy=new Set(["rule.json","rule.lock","cache"]);function Zd(ce={}){try{return Sy(ce)}catch(me){if(me instanceof t)return console.error(me.message),1;throw me}}function Sy(ce){let me=ce.cwd??process.cwd(),ge=ce.userConfigPath??D(),he=ce.projectConfigPath??I(me),Se=ce.legacyUserConfigPath??Ae(),Fe=ce.legacyProjectConfigPath??vs(me),He=rs(me,pe),Ge=H({cwd:me,userConfigPath:ge,projectConfigPath:he}),Dt=H({cwd:me}),At=o(Ge.userScope,ge),Tt=o(Ge.projectScope,he),Ft=ce.legacyUserConfigPath?ue(ce.legacyUserConfigPath,"user policy"):o(Dt.userScope,Se),jt=ce.legacyProjectConfigPath?ue(ce.legacyProjectConfigPath,"project policy"):o(Dt.projectScope,Fe),It=!1,$t=!1,Ot=[],Ut=[],Gt=Ry(o(Dt.projectScope,He));if(Dy(),n(At)!==null){let Nt=bn(At);if(Nt.errors.push(...M(ge,Ge.userScope)),Ot.push({scope:"User",path:ge,result:Nt,schema:"rules",target:At}),Nt.errors.length>0)It=!0}if(n(Ft)!==null)if($t=!0,n(At)!==null)Ut.push(Ao("user","cleanup"));else{let Nt=Ho(Ft);if(Ot.push({scope:"User",path:Se,result:Nt,schema:"legacy",inactive:!0,target:Ft}),Ut.push(Ao("user",Nt.errors.length>0?"fix-or-delete":"migrate")),Nt.errors.length>0)It=!0}if(n(Tt)!==null){let Nt=bn(Tt);if(Nt.errors.push(...M(he,Ge.projectScope)),Ot.push({scope:"Project",path:rs(he),result:Nt,schema:"rules",target:Tt}),Nt.errors.length>0)It=!0;if(n(jt)!==null)$t=!0,Ut.push(Ao("project","cleanup"))}else if(n(jt)!==null){$t=!0,It=!0;let Nt=Ho(jt);Ot.push({scope:"Project",path:rs(Fe),result:Nt,schema:"legacy",inactive:!0,target:jt}),Ut.push(Ao("project",Nt.errors.length>0?"fix-or-delete":"migrate"))}if(Gt?.result.errors.length)It=!0;if(Ot.length===0&&!Gt)return console.log(`
No config files found. Using built-in rules only.`),0;for(let Nt of Ot)if(Nt.inactive)Ey(Nt.scope,Nt.path,Nt.result);else if(Nt.result.errors.length>0)_y(Nt.scope,Nt.path,Nt.result.errors);else{if(Nt.schema==="rules"&&$y(Nt.target))console.log(`
Added $schema to ${Nt.scope.toLowerCase()} config.`);Ay(Nt.scope,Nt.path,Nt.result,Nt.schema)}for(let Nt of Ut)console.error(`
${Ht.red(Nt)}`);if(Gt)if(Gt.result.errors.length>0)Iy(Gt.path,Gt.result.errors);else Ty(Gt.path,Gt.result);if(It)return console.error(`
Config validation failed.`),1;return console.log($t?`
Configs valid with warnings.`:`
All configs valid.`),0}function Ao(ce,me){let ge=`legacy ${ce} config`;if(me==="cleanup")return`Warning: Legacy ${ce} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;if(me==="migrate")return`Warning: Legacy ${ce} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;return`Warning: Legacy ${ce} config is no longer supported. Fix or delete the ${ge}, then run \`npx -y cc-safety-net rule migrate\`.`}function Ry(ce){if(Ce(ce)===null)return null;let me=Py(ce);if(me.ruleNames.size===0&&me.errors.length===0)return null;return{path:ce.path,result:me}}function Py(ce){let me=[],ge=new Set,he=(Ce(ce)??[]).filter((Se)=>!Cy.has(Se.name)).sort((Se,Fe)=>Se.name.localeCompare(Fe.name));if(he.length===0)return{errors:me,ruleNames:ge};for(let Se of he){if(!u.test(Se.name)){me.push(`rulebook directory names must match ${u}: ${Se.name}`);continue}if(Se.kind!=="directory"){me.push(`${Se.name} must be a rulebook directory`);continue}let Fe=o(ce.scope,wy(ce.path,Se.name,"rulebook.json")),He=n(Fe);if(He===null){me.push(`${Se.name}/rulebook.json is required`);continue}try{let Ge;try{Ge=JSON.parse(He)}catch{me.push(`${Se.name}/rulebook.json: invalid JSON`);continue}let Dt=be(Ge);if(Dt.name!==Se.name){me.push(`rulebook name "${Dt.name}" must match folder "${Se.name}"`);continue}let At=Or(Dt);if(At.length>0){me.push(...At.map((Tt)=>`${Se.name}/rulebook.json: ${Tt}`));continue}ge.add(Se.name)}catch(Ge){me.push(Ge instanceof Error?`${Se.name}/rulebook.json: ${Ge.message}`:`${Se.name}/rulebook.json: ${String(Ge)}`)}}return{errors:me,ruleNames:ge}}function Dy(){console.log(Yd),console.log(ky)}function Ay(ce,me,ge,he){if(console.log(`
✓ ${ce} config: ${me}`),console.log(`  Schema: ${he==="rules"?"rulebook sources":"legacy inline rules"}`),ge.ruleNames.size>0){console.log(`  ${he==="rules"?"Sources":"Rules"}:`);let Se=1;for(let Fe of ge.ruleNames)console.log(`    ${Se}. ${Fe}`),Se++}else console.log(`  ${he==="rules"?"Sources":"Rules"}: (none)`)}function Ey(ce,me,ge){if(console.error(`
✗ Legacy ${ce.toLowerCase()} config: ${me}`),console.error("  Schema: legacy inline rules"),console.error("  Status: ignored by CC Safety Net"),ge.errors.length>0){console.error("  Errors:");let he=1;for(let Se of ge.errors)for(let Fe of Se.split("; "))console.error(`    ${he}. ${Fe}`),he++;return}if(ge.ruleNames.size>0){console.error("  Rules:");let he=1;for(let Se of ge.ruleNames)console.error(`    ${he}. ${Se}`),he++;return}console.error("  Rules: (none)")}function _y(ce,me,ge){Xd(`${ce} config`,me,ge)}function Ty(ce,me){console.log(`
✓ GitHub source rules: ${ce}`),console.log("  Rulebooks:");let ge=1;for(let he of me.ruleNames)console.log(`    ${ge}. ${he}`),ge++}function Iy(ce,me){Xd("GitHub source rules",ce,me)}function Xd(ce,me,ge){console.error(`
✗ ${ce}: ${me}`),console.error("  Errors:");let he=1;for(let Se of ge)for(let Fe of Se.split("; "))console.error(`    ${he}. ${Fe}`),he++}function $y(ce){try{let me=n(ce);if(me===null)return!1;let ge=JSON.parse(me);if(ge.$schema)return!1;return v(ce,JSON.stringify({$schema:xy,...ge},null,2)),!0}catch(me){if(me instanceof t)throw me;return!1}}var Qd=new Set(["init","add","remove","update","sync","list","wrapper","migrate","doc","verify"]),Fy=new Set(["add","remove","list"]),jy="cc-safety-net/rulebooks";async function eu(ce){try{return await Ny(ce)}catch(me){if(me instanceof t)return console.error(me.message),1;throw me}}async function Ny(ce){let me=My(ce),ge=me.help?Hy(me.positionals):null;if(ge)return tr(ge),0;if(me.errors.length>0){for(let He of me.errors)console.error(He);return 1}let he=me.positionals[0];if(!he)return tr(Kn,console.error),1;let Se=me.positionals[1],Fe={global:me.global};if(he==="init"){let He=C(Fe);qy(He.configTarget);let Ge=Oy(He.configDir,"example-rules","rulebook.json"),Dt=o(He.filesystemScope,Ge);if(me.example&&n(Dt)===null)gt(Dt,"example-rules");let At=M(He.configPath,He.filesystemScope);for(let Tt of At)console.error(Tt);if(At.length>0)return 1;return console.log("Rule config initialized."),0}if(he==="add"){let He=tu(me);if(!He)return console.error("rule add requires a source (pass --only <rulebook...> to select from cc-safety-net/rulebooks)"),1;let Ge=C(Fe),Dt=await qo(He,{...Fe,ref:me.ref,rulebooks:me.only.length>0?me.only:void 0});return Md(Dt,He,`Scope: ${me.global?"user":"project"} (${Ge.configDir})`),Dt.ok?0:1}if(he==="remove"){if(!Se)return console.error("rule remove requires a source"),1;let He=await zo(Se,{...Fe,deleteSource:me.deleteSource});return Po(He,`Removed rulebook source: ${Se}`),He.ok?0:1}if(he==="update"){let He=await cr({...Fe,only:Se,refresh:!0});return Po(He,"Rule config updated."),He.ok?0:1}if(he==="sync")return Wa({global:me.global});if(he==="list"){let He=V();return Gd(He),He.errors.length>0?1:0}if(he==="wrapper")return Vy(me);if(he==="migrate")return Kd({cleanup:me.cleanup,cwd:process.cwd()});if(he==="doc"){console.log(Nd);let He=await Wd();if(He)console.error(He);return 0}if(he==="verify")return Zd();return 1}function Hy(ce){if(ce.length===0)return Kn;let me=Kn.subcommands.filter((he)=>he.usage.split(" ")[0]===ce[0]);if(me.length===0)return null;if(ce.length===1&&me.length>1)return{name:`rule ${ce[0]}`,description:`Subcommands of rule ${ce[0]}`,usage:`rule ${ce[0]} <subcommand>`,subcommands:me,options:[]};let ge=ce.length===1?me[0]:me.find((he)=>he.usage.split(" ")[1]===ce[1]);if(!ge)return null;return{name:`rule ${ce[0]}`,description:ge.description,usage:`rule ${ge.usage}`,options:ce[0]==="add"?ei:[],examples:ce[0]==="add"?ti:void 0}}function My(ce){let me=Wt({label:"rule",booleans:{global:["-g","--global"],check:["--check"],cleanup:["--cleanup"],deleteSource:["--delete-source"],example:["--example"]},values:{ref:["--ref"]},lists:{only:["--only"]},positionals:"list"},ce),ge={...me.flags,ref:me.values.ref,only:me.lists.only??[],help:me.help,positionals:me.positionals,errors:me.errors};return Uy(ge),ge}function Uy(ce){let[me]=ce.positionals;if(me&&!Qd.has(me))ce.errors.push(`Unknown rule subcommand: ${me}`);if(ce.deleteSource&&me!=="remove")if(me&&Qd.has(me))ce.errors.push(`Unknown option for rule ${me}: --delete-source`);else ce.errors.push("--delete-source is only valid with 'rule remove'");if(ce.check&&me)ce.errors.push(sr(me,"--check"));if(ce.cleanup&&me!=="migrate")ce.errors.push(sr(me,"--cleanup"));if(ce.example&&me!=="init")ce.errors.push(sr(me,"--example"));if(ce.ref&&me!=="add")ce.errors.push(sr(me,"--ref"));if(ce.only.length>0&&me!=="add")ce.errors.push(sr(me,"--only"));if(me==="add")Gy(ce);if(me==="migrate"){if(ce.global)ce.errors.push(sr(me,"--global"));if(ce.positionals.length>1)ce.errors.push(`Unexpected rule migrate argument: ${ce.positionals[1]}`)}else if(me==="wrapper")By(ce);else if(ce.positionals.length>2)ce.errors.push(`Unexpected rule argument: ${ce.positionals[2]}`);if(me==="list"&&ce.global)ce.errors.push("Unknown option for rule list: --global")}function tu(ce){if(ce.positionals[1])return ce.positionals[1];if(ce.ref||ce.only.length>0)return jy;return}function Gy(ce){let me=tu(ce);if(!me)return;if((ce.ref||ce.only.length>0)&&!ne(me)){if(ce.ref)ce.errors.push(`--ref can only select a ref for an owner/repo source: ${me}`);if(ce.only.length>0)ce.errors.push("--only can only select rulebooks from an owner/repo source");return}if(ce.ref&&!fe(ce.ref))ce.errors.push(`--ref must use valid path segments: ${ce.ref}`);let ge=ce.only.filter((he)=>!u.test(he));if(ge.length>0)ce.errors.push(`Invalid rulebook names: ${ge.join(", ")}`)}function sr(ce,me){return ce?`Unknown option for rule ${ce}: ${me}`:`Unknown option for rule: ${me}`}function By(ce){let me=ce.positionals[1],ge=ce.positionals[2];if(!me){ce.errors.push("rule wrapper requires add, remove, or list");return}if(!Fy.has(me)){ce.errors.push(`Unknown rule wrapper action: ${me}`);return}if(me==="list"){if(ge)ce.errors.push(`Unexpected rule wrapper argument: ${ge}`);return}if(!ge){ce.errors.push(`rule wrapper ${me} requires a command`);return}if(ce.positionals.length>3)ce.errors.push(`Unexpected rule wrapper argument: ${ce.positionals[3]}`)}function qy(ce){if(n(ce)===null){mt(ce);return}let me=p(ce);if(!me.config)return;h(ce,{version:1,rules:me.config.rules,overrides:me.config.overrides??{},transparent_wrappers:me.config.transparent_wrappers??[]})}async function Vy(ce){let me=ce.positionals[1],ge=ce.positionals[2],he=C({global:ce.global}).configTarget;if(me==="list"){let Ge=p(he);if(Ge.errors.length>0){for(let Dt of Ge.errors)console.error(Dt);return 1}return zy(Ge.config?.transparent_wrappers??[]),0}if(!ge||!z.test(ge))return console.error("transparent wrapper must match command pattern"),1;if(Ie(ge))return console.error(`reserved command "${ge}" cannot be a wrapper`),1;let Se=p(he);if(Se.errors.length>0){for(let Ge of Se.errors)console.error(Ge);return 1}let Fe=Se.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},He=me==="add"?[...new Set([...Fe.transparent_wrappers??[],ge])]:(Fe.transparent_wrappers??[]).filter((Ge)=>Ge!==ge);return h(he,{version:1,rules:Fe.rules,overrides:Fe.overrides??{},transparent_wrappers:He}),console.log(me==="add"?`Added transparent wrapper: ${ge}`:`Removed transparent wrapper: ${ge}`),0}function zy(ce){if(ce.length===0){console.log("Transparent wrappers: (none)");return}console.log(`Transparent wrappers (${ce.length}):`);for(let me of ce)console.log(`  - ${me}`)}import{homedir as ss}from"node:os";import{sep as Qy}from"node:path";import{existsSync as Ky,readFileSync as Jy}from"node:fs";import{homedir as Wy}from"node:os";import{join as Yy}from"node:path";async function Zy(ce){if(ce.isTTY)return null;return(await Wo(ce).catch(()=>null))?.trim()||null}function Xy(){if(process.env.CLAUDE_SETTINGS_PATH)return process.env.CLAUDE_SETTINGS_PATH;return Yy(Wy(),".claude","settings.json")}function os(){let ce=Xy();if(!Ky(ce))return!1;try{let me=Jy(ce,"utf-8"),ge=JSON.parse(me);if(!ge.enabledPlugins)return!1;let he="cc-safety-net@cc-marketplace";if(!(he in ge.enabledPlugins))return!1;return ge.enabledPlugins[he]===!0}catch(me){if(P(r.debug))console.error(`CC Safety Net debug: failed to read Claude settings: ${ce}: ${me instanceof Error?me.message:String(me)}`);return!1}}async function is(ce=process.stdin){let me=os(),ge;if(!me)ge="\uD83D\uDEE1️ CC Safety Net ❌";else{let Se=x({cwd:process.cwd()}),Fe=Se.policy,He=E(Fe),Ge=Object.values(U(Fe,He.capabilities)).some((Tt)=>Tt.changesInherited),Dt={standard:"✅",strict:"\uD83D\uDD12",paranoid:"\uD83D\uDC41️",custom:"\uD83D\uDD27"}[Ge?"custom":He.effectiveLevel],At=(Se.policyScopes?.weakenings.length??0)>0?"\uD83D\uDD3B":"";ge=`\uD83D\uDEE1️ CC Safety Net ${Dt}${He.worktreeMode?"\uD83C\uDF33":""}${At}${Se.state==="degraded"?"⚠️":""}`}let he=await Zy(ce);if(he&&!he.startsWith("{"))console.log(`${he} | ${ge}`);else console.log(ge)}function nu(){let ce=x({cwd:process.cwd()}),me=ce.policy,ge=E(me),he=!!process.env.NO_COLOR||!process.stdout.isTTY,Se=Math.min(process.stdout.columns||80,100),Fe=he?"ok":"✔",He=he?"OFF":"✘",Ge=($t,Ot)=>{let Ut=`  ${$t.padEnd(13)}${Ot}`;return(Ut.length>Se?`${Ut.slice(0,Se-1)}…`:Ut).replaceAll(He,Ht.red(He))},Dt=Object.values(U(me,ge.capabilities)).some(($t)=>$t.changesInherited),At=($t)=>$t===ss()||$t.startsWith(`${ss()}${Qy}`)?`~${$t.slice(ss().length)}`:$t,Tt={ready:Ht.green,degraded:Ht.yellow}[ce.state],Ft=ce.policyScopes?.weakenings??[],jt=[...os()?[]:["plugin cc-safety-net@cc-marketplace is disabled in Claude Code; nothing is enforced in Claude Code until it is re-enabled. Other integrations are not affected."],...ce.diagnostics],It=he?"-":"·";console.log([`${he?"":"\uD83D\uDEE1️  "}CC Safety Net — ${Tt(ce.state)}`,"",Ge("Protection",`destructive ${me.destructiveCommandProtectionEnabled?Fe:He}   secrets ${me.secretProtection.enabled?Fe:He}`),Ge("Level",Dt?`${ge.effectiveLevel} (customised)`:ge.effectiveLevel),Ge("Rules",me.rules.length===0?"none active":`${me.rules.length} active`),Ge("Policy",At(y())),...ce.policyScopes?[Ge("Project",At(g()))]:[],...ge.worktreeMode?[Ge("Worktree","relaxations active")]:[],"",...Ft.length===0?[]:["  Project policy",...Ft.flatMap(($t)=>Rr($t,"      ",Se-6).map((Ot,Ut)=>Ut===0?`    ${Ot}`:Ot)),""],...jt.length===0?["  Everything configured is active."]:["  Not active",...jt.flatMap(($t)=>Rr($t,"      ",Se-6).map((Ot,Ut)=>Ut===0?`    ${It} ${Ot}`:Ot)),"","  Full report: cc-safety-net doctor"]].join(`
`))}import{spawn as fu}from"node:child_process";import{randomBytes as d0}from"node:crypto";import{existsSync as u0}from"node:fs";import{createServer as p0}from"node:http";import{Writable as f0}from"node:stream";import{homedir as e0}from"node:os";var Eo=500;function t0(ce){let me=ce.filter((Se)=>Se.decision!=="allow"),ge=ce.filter((Se)=>Se.decision==="allow"),he=Math.min(me.length,Math.max(Eo-ge.length,Math.ceil(Eo/2)));return[...me.slice(0,he),...ge.slice(0,Eo-he)]}function ru(ce,me=F()){if(me)q(me);let ge=(Ot)=>new Date(Ot.getFullYear(),Ot.getMonth(),Ot.getDate()).getTime(),he=ge(new Date),Se=new Date(he);Se.setDate(Se.getDate()-(ce-1));let Fe=Se.getTime(),He=[],Ge={count:0};for(let Ot of me?kn(me,Ge):[])for(let Ut of Dn(Ot,Ge)){if(!Ut||typeof Ut.ts!=="string"||typeof Ut.command!=="string")continue;let Gt=new Date(Ut.ts).getTime();if(!Number.isFinite(Gt))continue;if(Gt>=Fe)He.push(Ut)}He.sort((Ot,Ut)=>new Date(Ut.ts).getTime()-new Date(Ot.ts).getTime());let Dt=Array.from({length:ce},()=>0),At=Array.from({length:ce},()=>0),Tt={},Ft={},jt={},It=0,$t=0;for(let Ot of He){let Ut=Ot.agent||"unknown";Tt[Ut]=(Tt[Ut]??0)+1;let Gt=Math.round((he-ge(new Date(Ot.ts)))/86400000),Nt=ce-1-Gt,Vt=Gt>=0&&Gt<ce;if(Vt)At[Nt]=(At[Nt]??0)+1;if(Ot.decision!=="allow"){if(It++,Ot.ruleId)Ft[Ot.ruleId]=(Ft[Ot.ruleId]??0)+1;let Mt=Gn(Ot.segment||Ot.command);if(Mt)jt[Mt]=(jt[Mt]??0)+1;if(Ot.failureStage)$t++;if(Vt)Dt[Nt]=(Dt[Nt]??0)+1}}return{days:ce,logsDir:me,homeDir:e0(),totalInWindow:He.length,truncated:He.length>Eo,unreadable:Ge.count,counts:{blocked:It,allowed:He.length-It,agents:Tt,blockedByDay:Dt,analyzedByDay:At,rules:Ft,commands:jt,errors:$t},entries:t0(He).sort((Ot,Ut)=>new Date(Ut.ts).getTime()-new Date(Ot.ts).getTime())}}import{spawn as n0}from"node:child_process";import{existsSync as r0,statSync as ou}from"node:fs";import{delimiter as o0,join as i0}from"node:path";var s0=120000,_o="Choose the project folder",a0=`try
  return POSIX path of (choose folder with prompt "${_o}")
on error number -128
  return ""
end try`,l0=`Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${_o}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }`,iu=[{binary:"zenity",args:["--file-selection","--directory",`--title=${_o}`]},{binary:"kdialog",args:["--getexistingdirectory",".","--title",_o]}],su=(ce,me)=>(me.PATH??"").split(o0).some((ge)=>{if(ge.length===0)return!1;try{let he=ou(i0(ge,ce));return he.isFile()&&(he.mode&73)!==0}catch{return!1}});function as(ce,me){if(ce==="darwin"||ce==="win32")return!0;if(ce!=="linux")return!1;if(!me.DISPLAY&&!me.WAYLAND_DISPLAY)return!1;return iu.some((ge)=>su(ge.binary,me))}function c0(ce,me){if(ce==="darwin")return{cmd:"osascript",args:["-e",a0]};if(ce==="win32")return{cmd:"powershell.exe",args:["-NoProfile","-STA","-Command",l0]};let ge=iu.find((he)=>su(he.binary,me));return ge?{cmd:ge.binary,args:ge.args}:null}function ls(ce=process.platform,me=process.env){let ge=c0(ce,me);if(!ge)return Promise.resolve({error:"No folder dialog is available on this system"});return new Promise((he)=>{let Se=n0(ge.cmd,ge.args,{env:me,stdio:["ignore","pipe","pipe"]}),Fe="",He=!1,Ge=(At)=>{if(He)return;He=!0,clearTimeout(Dt),he(At)},Dt=setTimeout(()=>{Se.kill(),Ge({error:"The folder dialog timed out"})},s0);Se.stdout.on("data",(At)=>{Fe+=At.toString()}),Se.on("error",()=>Ge({error:`Could not open the folder dialog (${ge.cmd})`})),Se.on("close",()=>{let At=Fe.trim().replace(/\/+$/,"");if(!At)return Ge({cancelled:!0});if(!r0(At)||!ou(At).isDirectory())return Ge({error:"That selection is not a folder on disk"});Ge({path:At})})})}var au=`<!doctype html>
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
// src/engine/audit-display.ts
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
// src/integrations/catalog.ts
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

// src/ir/safety-level.ts
var SAFETY_LEVEL_CAPABILITIES = {
  standard: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
  strict: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: false },
  paranoid: { fail_closed: true, paranoid_rm: true, paranoid_interpreters: true }
};

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
`;var lu='<script id="ccsn-data" type="application/json">';function cu(ce){return au.replace(lu,()=>lu+JSON.stringify({token:ce}).replaceAll("<","\\u003c"))}var To="kenryu42/cc-safety-net",m0=`https://github.com/${To}`,ds=1e4,g0=7,h0="The project draft directory changed; reload the draft before applying.",y0="audit settings are user scope only; remove the audit section from a project proposal";async function mu(ce,me={}){let ge=Wt({label:"gui",booleans:{noOpen:["--no-open"]}},ce),he=me.log??console.log,Se=me.error??console.error;if(ge.errors.length>0){for(let He of ge.errors)Se(He);return Se("Usage: cc-safety-net gui [--no-open]"),1}let Fe=await v0(me);if(he(`CC Safety Net policy GUI: ${Fe.url}`),!ge.flags.noOpen)try{await(me.openBrowser??A0)(Fe.url)}catch(He){Se(`Failed to open browser: ${He instanceof Error?He.message:String(He)}`),Se(`Open this URL manually: ${Fe.url}`)}if(me.keepAlive===!1)return await Fe.close(),0;return await D0(Fe),0}async function v0(ce={}){let me=d0(24).toString("base64url"),ge={dir:null,revision:0},he=p0((He,Ge)=>{b0(He,Ge,me,ce,ge)});await new Promise((He,Ge)=>{he.once("error",Ge),he.listen(0,"127.0.0.1",()=>{he.off("error",Ge),He()})});let Fe=`http://127.0.0.1:${he.address().port}`;return{origin:Fe,token:me,url:`${Fe}/?token=${encodeURIComponent(me)}`,close:()=>P0(he)}}async function b0(ce,me,ge,he,Se){let Fe=new URL(ce.url??"/","http://127.0.0.1");if(ce.method==="GET"&&Fe.pathname==="/favicon.ico"){me.writeHead(204,{"cache-control":"no-store"}),me.end();return}if(!C0(ce,Fe,ge)){qt(me,403,{error:"Forbidden"});return}if(ce.method==="GET"&&Fe.pathname==="/"){R0(me,cu(ge));return}if(ce.method==="GET"&&Fe.pathname==="/api/policy"){let He=Et(he),Ge=x(he);qt(me,200,{...He,configState:$e(Ge),...Ge.policyScopes?{projectPolicy:{path:g(he.cwd),weakenings:Ge.policyScopes.weakenings}}:{},destructiveCommandRules:J,secretPatterns:Ze,version:Xt(),preview:He.errors.length>0?null:ht(He.policy)});return}if(ce.method==="POST"&&Fe.pathname==="/api/policy/preview"){let He=await Tr(ce);if(!He.ok){qt(me,He.status,{errors:[He.error]});return}let Ge=Pt(He.value);qt(me,Ge.errors.length>0?400:200,Ge);return}if(ce.method==="POST"&&Fe.pathname==="/api/policy/explain"){let He=await Tr(ce);if(!He.ok){qt(me,He.status,{errors:[He.error]});return}let Ge=He.value;if(Ge===null||typeof Ge.command!=="string"){qt(me,400,{errors:["command must be a string"]});return}let Dt=_(Ge.policy);if(Dt.length>0){qt(me,400,{errors:Dt});return}qt(me,200,k0(Ge.command,Ge.policy,he));return}if(ce.method==="POST"&&Fe.pathname==="/api/policy"){let He=await Tr(ce);if(!He.ok){qt(me,He.status,{errors:[He.error]});return}let Ge=Q(He.value,he);qt(me,Ge.errors.length>0?400:200,Ge);return}if(ce.method==="POST"&&Fe.pathname==="/api/reset"){qt(me,200,Q(ve,he));return}if(ce.method==="POST"&&Fe.pathname==="/api/repair"){qt(me,200,_t(he));return}if(ce.method==="POST"&&Fe.pathname==="/api/policy/project/choose-directory"){let He=await(he.chooseDirectory??ls)();if("path"in He)Se.dir=He.path,Se.revision+=1;qt(me,200,{cancelled:"cancelled"in He,..."error"in He?{error:He.error}:{}});return}if(ce.method==="GET"&&Fe.pathname==="/api/policy/project"){let He=gu(Se,he),Ge=du(He),Dt=Vn(he);qt(me,200,{dir:He,path:g(He),revision:Se.revision,baseline:Dt.baseline,userPolicyDiagnostics:Dt.diagnostics,projection:Ge.projection,projectionDiagnostics:Ge.diagnostics,canPickDirectory:as(process.platform,process.env)});return}if(ce.method==="POST"&&Fe.pathname==="/api/policy/project/diff"){let He=await uu(ce,me,Se,he);if(!He)return;let Ge=du(He.dir),Dt=Vn(he).baseline,At=X(Dt,le(He.proposal).policy);qt(me,200,{rows:dr(X(Dt,Ge.projection).policy,At.policy,!1),weakenings:At.weakenings,existingFileDiagnostics:Ge.diagnostics,errors:[]});return}if(ce.method==="POST"&&Fe.pathname==="/api/policy/project/apply"){let He=await uu(ce,me,Se,he);if(!He)return;let Ge=w0(He.dir,He.proposal);qt(me,Ge.errors.length>0?500:200,Ge);return}if(ce.method==="GET"&&Fe.pathname==="/api/activity"){let He=de(he),Ge=x0(Fe.searchParams.get("days"),He);if(Ge===null){qt(me,400,{error:`days must be an integer between 1 and ${He}`});return}qt(me,200,ru(Ge,he.activityLogsDir));return}if(ce.method==="POST"&&Fe.pathname==="/api/rules/choose-directory"){qt(me,200,await ls());return}if(ce.method==="GET"&&Fe.pathname==="/api/rules"){let He=V(he),Ge=new Map(He.rules.map((Dt)=>[Dt.name,Dt]));qt(me,200,{projectPath:he.cwd??process.cwd(),canPickDirectory:as(process.platform,process.env),rulebooks:He.rulebooks.map((Dt)=>({source:Dt.source,spec:Dt.spec,name:Dt.name,version:Dt.version,rules:Dt.rules.flatMap((At)=>{let Tt=Ge.get(At);if(!Tt)return[];return[{name:Tt.name,command:Tt.command,subcommand:Tt.subcommand,block_args:Tt.block_args,reason:Tt.reason}]})})),errors:He.errors,warnings:He.warnings});return}if(ce.method==="GET"&&Fe.pathname==="/api/star/context"){qt(me,200,await(he.fetchStarContext??(()=>$0({logsDir:he.activityLogsDir})))());return}if(ce.method==="POST"&&Fe.pathname==="/api/star"){let He=await(he.starRepo??E0)();qt(me,200,He.ok?{ok:!0}:{ok:!1,fallbackUrl:m0});return}if(ce.method==="GET"&&Fe.pathname==="/api/integrations"){qt(me,200,await(he.fetchIntegrations??_0)());return}if(ce.method==="GET"&&Fe.pathname==="/api/health"){qt(me,200,await(he.fetchHealth??T0)());return}if(ce.method==="POST"&&(Fe.pathname==="/api/install"||Fe.pathname==="/api/uninstall")){let He=await Tr(ce);if(!He.ok){qt(me,He.status,{errors:[He.error]});return}let Ge=He.value?.target;if(typeof Ge!=="string"||!yn.some((At)=>At.target===Ge)){qt(me,400,{error:"unknown target"});return}let Dt=Fe.pathname==="/api/install"?"install":"uninstall";qt(me,200,await(he.runIntegration??I0)(Dt,Ge));return}qt(me,404,{error:"Not found"})}function gu(ce,me){return ce.dir??me.cwd??process.cwd()}function du(ce){let me=g(ce),ge=u0(me)?xn(me):{value:void 0,errors:[]},he=le(ge.value);return{projection:he.policy,diagnostics:[...ge.errors,...he.diagnostics]}}async function uu(ce,me,ge,he){let Se=gu(ge,he),Fe=ge.revision,He=await Tr(ce);if(!He.ok)return qt(me,He.status,{errors:[He.error]}),null;let Ge=He.value;if(typeof Ge?.revision!=="number")return qt(me,400,{errors:["revision must be a number"]}),null;if(Ge.revision!==Fe)return qt(me,409,{errors:[h0]}),null;let Dt=L0(Ge.proposal);if(Dt.length>0)return qt(me,400,{errors:Dt}),null;return{dir:Se,proposal:Ge.proposal}}function L0(ce){let me=_(ce);if(me.length>0)return me;return ce?.audit===void 0?[]:[y0]}function w0(ce,me){let ge=g(ce),he=ur(me,f(me));try{return v(o(k(ce,"project policy"),ge),`${JSON.stringify(he,null,2)}
`),{path:ge,errors:[]}}catch(Se){return{path:ge,errors:[Se instanceof Error?Se.message:String(Se)]}}}function k0(ce,me,ge){let he=f(me),Se=x(ge),Fe=Ee({rules:Se.policy.rules,transparentWrappers:Se.policy.transparentWrappers,safety:Qe(he.safety),worktreeMode:he.workflow.worktree_mode,destructiveCommandProtectionEnabled:he.destructive_command_protection.enabled,destructiveCommandRuleOverrides:he.destructive_command_protection.overrides,destructiveCommandAllowPaths:he.destructive_command_protection.allow_paths,secretProtection:{enabled:he.secret_protection.enabled,disabledRules:Xe(he.secret_protection.overrides),denyPaths:he.secret_protection.deny_paths,allowPaths:he.secret_protection.allow_paths}});return qn(ce,{policySnapshot:Fe,cwd:ge.cwd,userConfigDir:ge.userConfigDir})}function x0(ce,me){if(ce===null)return Math.min(g0,me);let ge=Number(ce);if(!Number.isInteger(ge)||ge<1||ge>me)return null;return ge}function C0(ce,me,ge){if(me.searchParams.get("token")!==ge)return!1;if(ce.method!=="POST")return!0;return ce.headers["x-cc-safety-net-token"]===ge}var S0=1048576;async function Tr(ce){let me=[],ge=0;for await(let he of ce){let Se=he;if(ge+=Se.byteLength,ge>S0)return{ok:!1,status:413,error:"Request body is too large"};me.push(Se)}try{return{ok:!0,value:JSON.parse(Buffer.concat(me).toString("utf-8")||"{}")}}catch(he){return{ok:!1,status:400,error:`Invalid JSON: ${he instanceof Error?he.message:String(he)}`}}}function R0(ce,me){ce.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}),ce.end(me)}function qt(ce,me,ge){ce.writeHead(me,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),ce.end(JSON.stringify(ge))}function P0(ce){return new Promise((me,ge)=>{ce.close((he)=>he?ge(he):me())})}function D0(ce){return new Promise((me)=>{let ge=()=>{process.off("SIGINT",he),process.off("SIGTERM",he)},he=()=>{ge(),ce.close().then(me)};process.once("SIGINT",he),process.once("SIGTERM",he)})}function A0(ce){let me=process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open",ge=process.platform==="win32"?["/c","start","",ce]:[ce];return new Promise((he,Se)=>{let Fe=fu(me,ge,{detached:!0,stdio:"ignore"}),He=(Dt)=>{Fe.off("spawn",Ge),Se(Dt)},Ge=()=>{Fe.off("error",He),Fe.unref(),he()};Fe.once("error",He),Fe.once("spawn",Ge)})}async function E0(ce="gh",me=ds){return{ok:await cs(ce,["api","-X","PUT",`/user/starred/${To}`],me)===0}}async function _0(ce={}){let me=await mr(ce.fetcher),ge=hu(me,ce.homeDir);return{targets:an.map((he)=>{let Se=ge.find((Fe)=>Fe.platform===he.id);return{target:he.id,label:Kt(he.id),version:me.versions[he.id]??null,status:Se?.configured?"active":Se?.detected?"disabled":Se?.inspectionStatus==="not-inspected"?"not-inspected":"not-installed"}}),system:{version:me.version,nodeVersion:me.nodeVersion,platform:me.platform}}}function hu(ce,me){return er(process.cwd(),{homeDir:me,ampPluginListOutput:ce.ampPluginListOutput,codexPluginListOutput:ce.codexPluginListOutput,copilotCliVersion:ce.versions["copilot-cli"]})}async function T0(ce={}){let[me,ge]=await Promise.all([mr(ce.fetcher),(ce.checkUpdates??Cn)()]);return{hooks:hu(me,ce.homeDir).filter((he)=>he.detected).map((he)=>({platform:he.platform,label:Kt(he.platform),configured:he.configured})),update:{currentVersion:ge.currentVersion,latestVersion:ge.latestVersion??null,updateAvailable:ge.updateAvailable}}}var pu=Promise.resolve();function I0(ce,me,ge={}){let he=async()=>{let Fe=[],{log:He,error:Ge}=console;console.log=(...Dt)=>Fe.push(Dt.map(String).join(" ")),console.error=console.log;try{return{ok:await _r(ce,[],{selectTargets:async()=>[me],output:new f0({write(At,Tt,Ft){Fe.push(String(At).replace(/\n$/,"")),Ft()}}),...ge})===0,output:Fe.join(`
`)}}finally{console.log=He,console.error=Ge}},Se=pu.then(he);return pu=Se.then(()=>{return},()=>{return}),Se}async function $0(ce={}){let[me,ge,he]=await Promise.all([O0(ce.command),F0(ce.fetchRepo),Promise.resolve(qr(de(),ce.logsDir).totalBlocked)]);return{starred:me,starCount:ge,blockedTotal:he}}async function O0(ce="gh",me=ds){if(await cs(ce,["auth","status"],me)!==0)return null;let ge=await cs(ce,["api",`/user/starred/${To}`],me);if(ge===0)return!0;if(ge===null)return null;return!1}function cs(ce,me,ge){return new Promise((he)=>{let Se=fu(ce,me,{stdio:"ignore",windowsHide:!0}),Fe=!1,He,Ge=(Dt)=>{if(Fe)return;if(Fe=!0,He)clearTimeout(He);he(Dt)};Se.once("error",()=>Ge(null)),Se.once("close",Ge),He=setTimeout(()=>{Se.kill(),Ge(null)},ge)})}async function F0(ce=fetch){try{let me=await ce(`https://api.github.com/repos/${To}`,{headers:{accept:"application/vnd.github+json"},signal:AbortSignal.timeout(ds)});if(!me.ok)return null;let ge=await me.json();return typeof ge.stargazers_count==="number"?ge.stargazers_count:null}catch{return null}}function j0(ce){if(ce[0]!=="help")return!1;let me=ce[1];if(!me)Gi(),process.exit(0);if(Pr(me))process.exit(0);console.error(`Unknown command: ${me}`),console.error("Run 'cc-safety-net --help' for available commands."),process.exit(1)}var N0={hook:async(ce)=>{let me=ca(ce);if(me){await me.run();return}console.error("hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code"),Pr("hook",console.error),process.exit(1)},install:async(ce)=>{process.exit(await _r("install",ce))},update:async(ce)=>{process.exit(await ns(ce))},uninstall:async(ce)=>{process.exit(await _r("uninstall",ce))},rule:async(ce)=>{process.exit(await eu(ce))},policy:async(ce)=>{process.exit(await jd(ce))},status:async(ce)=>{if(vn(Wt({label:"status"},ce).errors))process.exit(1);nu()},statusline:async(ce)=>{let me=Wt({label:"statusline",booleans:{claudeCode:["-cc","--claude-code"]}},ce);if(me.errors.length===0&&me.flags.claudeCode){await is();return}if(vn(me.errors),!me.flags.claudeCode)console.error("statusline requires --claude-code (-cc)");Pr("statusline",console.error),process.exit(1)},doctor:async(ce)=>{let me=ji(ce);if(!me)process.exit(1);let ge=await Rc({json:me.json,skipUpdateCheck:me.skipUpdateCheck});process.exit(ge)},logs:async(ce)=>{process.exit(await Hs(ce))},gui:async(ce)=>{process.exit(await mu(ce))},explain:async(ce)=>{process.exit(await Ic(ce))}};async function H0(){let ce=process.argv.slice(2),me=Wt({label:"cc-safety-net",booleans:{version:["-V","--version"]},positionals:"list"},ce);if(j0(ce))return;let ge=ce[0],he=ge?Br(ge):void 0;if(me.help&&he&&he.name!=="rule")Pr(he.name),process.exit(0);if(!ge||me.help&&!he)Gi(),process.exit(0);if(me.flags.version)Fc(),process.exit(0);if(he){await N0[he.name](ce.slice(1));return}let Se=da(ge);if(Se){await Se.run();return}if(ge==="--statusline"){await is();return}console.error(ge.startsWith("-")?`Unknown option: ${ge}`:`Unknown command: ${ge}`),console.error("Run 'cc-safety-net --help' for usage."),process.exit(1)}H0().catch((ce)=>{console.error("CC Safety Net error:",ce),process.exit(1)});
