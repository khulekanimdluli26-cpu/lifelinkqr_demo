import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

function money(value) {
  return value === '' || value == null ? 'Not specified' : `R ${Number(value).toLocaleString('en-ZA')}`;
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = 'login.html';
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, 'serviceRequests'),
      where('professionalUid', '==', user.uid)
    ));

    const jobs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    $('jobs').innerHTML = jobs.length
      ? jobs.map(renderJob).join('')
      : '<p class="muted">No incoming requests yet.</p>';

    document.querySelectorAll('.save-job').forEach(button => {
      button.addEventListener('click', saveJob);
    });
  } catch (error) {
    $('jobs').innerHTML = `<p>Unable to load jobs: ${esc(error.message)}</p>`;
  }
});

function renderJob(job) {
  return `
    <article class="job">
      <h3>${esc(job.serviceTitle || 'Service Request')}</h3>
      <span class="status">${esc(job.status || 'requested')}</span>
      <p><strong>Customer:</strong> ${esc(job.customerName || 'Customer')}</p>
      <p>${esc(job.description || '')}</p>
      <p><strong>Location:</strong> ${esc(job.location || 'Not specified')}</p>
      <p><strong>Customer budget:</strong> ${esc(money(job.budget))}</p>
      <p><strong>Preferred date:</strong> ${esc(job.preferredDate || 'Flexible')}</p>

      <label>Quote amount (R)
        <input class="quote" data-id="${job.id}" type="number" min="0" value="${esc(job.quoteAmount ?? '')}">
      </label>

      <label>Message / quote note
        <textarea class="quote-note" data-id="${job.id}">${esc(job.quoteNote || '')}</textarea>
      </label>

      <label>Status
        <select class="job-status" data-id="${job.id}">
          ${['requested', 'quoted', 'accepted', 'in_progress', 'completed', 'cancelled']
            .map(status => `<option value="${status}" ${status === (job.status || 'requested') ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>`)
            .join('')}
        </select>
      </label>

      <div class="actions">
        <button class="save-job" data-id="${job.id}">Save Update</button>
        <button type="button" onclick="location.href='conversation.html?request=${encodeURIComponent(job.id)}'">💬 Message Customer</button>
      </div>
      <p class="save-msg" id="msg-${job.id}"></p>
    </article>`;
}

async function saveJob(event) {
  const id = event.currentTarget.dataset.id;
  const quoteValue = document.querySelector(`.quote[data-id="${id}"]`).value;
  const quoteNote = document.querySelector(`.quote-note[data-id="${id}"]`).value.trim();
  const status = document.querySelector(`.job-status[data-id="${id}"]`).value;
  const message = $(`msg-${id}`);

  event.currentTarget.disabled = true;

  try {
    await updateDoc(doc(db, 'serviceRequests', id), {
      quoteAmount: quoteValue === '' ? null : Number(quoteValue),
      quoteNote,
      status,
      updatedAt: serverTimestamp()
    });
    message.textContent = '✅ Updated successfully.';
  } catch (error) {
    message.textContent = '❌ ' + error.message;
  } finally {
    event.currentTarget.disabled = false;
  }
}
