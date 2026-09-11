import {auth,db} from './firebase.js';
import {onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
onAuthStateChanged(auth,async user=>{if(!user){location.href='login.html';return;}const snap=await getDoc(doc(db,'customers',user.uid));if(!snap.exists()){location.href='dashboard.html';return;}const c=snap.data();$('welcome').textContent=`Welcome, ${c.name||'Customer'}`;$('name').textContent=c.name||'-';$('email').textContent=c.email||user.email||'-';$('phone').textContent=c.phone||'Not provided';$('area').textContent=c.serviceArea||'Not specified';});
$('logoutBtn').onclick=async()=>{await signOut(auth);location.href='login.html';};
