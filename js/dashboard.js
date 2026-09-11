
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
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const logoutBtn = $("logoutBtn");
let currentProfileId = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    await loadProfile(user.uid);
  } catch (error) {
    console.error("Dashboard error:", error);
    $("welcome").textContent = "Unable to load your dashboard";
    $("status").textContent = error.message || "Please try again.";
  }
});

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
    throw new Error("Your LifeLinkQR user profile was not found.");
  }

  const data = snap.data();
  currentProfileId = String(data.profileId || "").trim().toUpperCase();

  $("welcome").textContent = `Welcome, ${data.name || "LifeLinkQR User"}`;
  $("name").textContent = data.name || "-";
  $("email").textContent = data.email || "-";
  $("profession").textContent = formatProfession(data.role);
  $("profileId").textContent = currentProfileId || "Not assigned";
  $("qrId").textContent = currentProfileId || "Not assigned";
  $("status").textContent = formatStatus(data.accountStatus, data.verificationStatus);

  if (currentProfileId) {
    generateQr(currentProfileId);
    await loadOwnRecordCards(currentProfileId);
    await loadAccessHistory(currentProfileId);
  } else {
    $("qrcode").innerHTML = "<div class='message'>Your LifeLinkQR ID has not been assigned yet.</div>";
  }
}


async function loadAccessHistory(profileId) {
  const container = $("accessHistory");
  if (!container) return;

  try {
    const logsQuery = query(
      collection(db, "profiles", profileId, "accessLogs"),
      orderBy("scannedAt", "desc"),
      limit(20)
    );
    const snap = await getDocs(logsQuery);

    if (snap.empty) {
      container.innerHTML = "<p class='record-status'>No professional access has been recorded yet.</p>";
      return;
    }

    container.innerHTML = "";
    snap.forEach(docSnap => {
      const log = docSnap.data();
      const when = log.scannedAt ? formatLifeLinkTimestamp(log.scannedAt, { locale: "en-ZA" }) : "Processing time...";
      const row = document.createElement("div");
      row.className = "access-log-row";
      row.innerHTML = `
        <div class="access-log-icon">${roleIcon(log.scannerRole)}</div>
        <div class="access-log-main">
          <strong>${escapeHtml(log.scannerName || "Professional Scanner")}</strong>
          <span>${escapeHtml(log.categoryLabel || "Protected information")} • ${escapeHtml(log.result || "recorded")}</span>
        </div>
        <time>${escapeHtml(when)}</time>
      `;
      container.appendChild(row);
    });
  } catch (error) {
    console.warn("Access history unavailable:", error);
    container.innerHTML = "<p class='record-status'>Access history is currently restricted by the database rules.</p>";
  }
}

function roleIcon(role) {
  return ({doctor:"🩺", educator:"🎓", police:"👮", civilian:"👤"})[role] || "🔐";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function generateQr(profileId) {
  $("qrcode").innerHTML = "";
  new QRCode($("qrcode"), {
    text: profileId,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function loadOwnRecordCards(profileId) {
  const records = [
    ["medicalRecord", "medicalRecords", "Medical information"],
    ["academicRecord", "academicRecords", "Academic information"],
    ["criminalRecord", "criminalRecords", "Criminal information"],
    ["civilianRecord", "civilianRecords", "Emergency information"]
  ];

  for (const [elementId, collection, label] of records) {
    const element = $(elementId);
    try {
      const snap = await getDoc(doc(db, "profiles", profileId, collection, "main"));
      if (!snap.exists()) {
        element.textContent = `${label} has not been added yet.`;
        continue;
      }
      const data = snap.data();
      const keys = Object.keys(data).filter(k => !["profileId", "uid"].includes(k));
      const updated = data.updatedAt ? `Last updated: ${formatLifeLinkTimestamp(data.updatedAt)}` : "Update time not available.";
      element.innerHTML = keys.length ? `${label} available.<br><small>${escapeHtml(updated)}</small>` : `${label} is empty.<br><small>${escapeHtml(updated)}</small>`;
    } catch (error) {
      console.warn(`Could not read ${collection}:`, error);
      element.textContent = "Record access is currently restricted by the database rules.";
    }
  }
}

$("downloadQrBtn").addEventListener("click", () => {
  const canvas = $("qrcode").querySelector("canvas");
  const image = $("qrcode").querySelector("img");
  const source = canvas ? canvas.toDataURL("image/png") : image?.src;

  if (!source || !currentProfileId) {
    alert("Your QR code is not ready yet.");
    return;
  }

  const link = document.createElement("a");
  link.href = source;
  link.download = `${currentProfileId}-LifeLinkQR.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Logout failed. Please try again.");
  }
});

function formatProfession(role = "") {
  const labels = {
    doctor: "🩺 Doctor",
    police: "👮 Police Officer",
    educator: "🎓 Educator",
    civilian: "👤 Civilian"
  };
  return labels[role] || role || "Not specified";
}

function formatStatus(accountStatus = "", verificationStatus = "") {
  if (accountStatus === "active" && verificationStatus === "approved") return "✅ Active / Verified";
  if (accountStatus === "pending" || verificationStatus === "pending") return "⏳ Pending Verification";
  if (accountStatus === "rejected" || verificationStatus === "rejected") return "❌ Rejected";
  return accountStatus || verificationStatus || "Unknown";
}
