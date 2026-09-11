import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { collection, getDocs, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt = v => v?.toDate ? new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short'}).format(v.toDate()) : '—';
let rows = [], selected = null;

async function isAdmin(user) {
  const snap = await getDoc(doc(db, 'admins', user.uid));
  return snap.exists();
}

async function load() {
  const usersSnap = await getDocs(collection(db, 'users'));
  rows = [];
  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    try {
      const skillsSnap = await getDocs(collection(db, 'users', userDoc.id, 'skills'));
      skillsSnap.forEach(skillDoc => rows.push({ id: skillDoc.id, userId: userDoc.id, user, d: skillDoc.data() }));
    } catch (error) {
      console.warn('Could not load skills for', userDoc.id, error);
    }
  }
  render();
}

function render() {
  const term = $('search').value.trim().toLowerCase();
  const status = $('status').value;
  const list = rows.filter(x => {
    const text = [x.user.name, x.user.email, x.user.profileId, x.d.skillName, x.d.category, x.d.proficiency].filter(Boolean).join(' ').toLowerCase();
    return (status === 'all' || (x.d.verificationStatus || 'pending') === status) && text.includes(term);
  });

  $('rows').innerHTML = list.length ? list.map((x, i) => `<tr>
    <td><strong>${esc(x.user.name || 'Unnamed')}</strong><br><small>${esc(x.user.email || '')}</small></td>
    <td><strong>${esc(x.d.skillName || 'Unnamed skill')}</strong><br><small>${esc(x.d.category || 'General')}</small></td>
    <td>${esc(x.d.proficiency || 'intermediate')}</td>
    <td><span class="badge ${esc(x.d.verificationStatus || 'pending')}">${esc(x.d.verificationStatus || 'pending')}</span></td>
    <td>${fmt(x.d.createdAt)}</td>
    <td><button class="view" data-i="${i}">Review</button></td>
  </tr>`).join('') : '<tr><td colspan="6">No skills match the current filter.</td></tr>';

  $('msg').textContent = `${list.length} skill(s)`;
  document.querySelectorAll('.view').forEach(btn => btn.onclick = () => openReview(list[Number(btn.dataset.i)]));
}

function openReview(item) {
  selected = item;
  $('note').value = item.d.adminNote || '';
  $('details').innerHTML = `<div class="grid">
    ${[['Professional', item.user.name], ['Email', item.user.email], ['LifeLinkQR ID', item.user.profileId], ['Skill', item.d.skillName], ['Category', item.d.category || 'General'], ['Proficiency', item.d.proficiency || 'intermediate'], ['Status', item.d.verificationStatus || 'pending'], ['Created', fmt(item.d.createdAt)]].map(([label,value]) => `<div class="item"><b>${esc(label)}</b><br>${esc(value || 'Not provided')}</div>`).join('')}
  </div>`;
  $('modal').classList.add('show');
}

async function setStatus(status) {
  if (!selected) return;
  try {
    await updateDoc(doc(db, 'users', selected.userId, 'skills', selected.id), {
      verificationStatus: status,
      adminNote: $('note').value.trim(),
      reviewedAt: new Date()
    });
    $('modal').classList.remove('show');
    await load();
  } catch (error) {
    console.error(error);
    alert('Could not update skill: ' + error.message);
  }
}

$('verify').onclick = () => setStatus('verified');
$('reject').onclick = () => setStatus('rejected');
$('close').onclick = () => $('modal').classList.remove('show');
$('refresh').onclick = load;
$('search').oninput = render;
$('status').onchange = render;

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = 'login.html'; return; }
  try {
    if (!await isAdmin(user)) {
      $('msg').textContent = '⛔ Administrator access required.';
      return;
    }
    await load();
  } catch (error) {
    console.error(error);
    $('msg').textContent = 'Unable to load skill verification: ' + error.message;
  }
});
