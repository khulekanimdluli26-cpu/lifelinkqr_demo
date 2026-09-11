import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc,getDoc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $=x=>document.getElementById(x);
let uid=null,data=null;

function render(){
  const active=data.qrStatus==="active";
  $("status").textContent=active?"🟢 ACTIVE":"🔴 DEACTIVATED";
  $("id").textContent="LifeLinkQR ID: "+(data.profileId||"—");
  $("actions").innerHTML=active
    ? '<button class="btn danger" id="toggle">Deactivate QR</button>'
    : '<button class="btn success" id="toggle">Reactivate QR</button>';
  $("notice").textContent=active
    ?"Your QR is active. Authorised scanners may continue according to their role."
    :"Your QR is deactivated. Scanner access is blocked until you reactivate it.";
  $("toggle").onclick=toggle;
}

async function toggle(){
  const next=data.qrStatus==="active"?"deactivated":"active";
  const ok=confirm(next==="active"
    ?"Reactivate your LifeLinkQR? Authorised scanning will be allowed again."
    :"Deactivate your LifeLinkQR? All scanner access will be blocked.");
  if(!ok)return;

  const button=$("toggle");
  button.disabled=true;
  button.textContent="Saving...";

  try{
    const statusUpdate = {
      qrStatus: next,
      qrStatusUpdatedAt: serverTimestamp()
    };

    // Keep the public profile security state synchronized as well.
    // The scanner can then stop immediately without ever reading the
    // private /users/{uid} document. Firestore rules still enforce the
    // same status server-side before protected records are released.
    const batch = writeBatch(db);
    batch.update(doc(db,"users",uid), statusUpdate);
    if (data.profileId) {
      batch.update(doc(db,"profiles",data.profileId), statusUpdate);
    }
    await batch.commit();

    // Re-read from Firestore so the UI reflects the actual saved state.
    const verifySnap = await getDoc(doc(db,"users",uid));
    const verifyData = verifySnap.data() || {};
    if (verifyData.qrStatus !== next) {
      throw new Error("QR status was not confirmed by Firestore.");
    }

    data.qrStatus=next;
    render();
  }catch(e){
    console.error("QR status update failed:",e);
    button.disabled=false;
    button.textContent=next==="active"?"Reactivate QR":"Deactivate QR";
    $("notice").textContent="Could not save the QR status. Make sure you are logged in as the profile owner and deploy the supplied Firestore rules.";
  }
}

onAuthStateChanged(auth,async u=>{
  if(!u){location.href="login.html";return}
  uid=u.uid;
  try{
    const snap=await getDoc(doc(db,"users",uid));
    if(!snap.exists())throw new Error("Account not found");
    data=snap.data();

    // Existing accounts are treated as active until the owner explicitly
    // changes the setting.
    if(!data.qrStatus){
      const initialStatus = {
        qrStatus:"active",
        qrStatusUpdatedAt:serverTimestamp()
      };
      const batch = writeBatch(db);
      batch.update(doc(db,"users",uid), initialStatus);
      if (data.profileId) {
        batch.update(doc(db,"profiles",data.profileId), initialStatus);
      }
      await batch.commit();
      data.qrStatus="active";
    }
    render();
  }catch(e){
    console.error("QR status load failed:",e);
    $("notice").textContent="Unable to load QR status: "+(e.message||e);
  }
});
