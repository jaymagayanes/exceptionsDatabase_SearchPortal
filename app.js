  const TABLE = "cr557_satportalv4s";
  const COLS = [
    "cr557_uniqueid","cr557_sourcesheet","cr557_country","cr557_countrymemo",
    "cr557_region","cr557_customertype","cr557_programme","cr557_process",
    "cr557_exceptiontype","cr557_exception","cr557_source","cr557_date",
    "cr557_note","cr557_supportingdocs","cr557_excelrow","cr557_name"
  ].join(",");
  const SIDEBAR_PAGE = 20;

  let masterData = [], currentResults = [], currentIndex = 0;
  let dataLoaded = false, searchTimer = null, sidebarPage = 0;

  const SHEET_DOT_CLASS = {
    "eois":"dot-eois","eoi":"dot-eois",
    "postapprovalexceptions":"dot-postapproval","postapproval":"dot-postapproval",
    "governmentpermissions":"dot-governmentperms","governmentpermission":"dot-governmentperms",
    "registrationexceptions":"dot-registration","registrationexception":"dot-registration",
    "annualinvoicingexceptions":"dot-annualinvoicing","annualinvoicingexception":"dot-annualinvoicing",
    "retiredexceptions":"dot-retired","retiredexception":"dot-retired"
  };
  function sheetDotClass(r) { const k=(r||"").toLowerCase().replace(/[\s-]/g,""); return SHEET_DOT_CLASS[k]||"dot-retired"; }

  const JARGON_MAP = {
    "ey":"early years","eyp":"early years","early yrs":"early years","kinder":"early years","kindergarten":"early years","nursery":"early years","preschool":"early years","pre-school":"early years","foundation":"early years","fs1":"early years","fs2":"early years",
    "pri":"primary","elementary":"primary","grade school":"primary",
    "lower sec":"lower secondary","checkpoint":"lower secondary","middle school":"lower secondary","junior high":"lower secondary","pre-ig":"lower secondary",
    "upper sec":"upper secondary","igcse":"upper secondary","o level":"upper secondary","olevel":"upper secondary","o-level":"upper secondary",
    "a level":"advanced","a-level":"advanced","as level":"advanced","sixth form":"advanced","alevel":"advanced",
    "gqs":"gq","pdq":"gq","cambridge pathway":"gq","sec & adv":"gq"
  };
  const JARGON_KEYS = Object.keys(JARGON_MAP).sort((a,b)=>b.length-a.length);
  function applyJargon(str) {
    if (!str) return "";
    let r = str.toLowerCase();
    JARGON_KEYS.forEach(t => {
      const s = t.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&");
      r = r.replace(new RegExp("\\b"+s+"\\b","g"), JARGON_MAP[t]);
    });
    return r;
  }

  const PROG_FILTER = {
    "early years":["early years"],"primary":["primary"],
    "lower secondary":["lower secondary","secondary"],
    "upper secondary":["upper secondary","secondary & advanced","secondary"],
    "advanced":["advanced","secondary & advanced"],
    "gq":["gq","upper secondary","secondary & advanced","advanced"]
  };

  const SHEET_LABEL_MAP = {
    "eois":"EOIs","eoi":"EOIs",
    "postapprovalexceptions":"Post Approval","post-approvalexceptions":"Post Approval","postapproval":"Post Approval",
    "governmentpermissions":"Gov Permissions","governmentpermission":"Gov Permissions",
    "registrationexceptions":"Registration","registrationexception":"Registration",
    "annualinvoicingexceptions":"Annual Invoicing","annualinvoicingexception":"Annual Invoicing",
    "retiredexceptions":"Retired","retiredexception":"Retired"
  };
  function sheetLabel(r) { const k=(r||"").toLowerCase().replace(/[\s-]/g,""); return SHEET_LABEL_MAP[k]||r||"Unknown"; }

  const SHEET_CHIP_ALIASES = {
    "eois":["eois","eoi"],
    "postapprovalexceptions":["postapprovalexceptions","postapproval","post-approvalexceptions","postapprovalexception"],
    "governmentpermissions":["governmentpermissions","governmentpermission"],
    "registrationexceptions":["registrationexceptions","registrationexception"],
    "annualinvoicingexceptions":["annualinvoicingexceptions","annualinvoicingexception"],
    "retiredexceptions":["retiredexceptions","retiredexception"]
  };
  function getActiveSheets() {
    return Array.from(document.querySelectorAll("#sheetDropdownPanel input[value]:checked"))
      .map(b=>b.value).flatMap(v=>SHEET_CHIP_ALIASES[v]||[v]);
  }


  /* Programme Dropdown */
  function toggleProgDropdown(e) {
    e.stopPropagation();
    const p=document.getElementById("progDropdownPanel"), a=document.getElementById("progDropdownArrow");
    const o=p.classList.toggle("open");
    a.style.transform = o?"rotate(180deg)":"";
  }
  document.addEventListener("click", function(e) {
    const dd=document.getElementById("progDropdown");
    if (dd&&!dd.contains(e.target)) {
      document.getElementById("progDropdownPanel").classList.remove("open");
      document.getElementById("progDropdownArrow").style.transform="";
    }
  });
  function onProgChange() {
    const selected=document.querySelector('input[name="programme"]:checked').value;
    const label=document.getElementById("progDropdownLabel");
    if (selected==="") label.textContent="All Programmes";
    else label.textContent=selected.charAt(0).toUpperCase()+selected.slice(1);
    document.getElementById("progDropdownPanel").classList.remove("open");
    document.getElementById("progDropdownArrow").style.transform="";
    runSearch();
  }

  function getSelectedProgramme() {
    return document.querySelector('input[name="programme"]:checked').value;
  }

  /* Sheet dropdown */
  function toggleSheetDropdown(e) {
    e.stopPropagation();
    const p=document.getElementById("sheetDropdownPanel"), a=document.getElementById("sheetDropdownArrow");
    const o=p.classList.toggle("open");
    a.style.transform = o?"rotate(180deg)":"";
  }
  document.addEventListener("click", function(e) {
    const dd=document.getElementById("sheetDropdown");
    if (dd&&!dd.contains(e.target)) {
      document.getElementById("sheetDropdownPanel").classList.remove("open");
      document.getElementById("sheetDropdownArrow").style.transform="";
    }
  });
  function toggleAllSheets(cb) {
    document.querySelectorAll("#sheetDropdownPanel input[value]").forEach(b=>b.checked=cb.checked);
    updateSheetLabel(); runSearch();
  }
  function onSheetChange() {
    const boxes=Array.from(document.querySelectorAll("#sheetDropdownPanel input[value]"));
    const allOn=boxes.every(b=>b.checked), allOff=boxes.every(b=>!b.checked);
    const mc=document.getElementById("sheetCheckAll");
    mc.checked=allOn; mc.indeterminate=!allOn&&!allOff;
    updateSheetLabel(); runSearch();
  }
  function updateSheetLabel() {
    const boxes=Array.from(document.querySelectorAll("#sheetDropdownPanel input[value]"));
    const checked=boxes.filter(b=>b.checked);
    const label=document.getElementById("sheetDropdownLabel");
    if (!checked.length) label.textContent="No Sheets";
    else if (checked.length===boxes.length) label.textContent="All Sheets";
    else if (checked.length===1) label.textContent=checked[0].closest(".sheet-option").querySelector(".sheet-option-label").textContent;
    else label.textContent=checked.length+" Sheets";
  }

  /* Utilities */
  function isEmpty(v) { if(v===null||v===undefined)return true; return String(v).trim()===""||/^[-—–]+$/.test(String(v).trim()); }
  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"'"); }
  function beautifyText(raw) {
    if (!raw) return "";
    const lines=String(raw).replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim().split("\n").map(l=>l.trim()).filter(l=>l.length>0&&!/^[-—–\s]+$/.test(l));
    if (!lines.length) return "";
    const cls=lines.length>=10?"pretty-text multi-col":"pretty-text";
    return '<div class="'+cls+'">'+lines.map(l=>"<p>"+esc(l)+"</p>").join("")+"</div>";
  }
  function isLongCountry(s) {
    if(!s) return false;
    const t=s.trim();
    return t.length>60||t.split(/\s+/).length>5||t.includes(",")||t.includes(". ")||/\(cc\s/i.test(t)||t.includes("\n");
  }

  /* Data mapping */
  function mapRecord(d) {
    const rawSheet=(d.cr557_sourcesheet||"").toLowerCase().replace(/\s+/g,"");
    const rec={
      _id: d.cr557_satportalv4id||d.cr557_uniqueid||d.cr557_name||String(Math.random()),
      unique_id: d.cr557_uniqueid||"",
      excel_row: d.cr557_excelrow||"",
      source_sheet: rawSheet,
      sheet_label: d.cr557_sourcesheet||"",
      country: d.cr557_countrymemo||d.cr557_country||"",
      region: d.cr557_region||"",
      customer_type: d.cr557_customertype||"",
      programme: d.cr557_programme||"",
      process: d.cr557_process||"",
      exception_type: d.cr557_exceptiontype||"",
      exception: d.cr557_exception||"",
      source: d.cr557_source||"",
      date: d.cr557_date||"",
      note: d.cr557_note||"",
      supporting_docs: d.cr557_supportingdocs||""
    };
    rec._searchText=applyJargon(Object.entries(rec).filter(([k])=>!k.startsWith("_")).map(([,v])=>String(v||"")).join(" "));
    return rec;
  }

  /* Fetch */
  async function loadData() {
    try {
      const res=await fetch("/_api/"+TABLE+"?$select="+COLS+"&$top=5000");
      if (res.status===401){location.reload();return;}
      if (!res.ok) throw new Error("HTTP "+res.status);
      const json=await res.json();
      masterData=(json.value||[]).map(mapRecord);
      dataLoaded=true;
    } catch(err) {
      console.error("SAP loadData error:",err);
      if (!dataLoaded) seedDemoData();
    }
  }

  /* Demo data */
  function seedDemoData() {
    const demoCountryMonster =
      "Anhui - Kelvin Shi, Jamie Jin, Jing Zhao\nBeijing - Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Chongqing - Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\nFujian - Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Guangdong – Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\nGuangxi – Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Guizhou – Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\nHainan – Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Hebei - Kiki Liang, Jamie Jin, Jing Zhao\nHeilongjiang - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Henan - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nHong Kong - Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Hubei - Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\nHunan - Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Inner Mongolia - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nJiangsu - Kelvin Shi cc Jamie Jin, Jing Zhao\n"+
      "Jiangxi - Isabella Mao, Kelvin Shi, Jamie Jin, Jing Zhao\nJilin - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Liaoning - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nMacau - Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Mongolia - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nNingxia - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Qinghai - Kiki Liang, Jamie Jin, Jing Zhao\nShaanxi - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Shandong - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nShanghai - Isabella Mao, Kelvin Shi, Jamie Jin, Jing Zhao\n"+
      "Shanxi - Stella Wang, Kiki Liang, Jamie Jin, Jing Zhao\nSichuan - Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\n"+
      "South Korea - Kiki Liang, Jamie Jin, Jing Zhao\nTaiwan - Tony Cai, Jamie Jin & Jing Zhao\n"+
      "Tianjin - Kiki Liang, Jamie Jin, Jing Zhao\nXinjiang - Kiki Liang, Jamie Jin, Jing Zhao\n"+
      "Yunnan - Ivan Huang, Tony Cai, Jamie Jin & Jing Zhao\nZhejiang - Kelvin Shi, Jamie Jin, Jing Zhao";

    masterData = [
      {_id:"demo-1",unique_id:"EOI-CN-001",excel_row:"12",source_sheet:"eois",sheet_label:"EOIs",country:"China - Lead - CC Jing Zhao on all referrals.",region:"East Asia",customer_type:"Private",programme:"Primary",process:"EOI Processing",exception_type:"Lead Assignment",exception:demoCountryMonster,source:"Amber spreadsheet",date:"14/12/2026",note:"China centre no's are exhausted. Moved on to CX no's.",supporting_docs:"Associate Responsibilities:\n\nKelvin Shi : CN390 Riyue Guanghua, CN900 JEAIE\nSophia Feng : CN256 Dipont\nKiki Liang: CN210 EduChina, CN590 Fazheng International Education, CN490 BFSU\nTony Cai - CN290 Bright Scholar Education Group, HK700 HKEAA",_searchText:"china eoi lead"},
      {_id:"demo-2",unique_id:"REG-HK-002",excel_row:"23",source_sheet:"registrationexceptions",sheet_label:"Registration",country:"Hong Kong",region:"East Asia",customer_type:"State",programme:"Upper Secondary",process:"Registration",exception_type:"Fees",exception:"1. For State Schools in China registering after 10 May 2022 the Second Registration Fee is waived.\n2. Standard fee schedule applies for private institutions.\n3. Late registration subject to additional processing fee.",source:"Policy Document v3",date:"01/06/2026",note:"See China for primary policy reference.",supporting_docs:"",_searchText:"hong kong registration fees state schools"},
      {_id:"demo-3",unique_id:"REG-CN-003",excel_row:"45",source_sheet:"registrationexceptions",sheet_label:"Registration",country:"China",region:"East Asia",customer_type:"General",programme:"Advanced",process:"Approval",exception_type:"Reg General",exception:"CN centre no's exhausted. Moved on to CX no's.",source:"Internal Ops",date:"05/03/2026",note:"",supporting_docs:"Email chain with regional team confirming CX number block allocation.\nApproved by: J. Zhou, 03/03/2026",_searchText:"china registration cx numbers"},
      {_id:"demo-4",unique_id:"REG-CN-004",excel_row:"67",source_sheet:"registrationexceptions",sheet_label:"Registration",country:"China",region:"East Asia",customer_type:"State",programme:"Lower Secondary",process:"RD Approval",exception_type:"RD Approval",exception:"Jamie Jin to provide RD approval on behalf of Jing Zhao.",source:"Internal memo",date:"12/11/2025",note:"Delegation confirmed via email chain. Valid until end of Q1 2027.",supporting_docs:"",_searchText:"china rd approval jamie jin jing zhao"},
      {_id:"demo-5",unique_id:"PAE-JP-005",excel_row:"89",source_sheet:"postapprovalexceptions",sheet_label:"Post Approval",country:"Japan",region:"East Asia",customer_type:"Private",programme:"Primary",process:"Post Approval",exception_type:"Academic",exception:"Japan referrals handled via Ayako Towatari.\nAll enquiries routed through CN-Japan desk first.",source:"Amber spreadsheet",date:"20/08/2025",note:"See China for lead CC.",supporting_docs:"",_searchText:"japan post approval ayako"},
      {_id:"demo-6",unique_id:"GOV-KR-006",excel_row:"101",source_sheet:"governmentpermissions",sheet_label:"Gov Permissions",country:"Korea, Republic of (South Korea)",region:"East Asia",customer_type:"State",programme:"Upper Secondary",process:"Government Permission",exception_type:"MOE Approval",exception:"MOE approval required prior to formal registration. Timeframe: 8-12 weeks.\nSubmission window: March and September annually.",source:"KR-MOE 2024 Circular",date:"01/01/2024",note:"See China desk for East Asia regional lead.",supporting_docs:"MOE Circular ref: KR-2024-003\nContact: gov.liaison@cambridge.org",_searchText:"korea south government permission moe"},
    ];
    dataLoaded = true;
    runSearch();
  }

  loadData();

  /* Search */
  function debounceSearch() { clearTimeout(searchTimer); searchTimer=setTimeout(runSearch,220); }
  function runSearch() {
    if (!dataLoaded||!masterData.length) return;
    const rawQ=document.getElementById("appSearch").value.trim();
    const normQ=applyJargon(rawQ.toLowerCase());
    const kws=normQ.split(/\s+/).filter(Boolean);
    const sheets=getActiveSheets();
    const progV=getSelectedProgramme();
    if (!sheets.length) { currentResults=[]; renderNoResults("No sheet filters selected."); return; }
    currentResults=masterData.filter(row=>{
      if(!row) return false;
      const rs=row.source_sheet;
      if(!sheets.some(s=>rs.includes(s)||s.includes(rs))) return false;
      if(progV){const np=applyJargon((row.programme||"").toLowerCase()),aliases=PROG_FILTER[progV]||[progV];if(!aliases.some(a=>np.includes(a)))return false;}
      if(!kws.length) return true;
      return kws.every(kw=>row._searchText.includes(kw));
    });
    currentIndex=0; sidebarPage=0; renderDisplay();
  }

  function renderDisplay() { if(!currentResults.length){renderNoResults("No results found. Try a different keyword or adjust filters.");return;} renderSidebar(); renderStage(); }
  function renderNoResults(msg) {
    document.getElementById("matchCount").textContent="0 results";
    document.getElementById("sidebarList").innerHTML="<p class='hint'>"+esc(msg)+"</p>";
    document.getElementById("sidebarNav").innerHTML="";
    document.getElementById("resultArea").innerHTML="<div class='empty-state'><div class='empty-icon'>◎</div><p>"+esc(msg)+"</p></div>";
  }

  function renderSidebar() {
    const total=currentResults.length, totalPages=Math.ceil(total/SIDEBAR_PAGE), start=sidebarPage*SIDEBAR_PAGE;
    document.getElementById("matchCount").textContent=total+" result"+(total!==1?"s":"");
    const pills=currentResults.slice(start,Math.min(start+SIDEBAR_PAGE,total)).map((item,i)=>{
      const gIdx=start+i, active=gIdx===currentIndex;
      const raw=item.exception||item.note||"", teaser=raw.length>70?raw.substring(0,70).trim()+"…":(raw||"—");
      const dotCls=sheetDotClass(item.source_sheet);
      const hints=[item.region,item.customer_type,item.exception_type].filter(v=>!isEmpty(v)).map(v=>"<span class='pill-badge'>"+esc(v)+"</span>").join("");
      const countryDisplay=item.country.length>40?item.country.substring(0,40)+"…":(item.country||"General");
      return "<div class='pill"+(active?" active":"")+"' data-gidx='"+gIdx+"'>"
        +"<div class='pill-sheet'><span class='pill-sheet-dot "+dotCls+"'></span>"+esc(sheetLabel(item.source_sheet))+"</div>"
        +"<div class='pill-country'>"+esc(countryDisplay)+"</div>"
        +(hints?"<div class='pill-badges'>"+hints+"</div>":"")
        +"<div class='pill-teaser'>"+esc(teaser)+"</div>"
        +"</div>";
    }).join("");
    document.getElementById("sidebarList").innerHTML=pills;
    document.getElementById("sidebarList").onclick=function(e){const p=e.target.closest(".pill[data-gidx]");if(p)jumpTo(parseInt(p.dataset.gidx,10));};
    const nav=document.getElementById("sidebarNav");
    if(totalPages<=1){nav.innerHTML="";}
    else{
      nav.innerHTML="<button class='mini-btn' id='navPrev'"+(sidebarPage===0?" disabled":"")+">‹</button>"
        +"<span class='sidebar-page-label'>"+(sidebarPage+1)+"/"+totalPages+"</span>"
        +"<button class='mini-btn' id='navNext'"+(sidebarPage>=totalPages-1?" disabled":"")+">›</button>";
      document.getElementById("navPrev").onclick=()=>moveSidebarPage(-1);
      document.getElementById("navNext").onclick=()=>moveSidebarPage(1);
    }
  }

  function moveSidebarPage(dir) { sidebarPage=Math.max(0,Math.min(sidebarPage+dir,Math.ceil(currentResults.length/SIDEBAR_PAGE)-1)); renderSidebar(); }
  function jumpTo(gIdx) { currentIndex=gIdx; sidebarPage=Math.floor(currentIndex/SIDEBAR_PAGE); renderSidebar(); renderStage(); const a=document.getElementById("resultArea"); if(a)a.scrollTop=0; }
  function changeResult(dir) { const n=currentIndex+dir; if(n>=0&&n<currentResults.length)jumpTo(n); }

  function renderStage() {
    const area=document.getElementById("resultArea"), main=currentResults[currentIndex];
    if(!main){area.innerHTML="<div class='empty-state'><div class='empty-icon'>◎</div><p>No record selected.</p></div>";return;}
    const related=getRelated(currentIndex,4), dc=document.createElement("div");
    dc.className="display-container";
    dc.innerHTML=buildMainCard(main)+"<div class='related-row'>"+related.map(r=>buildRelatedCard(r)).join("")+"</div>";
    area.innerHTML=""; area.appendChild(dc);
    const prevBtn=area.querySelector("[data-action='prev']"), nextBtn=area.querySelector("[data-action='next']");
    if(prevBtn)prevBtn.onclick=()=>changeResult(-1);
    if(nextBtn)nextBtn.onclick=()=>changeResult(1);
    const relRow=area.querySelector(".related-row");
    if(relRow)relRow.onclick=function(e){const c=e.target.closest(".related-card[data-gidx]");if(c)jumpTo(parseInt(c.dataset.gidx,10));};
  }

  function getRelated(mainIdx,count) {
    const total=currentResults.length, res=[];
    let offset=1;
    while(res.length<count&&offset<total){res.push({item:currentResults[(mainIdx+offset)%total],gIdx:(mainIdx+offset)%total});offset++;}
    while(res.length<count) res.push(null);
    return res;
  }

  function buildMainCard(item) {
    if(!item) return "";
    const countryIsLong=isLongCountry(item.country), monsterContent=countryIsLong?item.country:"", titleTxt=countryIsLong?"Country Info":esc(item.country||"General");
    let traceHtml="";
    if(!isEmpty(item.unique_id)){traceHtml="<div class='row-trace'>ID <strong>"+esc(item.unique_id)+"</strong>"+(item.excel_row?" <span class='trace-sep'>·</span> Row <strong>"+esc(String(item.excel_row))+"</strong>":"")+" <span class='trace-sep'>·</span> <strong>"+esc(item.sheet_label||sheetLabel(item.source_sheet))+"</strong></div>";}
    const exTypeHtml=!isEmpty(item.exception_type)?"<div class='header-chip'>"+esc(item.exception_type)+"</div>":"";
    let headerEvidenceHtml="";
    if(!isEmpty(item.source)||!isEmpty(item.date)){headerEvidenceHtml="<div class='header-evidence'>"+(!isEmpty(item.source)?"<span class='header-ev-block'><span class='header-ev-label'>SOURCE</span><span class='header-ev-value'>"+esc(item.source)+"</span></span>":"")+(!isEmpty(item.date)?"<span class='header-ev-block'><span class='header-ev-label'>DATE UPDATED</span><span class='header-ev-value'>"+esc(item.date)+"</span></span>":"")+"</div>";}
    const metaFields=[{label:"Region",val:item.region},{label:"Customer Type",val:item.customer_type},{label:"Programme",val:item.programme},{label:"Process",val:item.process}].filter(f=>!isEmpty(f.val));
    const metaHtml=metaFields.length?"<div class='meta-row'>"+metaFields.map(f=>"<div class='meta-badge'><span class='meta-badge-label'>"+esc(f.label)+"</span><span class='meta-badge-value'>"+esc(f.val)+"</span></div>").join("")+"</div>":"";
    const monsterHtml=monsterContent?"<div class='monster-box'>"+beautifyText(monsterContent)+"</div>":"";
    const exceptionHtml=!isEmpty(item.exception)?"<div class='card-section'><div class='section-label'>Exception Detail</div><div class='section-body'>"+beautifyText(item.exception)+"</div></div>":"";
    const docsHtml=!isEmpty(item.supporting_docs)?"<div class='card-section'><div class='section-label'>Supporting Emails / Docs</div><div class='docs-box'>"+beautifyText(item.supporting_docs)+"</div></div>":"";
    const noteHtml=!isEmpty(item.note)?"<div class='note-box'><div class='note-label'>Note</div>"+beautifyText(item.note)+"</div>":"";
    return "<div class='card'>"
      +"<div class='card-header'>"
        +"<div class='card-header-left'><span class='type-tag'>"+esc(sheetLabel(item.source_sheet))+"</span><h2 class='card-title'>"+titleTxt+"</h2></div>"
        +"<div class='card-header-meta'>"+traceHtml+exTypeHtml+headerEvidenceHtml+"</div>"
        +"<div class='card-actions'><div class='card-nav'>"
          +"<button class='nav-btn' data-action='prev'"+(currentIndex===0?" disabled":"")+">← Back</button>"
          +"<span class='nav-count'>"+(currentIndex+1)+" / "+currentResults.length+"</span>"
          +"<button class='nav-btn' data-action='next'"+(currentIndex===currentResults.length-1?" disabled":"")+">Next →</button>"
        +"</div></div>"
      +"</div>"
      +monsterHtml+metaHtml+exceptionHtml+docsHtml+noteHtml
      +"</div>";
  }

  function buildRelatedCard(obj) {
    if(!obj) return "<div class='related-card empty-slot'><div class='related-country'>—</div><div class='related-teaser'>No more results</div></div>";
    const{item,gIdx}=obj, raw=item.exception||item.note||"", teaser=raw.length>120?raw.substring(0,120).trim()+"…":(raw||"—");
    const countryDisplay=item.country.length>35?item.country.substring(0,35)+"…":(item.country||"General");
    const dotCls=sheetDotClass(item.source_sheet);
    const hints=[item.customer_type,item.programme,item.exception_type].filter(v=>!isEmpty(v)).map(v=>"<span class='related-badge'>"+esc(v)+"</span>").join("");
    return "<div class='related-card' data-gidx='"+gIdx+"'>"
      +"<div class='related-sheet'><span class='pill-sheet-dot "+dotCls+"'></span>"+esc(sheetLabel(item.source_sheet))+"</div>"
      +"<div class='related-country'>"+esc(countryDisplay)+"</div>"
      +(hints?"<div class='related-badges'>"+hints+"</div>":"")
      +"<div class='related-teaser'>"+esc(teaser)+"</div>"
      +"</div>";
  }
