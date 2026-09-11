import {auth,db} from './firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {doc,getDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
let uid=''; const $=id=>document.getElementById(id); onAuthStateChanged(auth,async u=>{if(!u){location.href='login.html';return;}uid=u.uid;const s=await getDoc(doc(db,'customers',uid));if(!s.exists()){location.href='customer-register.html';return;}const c=s.data();$('name').value=c.name||'';$('phone').value=c.phone||'';$('area').value=c.serviceArea||'';});
$('profileForm').onsubmit=async e=>{e.preventDefault();try{await updateDoc(doc(db,'customers',uid),{name:$('name').value.trim(),phone:$('phone').value.trim(),serviceArea:$('area').value.trim(),updatedAt:serverTimestamp()});$('message').textContent='✅ Profile saved.';}catch(err){$('message').textContent='❌ '+err.message;}};
