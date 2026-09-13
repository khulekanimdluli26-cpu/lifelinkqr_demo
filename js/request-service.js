import {auth,db} from './firebase.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {doc,getDoc,collection,addDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const professionalUid=new URLSearchParams(location.search).get('professional');
let customer=null,professional=null;

onAuthStateChanged(auth,async user=>{
  if(!user){location.href='login.html';return;}

  const c=await getDoc(doc(db,'customers',user.uid));
  if(!c.exists()){
    $('professional').innerHTML='This page is for <strong>customer accounts</strong>. You are signed in, but no customer profile exists for this account.';
    $('submitBtn').disabled=true;
    $('message').innerHTML='<br><a class="button" href="customer-register.html">Create Customer Account</a> &nbsp; <a class="button" href="login.html">Sign in with a Customer Account</a>';
    return;
  }

  customer={uid:user.uid,...c.data()};

  if(!professionalUid){
    $('professional').innerHTML='No professional was selected. Please return to the marketplace and choose a professional first.';
    $('submitBtn').disabled=true;
    $('message').innerHTML='<br><a class="button" href="find-professionals.html">Find Professionals</a>';
    return;
  }

  try{
    const p=await getDoc(doc(db,'professionalDirectory',professionalUid));
    if(!p.exists()){
      $('professional').textContent='Professional not found.';
      $('submitBtn').disabled=true;
      return;
    }

    professional={uid:professionalUid,...p.data()};
    $('professional').innerHTML=`Requesting service from <strong>${esc(professional.name||'Professional')}</strong>`;
    $('location').value=customer.serviceArea||'';
  }catch(err){
    $('professional').textContent='Unable to load professional: '+err.message;
    $('submitBtn').disabled=true;
  }
});

$('requestForm').onsubmit=async e=>{
  e.preventDefault();
  if(!customer||!professionalUid||!professional)return;

  const btn=$('submitBtn');
  btn.disabled=true;
  $('message').textContent='Sending request and creating chat...';

  try{
    const requestRef=await addDoc(collection(db,'serviceRequests'),{
      customerUid:customer.uid,
      customerName:customer.name||'',
      professionalName:professional.name||'Professional',
      professionalUid,
      serviceTitle:$('serviceTitle').value.trim(),
      description:$('description').value.trim(),
      location:$('location').value.trim(),
      budget:$('budget').value.trim(),
      preferredDate:$('preferredDate').value||'',
      status:'requested',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });

    // Demo67: the conversation is created automatically as soon as the
    // service request exists. One request ID = one conversation ID.
    let chatReady=false;
    try{
      await setDoc(doc(db,'conversations',requestRef.id),{
        requestId:requestRef.id,
        customerUid:customer.uid,
        professionalUid,
        participantUids:[customer.uid,professionalUid],
        customerName:customer.name||'Customer',
        professionalName:professional.name||'Professional',
        lastMessage:'',
        lastSenderUid:'',
        unreadFor:[],
        createdAt:serverTimestamp(),
        lastMessageAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
      chatReady=true;
    }catch(chatError){
      console.error('Conversation setup failed:',chatError);
    }

    if(chatReady){
      $('message').innerHTML=`
        <div class="success-message">
          <strong>✅ Service request sent.</strong><br>
          Opening your private chat now...
        </div>`;
      setTimeout(()=>{
        location.href=`conversation.html?request=${encodeURIComponent(requestRef.id)}`;
      },600);
    }else{
      $('message').innerHTML=`
        <div class="success-message">
          <strong>✅ Service request sent.</strong><br>
          Reference: ${esc(requestRef.id)}<br><br>
          Chat could not be created automatically. Open My Requests and press Message Professional.
          <br><br><a class="button" href="my-service-requests.html">📋 Open My Requests</a>
        </div>`;
    }

    $('requestForm').reset();
    $('location').value=customer.serviceArea||'';
  }catch(err){
    $('message').textContent='❌ '+err.message;
  }finally{
    btn.disabled=false;
  }
};

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
