import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = 'login.html';
    return;
  }

  const box = $('conversations');
  box.innerHTML = '<p class="muted">Checking your service requests and conversations...</p>';

  try {
    const serviceRequests = await loadMyServiceRequests(user.uid);
    const repair = await ensureConversations(serviceRequests, user.uid);
    const conversations = await loadConversations(user.uid);

    if (!conversations.length) {
      if (!serviceRequests.length) {
        box.innerHTML = `
          <div class="empty-state">
            <h3>No service requests yet</h3>
            <p>A conversation starts from a service request.</p>
            <a class="button" href="find-professionals.html">🔎 Find a Professional</a>
          </div>`;
        return;
      }

      box.innerHTML = `
        <div class="empty-state">
          <h3>Service requests found, but chats could not be created</h3>
          <p>Requests found: <strong>${serviceRequests.length}</strong></p>
          <p class="error">${esc(repair.errors.join(' | ') || 'Firestore blocked conversation creation.')}</p>
          <p>Deploy the Demo68 Firestore rules, then reload this page.</p>
          <button id="retryChats" class="button">🔄 Repair Chats Again</button>
        </div>`;

      $('retryChats')?.addEventListener('click', () => location.reload());
      return;
    }

    const notice = repair.created > 0
      ? `<p class="success-message">✅ Repaired ${repair.created} missing conversation${repair.created === 1 ? '' : 's'} from your service requests.</p>`
      : '';

    box.innerHTML = notice + conversations
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
      .map(conversation => renderConversation(conversation, user.uid))
      .join('');
  } catch (error) {
    box.innerHTML = `<p class="error">Unable to load conversations: ${esc(error.message)}</p>`;
  }
});

async function loadMyServiceRequests(uid) {
  const [customerSnap, professionalSnap] = await Promise.all([
    getDocs(query(collection(db, 'serviceRequests'), where('customerUid', '==', uid))),
    getDocs(query(collection(db, 'serviceRequests'), where('professionalUid', '==', uid)))
  ]);

  const map = new Map();
  [...customerSnap.docs, ...professionalSnap.docs].forEach(d => {
    map.set(d.id, { id: d.id, ...d.data() });
  });
  return [...map.values()];
}

async function ensureConversations(serviceRequests, uid) {
  let created = 0;
  const errors = [];

  for (const request of serviceRequests) {
    if (!request.customerUid || !request.professionalUid) {
      errors.push(`Request ${request.id}: missing customer/professional UID.`);
      continue;
    }

    if (request.customerUid !== uid && request.professionalUid !== uid) continue;

    const ref = doc(db, 'conversations', request.id);
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) continue;

      await setDoc(ref, {
        requestId: request.id,
        customerUid: request.customerUid,
        professionalUid: request.professionalUid,
        participantUids: [request.customerUid, request.professionalUid],
        customerName: request.customerName || 'Customer',
        professionalName: request.professionalName || 'Professional',
        serviceTitle: request.serviceTitle || 'Service Request',
        lastMessage: '',
        lastSenderUid: '',
        unreadFor: [],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      created++;
    } catch (error) {
      errors.push(`Request ${request.id}: ${error.message}`);
    }
  }

  return { created, errors };
}

async function loadConversations(uid) {
  const snapshot = await getDocs(query(
    collection(db, 'conversations'),
    where('participantUids', 'array-contains', uid)
  ));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderConversation(conversation, uid) {
  const otherName = conversation.customerUid === uid
    ? conversation.professionalName
    : conversation.customerName;

  const unread = Array.isArray(conversation.unreadFor) && conversation.unreadFor.includes(uid);
  const timestamp = conversation.updatedAt?.toDate
    ? conversation.updatedAt.toDate().toLocaleString('en-ZA', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    : '';

  return `
    <a class="conversation-card${unread ? ' unread' : ''}" href="conversation.html?request=${encodeURIComponent(conversation.requestId || conversation.id)}">
      <div>
        <strong>${esc(otherName || 'Participant')} ${unread ? '<span class="unread-badge">NEW</span>' : ''}</strong>
        <span>${esc(conversation.serviceTitle || 'Service Request')}</span>
        <span>${esc(conversation.lastMessage || 'Open this chat and send the first message')}</span>
      </div>
      <small>${esc(timestamp)}</small>
    </a>`;
}
