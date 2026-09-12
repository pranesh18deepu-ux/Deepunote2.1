/* DeepuNotes V2.1 — iPad Pencil fix
   Important design choice:
   - Apple Pencil draws.
   - Finger scrolls the page.
   - Touch does not close Focus.
   - No pointer-capture tricks for finger scrolling.
*/
const DB_NAME = "DeepuNotesV2_1";
const DB_STORE = "state";
const DB_VERSION = 1;

let db, state;
let notebookId = null, sectionId = null, pageId = null;
let tool = "pen";
let drawing = false;
let activePointerId = null;
let currentStroke = null;
let fingerGesture = null;
let undoStack = [], redoStack = [];
let suppressNextClick = false;

const $ = id => document.getElementById(id);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random());
const getNotebook = () => state?.notebooks?.find(n => n.id === notebookId);
const getSection = () => getNotebook()?.sections?.find(s => s.id === sectionId);
const getPage = () => getSection()?.pages?.find(p => p.id === pageId);

function openDB(){
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
    r.onsuccess = () => { db = r.result; resolve(); };
    r.onerror = () => reject(r.error);
  });
}
function readState(){
  return new Promise((resolve,reject)=>{
    const r = db.transaction(DB_STORE).objectStore(DB_STORE).get("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function writeState(v){
  return new Promise((resolve,reject)=>{
    const r = db.transaction(DB_STORE,"readwrite").objectStore(DB_STORE).put(v,"state");
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  });
}
async function save(){
  if(!state) return;
  $("saveStatus").textContent = "Saving…";
  await writeState(state);
  $("saveStatus").textContent = "Saved locally";
}
function makeFresh(){
  const n = {id:uid(), name:"Zoology", sections:[]};
  const s = {id:uid(), name:"General", pages:[]};
  const p = {id:uid(), title:"Welcome", background:"ruled", strokes:[], texts:[]};
  s.pages.push(p); n.sections.push(s);
  return {notebooks:[n], currentNotebookId:n.id, currentSectionId:s.id, currentPageId:p.id};
}
function normalise(){
  if(!state || !Array.isArray(state.notebooks) || !state.notebooks.length) state = makeFresh();
  for(const n of state.notebooks){
    if(!Array.isArray(n.sections)) n.sections=[];
    if(!n.sections.length) n.sections.push({id:uid(),name:"General",pages:[]});
    for(const s of n.sections){
      if(!Array.isArray(s.pages)) s.pages=[];
      for(const p of s.pages){
        p.background ||= "blank";
        p.strokes ||= [];
        p.texts ||= [];
      }
    }
  }
  if(!state.currentNotebookId || !state.notebooks.some(n=>n.id===state.currentNotebookId))
    state.currentNotebookId = state.notebooks[0].id;
  notebookId = state.currentNotebookId;
  const n = getNotebook();
  if(!n.sections.length) n.sections.push({id:uid(),name:"General",pages:[]});
  if(!state.currentSectionId || !n.sections.some(s=>s.id===state.currentSectionId))
    state.currentSectionId = n.sections[0].id;
  sectionId = state.currentSectionId;
  const s = getSection();
  if(!s.pages.length) s.pages.push({id:uid(),title:"Untitled Page",background:"blank",strokes:[],texts:[]});
  if(!state.currentPageId || !s.pages.some(p=>p.id===state.currentPageId))
    state.currentPageId = s.pages[0].id;
  pageId = state.currentPageId;
}
function syncIds(){
  state.currentNotebookId=notebookId;
  state.currentSectionId=sectionId;
  state.currentPageId=pageId;
}
function snapshot(){ return JSON.stringify(state); }
function pushUndo(){ undoStack.push(snapshot()); if(undoStack.length>50) undoStack.shift(); redoStack=[]; }

async function undo(){
  if(!undoStack.length) return;
  redoStack.push(snapshot());
  state=JSON.parse(undoStack.pop());
  normalise(); syncIds(); render(); await save();
}
async function redo(){
  if(!redoStack.length) return;
  undoStack.push(snapshot());
  state=JSON.parse(redoStack.pop());
  normalise(); syncIds(); render(); await save();
}

function render(){
  const n=getNotebook(), s=getSection(), p=getPage();
  $("notebookList").innerHTML="";
  for(const x of state.notebooks){
    const row=document.createElement("div");
    row.className="itemRow";
    const b=document.createElement("button");
    b.className="notebook "+(x.id===notebookId?"active":"");
    b.textContent="📓 "+x.name;
    b.addEventListener("click",()=>{
      notebookId=x.id; sectionId=x.sections[0]?.id||null; pageId=x.sections[0]?.pages[0]?.id||null;
      syncIds(); render(); save();
    });
    const del=document.createElement("button");
    del.className="deleteBtn";
    del.type="button";
    del.textContent="×";
    del.title="Delete notebook";
    del.setAttribute("aria-label",`Delete notebook ${x.name}`);
    del.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();deleteNotebookById(x.id);});
    row.appendChild(b); row.appendChild(del);
    $("notebookList").appendChild(row);
  }

  $("breadcrumbs").textContent = n ? `${n.name} / ${s?.name||""}` : "DeepuNotes";
  $("sectionName").textContent = s?.name || "General";
  $("pageList").innerHTML="";
  if(s){
    for(const x of s.pages){
      const row=document.createElement("div");
      row.className="itemRow";
      const b=document.createElement("button");
      b.className="pageItem "+(x.id===pageId?"active":"");
      b.textContent="📄 "+x.title;
      b.addEventListener("click",()=>{ pageId=x.id; syncIds(); render(); save(); });
      const del=document.createElement("button");
      del.className="deleteBtn";
      del.type="button";
      del.textContent="×";
      del.title="Delete page";
      del.setAttribute("aria-label",`Delete page ${x.title}`);
      del.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();deletePageById(x.id);});
      row.appendChild(b); row.appendChild(del);
      $("pageList").appendChild(row);
    }
  }

  $("emptyState").hidden=!!p;
  $("pageView").hidden=!p;
  if(p){
    $("pageTitle").value=p.title;
    applyBackground(p.background);
    resizeCanvas();
    renderCanvas();
    renderTexts();
  }
}
function applyBackground(bg){
  $("canvasWrap").className="canvasWrap "+(bg||"blank");
  document.querySelectorAll(".bgBtn").forEach(b=>b.classList.toggle("active",b.dataset.bg===bg));
}
function resizeCanvas(){
  const wrap=$("canvasWrap"), c=$("noteCanvas");
  const d=Math.max(1,window.devicePixelRatio||1);
  const w=wrap.clientWidth, h=Math.max(w*1.25, 1400);
  wrap.style.setProperty("--page-height",h+"px");
  c.width=Math.round(w*d); c.height=Math.round(h*d);
  c.style.width=w+"px"; c.style.height=h+"px";
  const x=c.getContext("2d");
  x.setTransform(d,0,0,d,0,0);
}
function canvasPoint(ev){
  const r=$("noteCanvas").getBoundingClientRect();
  return {x:ev.clientX-r.left,y:ev.clientY-r.top,p:ev.pressure||0.5};
}
function setupContext(){
  const c=$("noteCanvas"), x=c.getContext("2d");
  x.lineCap="round"; x.lineJoin="round";
  return x;
}
function drawStroke(st){
  const pts=st.points||[];
  if(!pts.length) return;
  const x=setupContext();
  x.save();
  x.strokeStyle=st.color;
  x.globalAlpha=st.tool==="highlighter" ? 0.27 : 1;
  x.lineWidth=st.width;
  x.beginPath();
  x.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    x.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
  }
  x.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
  x.stroke();
  x.restore();
}
function renderCanvas(){
  const c=$("noteCanvas"), x=c.getContext("2d");
  x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,c.width,c.height);
  const d=Math.max(1,window.devicePixelRatio||1);
  x.setTransform(d,0,0,d,0,0);
  for(const st of (getPage()?.strokes||[])) drawStroke(st);
}
function renderTexts(){
  const layer=$("textLayer"); layer.innerHTML="";
  for(const t of (getPage()?.texts||[])){
    const d=document.createElement("div");
    d.className="textBox";
    d.contentEditable="true";
    d.textContent=t.text||"";
    d.style.left=t.x+"px"; d.style.top=t.y+"px"; d.style.width=(t.w||240)+"px";
    d.addEventListener("pointerdown",ev=>ev.stopPropagation());
    d.addEventListener("input",()=>{t.text=d.textContent; save();});
    layer.appendChild(d);
  }
}
function drawSegment(a,b,st){
  const x=setupContext();
  x.save();
  x.strokeStyle=st.color;
  x.globalAlpha=st.tool==="highlighter" ? 0.27 : 1;
  const pressure=Math.min(1,Math.max(.05,b.p||.5));
  x.lineWidth=st.tool==="highlighter" ? st.width : st.width*(.72+.56*pressure);
  x.beginPath(); x.moveTo(a.x,a.y); x.lineTo(b.x,b.y); x.stroke(); x.restore();
}
function eraseAt(q){
  const p=getPage(); if(!p) return;
  const before=p.strokes.length;
  p.strokes=p.strokes.filter(st=>!(st.points||[]).some(a=>Math.hypot(a.x-q.x,a.y-q.y)<Math.max(16,st.width*3)));
  if(before!==p.strokes.length) renderCanvas();
}

function pointerDown(ev){
  const c=$("noteCanvas");
  if(!getPage()) return;

  // Pencil/pen/stylus: ONLY this path draws.
  if(ev.pointerType==="pen"){
    ev.preventDefault();
    drawing=true;
    activePointerId=ev.pointerId;
    c.setPointerCapture?.(ev.pointerId);

    if(tool==="text"){
      const q=canvasPoint(ev); pushUndo();
      getPage().texts.push({id:uid(),x:q.x,y:q.y,w:240,text:"Type here"});
      renderTexts(); save(); drawing=false; return;
    }
    if(tool==="eraser"){
      pushUndo(); eraseAt(canvasPoint(ev)); return;
    }

    const base=Number($("size").value)||3;
    currentStroke={
      id:uid(), tool,
      color:tool==="highlighter" ? "#facc15" : $("color").value,
      width:tool==="highlighter" ? Math.max(10,base*3) : base,
      points:[]
    };
    getPage().strokes.push(currentStroke);
    const q=canvasPoint(ev);
    currentStroke.points.push(q);
    drawSegment(q,{...q,p:q.p},currentStroke);
    return;
  }

  // Finger touch: never draw. It scrolls the canvas viewport.
  if(ev.pointerType==="touch"){
    ev.preventDefault();
    fingerGesture={pointerId:ev.pointerId,lastX:ev.clientX,lastY:ev.clientY};
    return;
  }

  // Mouse support for desktop testing.
  if(ev.pointerType==="mouse"){
    ev.preventDefault();
    drawing=true; activePointerId=ev.pointerId;
    const base=Number($("size").value)||3;
    currentStroke={id:uid(),tool,color:$("color").value,width:base,points:[]};
    getPage().strokes.push(currentStroke);
    const q=canvasPoint(ev); currentStroke.points.push(q);
    return;
  }
}
function pointerMove(ev){
  if(ev.pointerType==="pen" && drawing && ev.pointerId===activePointerId){
    ev.preventDefault();
    const q=canvasPoint(ev);
    if(tool==="eraser") eraseAt(q);
    else {
      const a=currentStroke.points[currentStroke.points.length-1];
      currentStroke.points.push(q);
      if(a) drawSegment(a,q,currentStroke);
    }
    return;
  }
  if(ev.pointerType==="touch" && fingerGesture?.pointerId===ev.pointerId){
    ev.preventDefault();
    const v=$("canvasWrap");
    // Finger scrolling is implemented by moving the document page itself.
    // The page is inside the browser viewport, so translate the wrap's scrollTop
    // using the nearest scrolling parent.
    const scroller=$("canvasWrap");
    const dy=fingerGesture.lastY-ev.clientY;
    const dx=fingerGesture.lastX-ev.clientX;
    scroller.scrollTop += dy;
    scroller.scrollLeft += dx;
    fingerGesture.lastX=ev.clientX; fingerGesture.lastY=ev.clientY;
  }
}
async function pointerEnd(ev){
  if(ev.pointerType==="touch" && fingerGesture?.pointerId===ev.pointerId){
    fingerGesture=null; return;
  }
  if((ev.pointerType==="pen" || ev.pointerType==="mouse") && ev.pointerId===activePointerId){
    ev.preventDefault();
    drawing=false; activePointerId=null;
    suppressNextClick=true;
    setTimeout(()=>suppressNextClick=false,250);
    try{$("noteCanvas").releasePointerCapture?.(ev.pointerId)}catch(_){}
    currentStroke=null;
    await save();
  }
}

const canvas=$("noteCanvas");
canvas.addEventListener("pointerdown",pointerDown,{passive:false});
canvas.addEventListener("pointermove",pointerMove,{passive:false});
canvas.addEventListener("pointerup",pointerEnd,{passive:false});
canvas.addEventListener("pointercancel",pointerEnd,{passive:false});
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("selectstart",e=>e.preventDefault());
canvas.addEventListener("dragstart",e=>e.preventDefault());
canvas.addEventListener("click",e=>{
  // Safari/iPadOS may synthesize a click after an Apple Pencil stroke.
  // Never let that click invoke text selection/navigation.
  e.preventDefault();
  e.stopPropagation();
}, {passive:false});

$("canvasWrap").addEventListener("selectstart",e=>e.preventDefault());
$("canvasWrap").addEventListener("dragstart",e=>e.preventDefault());

document.querySelectorAll("[data-tool]").forEach(b=>{
  b.addEventListener("click",()=>{
    tool=b.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach(x=>x.classList.toggle("active",x===b));
  });
});
document.querySelectorAll(".bgBtn").forEach(b=>{
  b.addEventListener("click",()=>{
    const p=getPage(); if(!p)return;
    pushUndo(); p.background=b.dataset.bg; applyBackground(p.background); save();
  });
});
$("pageTitle").addEventListener("input",()=>{
  const p=getPage(); if(!p)return;
  p.title=$("pageTitle").value||"Untitled Page";
  $("pageList").querySelectorAll(".pageItem").forEach((b,i)=>{
    const page=getSection().pages[i]; if(page) b.textContent="📄 "+page.title;
  });
  save();
});
$("undo").onclick=undo; $("redo").onclick=redo;
$("clearPage").onclick=()=>{
  const p=getPage(); if(!p)return;
  if(confirm("Clear this page?")){ pushUndo(); p.strokes=[]; p.texts=[]; renderCanvas(); renderTexts(); save(); }
};

function deletePageById(id){
  const s=getSection(); if(!s) return;
  if(s.pages.length<=1){
    alert("A section must keep at least one page. Create another page first, then delete this one.");
    return;
  }
  const target=s.pages.find(p=>p.id===id);
  if(!target) return;
  if(!confirm(`Delete page "${target.title}"? This cannot be undone.`)) return;
  pushUndo();
  const idx=s.pages.findIndex(p=>p.id===id);
  s.pages.splice(idx,1);
  pageId=s.pages[Math.max(0,idx-1)].id;
  syncIds(); render(); save();
}

function deleteNotebookById(id){
  if(state.notebooks.length<=1){
    alert("DeepuNotes must keep at least one notebook. Create another notebook first, then delete this one.");
    return;
  }
  const target=state.notebooks.find(n=>n.id===id);
  if(!target) return;
  if(!confirm(`Delete notebook "${target.name}" and all its pages? This cannot be undone.`)) return;
  pushUndo();
  const idx=state.notebooks.findIndex(n=>n.id===id);
  state.notebooks.splice(idx,1);
  const next=state.notebooks[Math.max(0,idx-1)];
  notebookId=next.id;
  sectionId=next.sections[0]?.id||null;
  pageId=next.sections[0]?.pages[0]?.id||null;
  syncIds(); normalise(); syncIds(); render(); save();
}

function dialog(title,initial,cb){
  $("dialogTitle").textContent=title; $("nameInput").value=initial;
  $("nameDialog").showModal();
  $("nameForm").onsubmit=e=>{
    e.preventDefault();
    const v=$("nameInput").value.trim();
    if(v){ $("nameDialog").close(); cb(v); }
  };
  setTimeout(()=>$("nameInput").select(),50);
}
$("newNotebook").onclick=()=>dialog("New Notebook","My Notebook",async name=>{
  const n={id:uid(),name,sections:[]};
  const s={id:uid(),name:"General",pages:[]};
  const p={id:uid(),title:"Untitled Page",background:"blank",strokes:[],texts:[]};
  s.pages.push(p); n.sections.push(s); state.notebooks.push(n);
  notebookId=n.id; sectionId=s.id; pageId=p.id; syncIds(); await save(); render();
});
$("emptyNew").onclick=()=>$("newNotebook").click();
$("newPage").onclick=async()=>{
  const s=getSection(); if(!s)return;
  pushUndo();
  const p={id:uid(),title:"Untitled Page",background:"blank",strokes:[],texts:[]};
  s.pages.push(p); pageId=p.id; syncIds(); await save(); render();
};
$("sidebarToggle").onclick=()=>document.body.classList.toggle("sideOpen");
$("focusMode").onclick=()=>document.body.classList.toggle("focusMode");
$("exportAll").onclick=()=>{
  const blob=new Blob([JSON.stringify(state)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="DeepuNotes-V2.1-Backup.deepunotes"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$("importAll").onclick=()=>$("backupInput").click();
$("backupInput").onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{ state=JSON.parse(await f.text()); normalise(); syncIds(); await save(); render(); alert("Backup restored."); }
  catch(_){ alert("Invalid DeepuNotes backup."); }
  e.target.value="";
};

window.addEventListener("resize",()=>{ if(getPage()){ resizeCanvas(); renderCanvas(); } });

(async()=>{
  try{
    await openDB();
    state=await readState();
    normalise(); syncIds();
    await save(); render();
  }catch(err){
    console.error(err);
    alert("DeepuNotes could not initialise local storage. Please reload the page.");
  }
})();
