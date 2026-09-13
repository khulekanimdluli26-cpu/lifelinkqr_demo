import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = 'login.html';
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, 'serviceRequests'),
      where('customerUid', '==', user.uid)
    ));

    const requests = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    document.getElementById('requests').innerHTML = requests.length
      ? requests.map(renderRequest).join('')
      : '<p class="empty-state">No service requests yet. Find a professional to get started.</p>';
  } catch (error) {
    document.getElementById('requests').innerHTML = `<p>Unable to load requests. ${esc(error.message)}</p>`;
  }
});

function renderRequest(request) {
  return `
    <div class="request">
      <h3>${esc(request.serviceTitle || 'Service Request')}</h3>
      <span class="status">${esc(request.status || 'requested')}</span>
      <p><strong>Professional:</strong> ${esc(request.professionalName || 'Professional')}</p>
      <p>${esc(request.description || '')}</p>
      <p><strong>Location:</strong> ${esc(request.location || 'Not specified')}</p>
      <p><strong>Budget:</strong> ${esc(request.budget || 'Not specified')} · <strong>Preferred:</strong> ${esc(request.preferredDate || 'Flexible')}</p>
      <small>Request ID: ${esc(request.id)}</small>
      <div class="actions">
        <a class="button" href="conversation.html?request=${encodeURIComponent(request.id)}">💬 Message Professional</a>
        ${request.status === 'completed' ? `<a class="button" href="job-review.html?request=${encodeURIComponent(request.id)}">⭐ Review Professional</a>` : ''}
      </div>
    </div>`;
}
