
function formatLifeLinkTimestamp(value) {
  if (!value) return "Not available";
  let date = null;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value && typeof value.seconds === "number")
    date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
  else if (value instanceof Date) date = value;
  else if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) date = d;
  }
  if (!date || Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection, collectionGroup, getDocs, getDoc, doc, updateDoc, serverTimestamp,
  query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const adminMessage = $("adminMessage");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function roleLabel(role) {
  return ({doctor:"Doctor", police:"Police Officer", educator:"Educator", civilian:"Civilian"})[role] || role || "Unknown";
}

function dateText(value) {
  if (!value) return "Unknown time";
  try {
    if (typeof value.toDate === "function") value = value.toDate();
    else if (value && typeof value.seconds === "number") {
      value = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
    } else if (!(value instanceof Date)) {
      value = new Date(value);
    }
    if (Number.isNaN(value.getTime())) return "Unknown time";
    return new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(value);
  } catch {
    return "Unknown time";
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    adminMessage.innerHTML = '❌ Please <a href="login.html">log in</a>.';
    return;
  }

  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    if (!snap.exists()) throw new Error("This account is not an authorised administrator.");

    adminMessage.textContent = "✅ Administrator access confirmed.";
    $("statsSection").style.display = "grid";
    $("pendingSection").style.display = "block";
    $("activitySection").style.display = "block";
    $("securitySection").style.display = "block";
    $("demoSection").style.display = "block";

    await Promise.all([loadStats(), loadPending(), loadActivity(), loadSecurity()]);
  } catch (error) {
    console.error(error);
    adminMessage.textContent = "⛔ " + (error.message || error);
  }
});

async function loadStats() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let approved = 0, pending = 0;

    usersSnap.forEach(s => {
      const d = s.data();
      if (d.verificationStatus === "approved" && d.accountStatus === "active") approved++;
      if (d.verificationStatus === "pending") pending++;
    });

    $("totalProfessionals").textContent = usersSnap.size;
    $("approvedProfessionals").textContent = approved;
    $("pendingProfessionals").textContent = pending;

    const activeQRs = usersSnap.docs.filter(s => s.data().qrStatus !== "deactivated").length;
    const deactivatedQRs = usersSnap.docs.filter(s => s.data().qrStatus === "deactivated").length;
    $("activeQRs").textContent = activeQRs;
    $("deactivatedQRs").textContent = deactivatedQRs;

    try {
      const logsSnap = await getDocs(collectionGroup(db, "accessLogs"));
      const authorisedCount = logsSnap.docs.filter(s => String(s.data().result || "authorised").toLowerCase() === "authorised").length;
      const deniedCount = logsSnap.docs.filter(s => /denied|blocked|failed/i.test(String(s.data().result || s.data().status || ""))).length;
      $("totalScans").textContent = authorisedCount;
      $("deniedEvents").textContent = deniedCount;
    } catch (error) {
      console.warn("Could not count audit logs:", error);
      $("totalScans").textContent = "—";
    }
  } catch (error) {
    console.error(error);
    ["totalProfessionals","approvedProfessionals","pendingProfessionals"].forEach(id => $(id).textContent = "—");
    $("totalScans").textContent = "—";
    $("activeQRs").textContent = "—";
    $("deactivatedQRs").textContent = "—";
    $("deniedEvents").textContent = "—";
  }
}

async function loadSecurity() {
  const list = $("securityList");
  if (!list) return;
  list.textContent = "Loading...";
  try {
    const [usersSnap, logsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collectionGroup(db, "accessLogs"))
    ]);

    const deactivated = usersSnap.docs.filter(s => s.data().qrStatus === "deactivated");
    const denied = logsSnap.docs
      .map(s => ({id:s.id,d:s.data(),path:s.ref.path}))
      .filter(x => /denied|blocked|failed/i.test(String(x.d.result || x.d.status || "")))
      .sort((a,b) => (b.d.scannedAt?.seconds ?? 0) - (a.d.scannedAt?.seconds ?? 0))
      .slice(0,8);

    const cards = `
      <div class="security-grid">
        <div class="security-item"><strong>🟢 Active QR codes</strong><small>${usersSnap.docs.filter(s => s.data().qrStatus !== "deactivated").length} owner accounts currently active.</small></div>
        <div class="security-item"><strong>🔴 Deactivated QR codes</strong><small>${deactivated.length} owner account(s) currently blocking scans.</small></div>
        <div class="security-item"><strong>⛔ Recent denied events</strong><small>${denied.length} recent denied event(s) displayed below.</small></div>
      </div>`;

    let alerts = "";
    if (deactivated.length) {
      alerts += deactivated.slice(0,8).map(s => {
        const d=s.data();
        return `<div class="security-alert"><div class="security-alert-icon">🔴</div><div><strong>QR deactivated</strong><p>${esc(d.name || "Owner")} • ${esc(d.profileId || "No LifeLinkQR ID")}</p></div></div>`;
      }).join("");
    }
    alerts += denied.map(x => {
      const d=x.d;
      return `<div class="security-alert"><div class="security-alert-icon">⛔</div><div><strong>Denied access</strong><p>${esc(d.scannerName || d.scannerEmail || "Unknown scanner")} • ${esc(roleLabel(d.scannerRole || d.profession))} • ${esc(d.categoryLabel || d.accessedCategory || "Protected information")} • ${esc(dateText(d.scannedAt || d.accessedAt || d.timestamp))}</p></div></div>`;
    }).join("");

    list.innerHTML = cards + (alerts || '<div class="empty-state">✓ No current security alerts.</div>');
  } catch (error) {
    console.error("Security monitor error:", error);
    list.innerHTML = `<div class="empty-state">Unable to load security monitor: ${esc(error.code || error.message || "permission error")}</div>`;
  }
}

async function loadPending() {
  const list = $("pendingList");
  list.textContent = "Loading...";

  try {
    const snap = await getDocs(query(
      collection(db, "users"),
      where("verificationStatus", "==", "pending")
    ));

    if (snap.empty) {
      list.innerHTML = '<div class="empty-state">✓ No pending professional accounts.</div>';
      return;
    }

    list.innerHTML = "";
    snap.forEach(s => {
      const d = s.data();
      const card = document.createElement("div");
      card.className = "admin-row";
      card.innerHTML = `
        <div>
          <strong>${esc(d.name || "Unnamed")}</strong>
          <p>${esc(d.email || "")} • ${esc(roleLabel(d.role))}</p>
          <small>LifeLinkQR ID: ${esc(d.profileId || "Not assigned")}</small>
        </div>
        <div class="row-actions">
          <button data-uid="${esc(s.id)}" data-action="approve">✓ Approve</button>
          <button class="secondary-btn" data-uid="${esc(s.id)}" data-action="reject">Reject</button>
        </div>`;
      card.querySelectorAll("button").forEach(btn =>
        btn.addEventListener("click", () => verifyUser(btn.dataset.uid, btn.dataset.action))
      );
      list.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="empty-state">Unable to load pending accounts: ${esc(error.message)}</div>`;
  }
}

async function verifyUser(uid, action) {
  const approved = action === "approve";
  if (!confirm(`${approved ? "Approve" : "Reject"} this professional account?`)) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      accountStatus: approved ? "active" : "rejected",
      verificationStatus: approved ? "approved" : "rejected",
      qrStatus: approved ? "active" : "deactivated",
      verifiedAt: new Date()
    });

    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const profileId = userSnap.data().profileId;
      if (profileId) {
        await updateDoc(doc(db, "profiles", profileId), {
          accountStatus: approved ? "active" : "rejected",
          qrStatus: approved ? "active" : "deactivated",
          qrStatusUpdatedAt: serverTimestamp()
        });
      }
    }

    await Promise.all([loadStats(), loadPending()]);
  } catch (error) {
    alert("Could not update account: " + (error.message || error));
  }
}

async function loadActivity() {
  const list = $("activityList");
  list.textContent = "Loading...";

  try {
    // Read the collection group without where/orderBy so no composite index is required.
    // Firestore rules still require isAdmin() for these protected logs.
    const snap = await getDocs(collectionGroup(db, "accessLogs"));
    const rows = snap.docs
      .map(s => ({ id: s.id, d: s.data() }))
      .filter(x => String(x.d.result || "authorised").toLowerCase() === "authorised")
      .sort((a,b) => {
        const av = a.d.scannedAt?.seconds ?? 0;
        const bv = b.d.scannedAt?.seconds ?? 0;
        return bv - av;
      })
      .slice(0, 20);

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">No authorised access activity yet.</div>';
      return;
    }

    list.innerHTML = "";
    rows.forEach(x => {
      const d = x.d;
      const row = document.createElement("div");
      row.className = "activity-row";
      row.innerHTML = `
        <div class="activity-icon">🔐</div>
        <div>
          <strong>${esc(d.scannerName || "Professional")}</strong>
          <p>${esc(roleLabel(d.scannerRole || d.profession))} • ${esc(d.categoryLabel || d.accessedCategory || "Protected information")}</p>
        </div>
        <time>${esc(dateText(d.scannedAt || d.accessedAt || d.timestamp))}</time>`;
      list.appendChild(row);
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="empty-state">Audit activity could not be loaded: ${esc(error.code || error.message || "permission error")}</div>`;
  }
}

$("refreshPending")?.addEventListener("click", () => {
  loadStats();
  loadPending();
});
$("refreshActivity")?.addEventListener("click", () => {
  loadStats();
  loadActivity();
});
$("refreshSecurity")?.addEventListener("click", () => {
  loadStats();
  loadSecurity();
});
