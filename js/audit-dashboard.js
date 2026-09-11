import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collectionGroup, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let events = [];
let filter = "all";
const $ = id => document.getElementById(id);

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function time(v) {
  if (!v) return "Not available";
  let d;
  if (typeof v?.toDate === "function") d = v.toDate();
  else if (typeof v?.seconds === "number") d = new Date(Number(v.seconds) * 1000 + Math.floor((Number(v.nanoseconds)||0)/1000000));
  else if (v?.type === "firestore/timestamp/1.0") d = new Date(Number(v.seconds) * 1000 + Math.floor((Number(v.nanoseconds)||0)/1000000));
  else d = new Date(v);
  return !d || Number.isNaN(d.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-ZA", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);
}
function allowed(d) { const r=String(d.result||d.status||"authorised").toLowerCase(); return !/denied|blocked|failed/.test(r); }
function render() {
  const yes=events.filter(e=>e.allowed), no=events.filter(e=>!e.allowed);
  const list=filter==="allowed"?yes:filter==="denied"?no:events;
  $("total").textContent=events.length; $("allowed").textContent=yes.length; $("denied").textContent=no.length;
  $("patients").textContent=new Set(events.map(e=>e.patient).filter(Boolean)).size;
  $("body").innerHTML=list.length?list.map(e=>`<tr><td>${esc(e.patient)}</td><td>${esc(e.scanner)}</td><td>${esc(e.profession)}</td><td>${esc(e.category)}</td><td><span class="badge ${e.allowed?"ok":"deny"}">${e.allowed?"Authorised":"Denied"}</span></td><td>${esc(time(e.time))}</td></tr>`).join(""): '<tr><td colspan="6">No audit events found.</td></tr>';
  $("notice").textContent=`${list.length} event(s) shown.`;
}
async function loadAudit() {
  try {
    // No where/orderBy: avoids composite-index requirements. Security is enforced
    // by the Firestore rule: only isAdmin() can read accessLogs.
    const snap=await getDocs(collectionGroup(db,"accessLogs"));
    events=snap.docs.map(x=>{const d=x.data();return {patient:d.profileId||x.ref.parent.parent?.id||"—",scanner:d.scannerName||d.scannerEmail||d.scannerUid||"—",profession:d.scannerRole||d.role||"—",category:d.categoryLabel||d.accessedCategory||"—",allowed:allowed(d),time:d.scannedAt||d.accessedAt||d.timestamp||d.createdAt};});
    events.sort((a,b)=>{const av=a.time?.seconds??0,bv=b.time?.seconds??0;return bv-av;});
    render();
    if(!events.length) $("notice").textContent="No audit events found yet. Perform a QR scan and refresh this page.";
  } catch(e) {
    console.error("LifeLinkQR audit load error:",e);
    $("notice").textContent=`Audit history could not be loaded: ${e.code||e.message||"permission error"}`;
  }
}
document.querySelectorAll(".filters button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;render();}));
onAuthStateChanged(auth,async user=>{
  if(!user){location.href="login.html";return;}
  try{
    const adminSnap=await getDoc(doc(db,"admins",user.uid));
    if(!adminSnap.exists()){document.body.innerHTML='<main style="padding:40px;font-family:Arial"><h2>⛔ Administrator access required</h2><p>This account is not configured as a LifeLinkQR administrator.</p></main>';return;}
    await loadAudit();
  }catch(e){console.error(e);$("notice").textContent=`Administrator verification failed: ${e.code||e.message||"unknown error"}`;}
});
