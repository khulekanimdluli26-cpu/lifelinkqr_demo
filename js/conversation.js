import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  collection,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

const requestId = new URLSearchParams(location.search).get('request');
let user = null;
let conversationId = null;
let conversationData = null;
let unsubscribeMessages = null;
let formBound = false;

onAuthStateChanged(auth, async currentUser => {
  if (!currentUser) {
    location.href = 'login.html';
    return;
  }

  user = currentUser;

  if (!requestId) {
    fail('No service request selected.');
    return;
  }

  try {
    const requestRef = doc(db, 'serviceRequests', requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      fail('Service request not found.');
      return;
    }

    const serviceRequest = requestSnap.data();
    const isCustomer = serviceRequest.customerUid === currentUser.uid;
    const isProfessional = serviceRequest.professionalUid === currentUser.uid;

    if (!isCustomer && !isProfessional) {
      fail('You are not a participant in this conversation.');
      return;
    }

    $('requestTitle').textContent = serviceRequest.serviceTitle || 'Service Request';
    $('requestMeta').textContent = `${serviceRequest.customerName || 'Customer'} ↔ ${serviceRequest.professionalName || 'Professional'} · ${serviceRequest.status || 'requested'}`;

    // Demo66: one deterministic conversation per service request.
    // Either participant can open this page first; the same document is created/used.
    conversationId = requestId;
    const conversationRef = doc(db, 'conversations', conversationId);
    const existing = await getDoc(conversationRef);

    if (!existing.exists()) {
      conversationData = {
        requestId,
        customerUid: serviceRequest.customerUid,
        professionalUid: serviceRequest.professionalUid,
        participantUids: [serviceRequest.customerUid, serviceRequest.professionalUid],
        customerName: serviceRequest.customerName || 'Customer',
        professionalName: serviceRequest.professionalName || 'Professional',
        lastMessage: '',
        lastSenderUid: '',
        unreadFor: [],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(conversationRef, conversationData);
    } else {
      conversationData = existing.data();
      if (!Array.isArray(conversationData.participantUids) || !conversationData.participantUids.includes(currentUser.uid)) {
        fail('You are not a participant in this conversation.');
        return;
      }
    }

    // Mark this conversation as read for the current participant.
    await markConversationRead();
    listenForMessages();

    if (!formBound) {
      $('messageForm').addEventListener('submit', sendMessage);
      formBound = true;
    }

    $('chatStatus').textContent = '🔒 Private conversation connected to this service request.';
    $('chatStatus').className = 'chat-status';
  } catch (error) {
    fail(error.message);
  }
});

async function markConversationRead() {
  if (!conversationId || !user) return;

  try {
    const ref = doc(db, 'conversations', conversationId);
    const fresh = await getDoc(ref);
    if (!fresh.exists()) return;

    const data = fresh.data();
    const unreadFor = Array.isArray(data.unreadFor) ? data.unreadFor : [];

    if (unreadFor.includes(user.uid)) {
      await updateDoc(ref, {
        unreadFor: unreadFor.filter(uid => uid !== user.uid),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.warn('Unable to update read state:', error);
  }
}

function listenForMessages() {
  if (unsubscribeMessages) unsubscribeMessages();

  const messagesQuery = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );

  unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
    $('messages').innerHTML = snapshot.empty
      ? '<div class="empty-chat">No messages yet. Send the first message.</div>'
      : snapshot.docs.map(messageDoc => {
          const message = messageDoc.data();
          const mine = message.senderUid === user.uid;
          return `
            <div class="message ${mine ? 'mine' : 'theirs'}">
              <div class="bubble">${esc(message.text)}</div>
              <small>${mine ? 'You' : esc(message.senderName || 'Participant')} · ${formatTime(message.createdAt)}</small>
            </div>`;
        }).join('');

    $('messages').scrollTop = $('messages').scrollHeight;
    markConversationRead();
  }, error => fail(error.message));
}

async function sendMessage(event) {
  event.preventDefault();

  const input = $('messageText');
  const text = input.value.trim();
  if (!text || !conversationId || !user) return;

  if (text.length > 2000) {
    fail('Messages cannot exceed 2,000 characters.');
    return;
  }

  $('sendBtn').disabled = true;

  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    if (!conversationSnap.exists()) throw new Error('Conversation no longer exists.');

    const data = conversationSnap.data();
    if (!Array.isArray(data.participantUids) || !data.participantUids.includes(user.uid)) {
      throw new Error('You are not authorised to send messages in this conversation.');
    }

    const recipientUid = data.customerUid === user.uid ? data.professionalUid : data.customerUid;
    const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
    const batch = writeBatch(db);

    batch.set(messageRef, {
      text,
      senderUid: user.uid,
      senderName: user.displayName || user.email || (data.customerUid === user.uid ? data.customerName : data.professionalName) || 'Participant',
      createdAt: serverTimestamp()
    });

    batch.update(conversationRef, {
      lastMessage: text.slice(0, 200),
      lastSenderUid: user.uid,
      unreadFor: recipientUid ? [recipientUid] : [],
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
    input.value = '';
    input.focus();

    $('chatStatus').textContent = '✅ Message sent securely.';
    $('chatStatus').className = 'chat-status';
  } catch (error) {
    fail(error.message);
  } finally {
    $('sendBtn').disabled = false;
  }
}

function formatTime(timestamp) {
  return timestamp?.toDate
    ? timestamp.toDate().toLocaleString('en-ZA', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    : 'Sending…';
}

function fail(message) {
  $('chatStatus').textContent = '❌ ' + message;
  $('chatStatus').className = 'chat-status error';
}
