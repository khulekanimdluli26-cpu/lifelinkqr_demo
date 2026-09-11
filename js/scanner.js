
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
import { doc, getDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const scanMessage = document.getElementById("scanMessage");
const scanResult = document.getElementById("scanResult");
const scannedId = document.getElementById("scannedId");
const resultMessage = document.getElementById("resultMessage");
const startBtn = document.getElementById("startScannerBtn");
const resultModal = document.getElementById("resultModal");
const openResultBtn = document.getElementById("openResultBtn");
const closeResultBtn = document.getElementById("closeResultBtn");
const closeResultBtnBottom = document.getElementById("closeResultBtnBottom");

const ROLE_ACCESS = {
  doctor: { name: "Doctor", icon: "🩺", collection: "medicalRecords", title: "Medical Information" },
  police: { name: "Police Officer", icon: "👮", collection: "criminalRecords", title: "Criminal History" },
  educator: { name: "Educator", icon: "🎓", collection: "academicRecords", title: "Academic Information" },
  civilian: { name: "Emergency Responder", icon: "🚨", collection: "civilianRecords", title: "Emergency Information" }
};

let scanner = null;
let currentRole = null;
let scannerRunning = false;
let authReady = false;
let accessReady = false;
let authError = null;
let scannerAccount = null;

// IMPORTANT: Do not permanently disable the button while Firebase is checking.
// The user can click it; the handler will wait for authentication to finish.
if (startBtn) {
  startBtn.disabled = false;
  startBtn.textContent = "📷 Start Camera Scanner";
}

function message(title, body) {
  if (scanMessage) {
    scanMessage.innerHTML = `<div class="access-box"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
  }
}

function setButton(label, disabled = false) {
  if (!startBtn) return;
  startBtn.disabled = disabled;
  startBtn.textContent = label;
  startBtn.style.cursor = disabled ? "not-allowed" : "pointer";
}

let resolveAuthReady;
const authReadyPromise = new Promise(resolve => { resolveAuthReady = resolve; });

onAuthStateChanged(auth, async (user) => {
  authReady = true;
  resolveAuthReady();

  if (!user) {
    accessReady = false;
    currentRole = null;
    authError = "Please log in before using the LifeLinkQR scanner.";
    setButton("📷 Start Camera Scanner", false);
    message("❌ Login Required", authError);
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      throw new Error(`Your LifeLinkQR account was not found at users/${user.uid}.`);
    }

    const account = snap.data();
    scannerAccount = { uid: user.uid, ...account };
    const role = String(account.role || "").trim().toLowerCase();
    const access = ROLE_ACCESS[role];

    if (!access) {
      throw new Error(`Your account role is not authorised for scanning: ${account.role || "missing role"}.`);
    }

    const accountStatus = String(account.accountStatus || "").trim().toLowerCase();
    const verificationStatus = String(account.verificationStatus || "").trim().toLowerCase();

    if (accountStatus !== "active" || verificationStatus !== "approved") {
      accessReady = false;
      currentRole = null;
      authError = `Scanner access requires accountStatus=active and verificationStatus=approved. Current values: accountStatus=${account.accountStatus || "missing"}, verificationStatus=${account.verificationStatus || "missing"}.`;
      setButton("📷 Start Camera Scanner", false);
      message("⏳ Verification Required", authError);
      return;
    }

    currentRole = role;
    accessReady = true;
    authError = null;
    setButton("📷 Start Camera Scanner", false);
    message(`${access.icon} ${access.name} Scanner Ready`, "Your profession is verified. Click Start Camera Scanner and allow camera access.");
    console.log("LifeLinkQR scanner ready:", { uid: user.uid, role, accountStatus, verificationStatus });
  } catch (e) {
    console.error("Scanner authentication error:", e);
    accessReady = false;
    currentRole = null;
    authError = e.message || String(e);
    setButton("📷 Start Camera Scanner", false);
    message("❌ Access Check Failed", authError);
  }
});

startBtn?.addEventListener("click", startScanner);

async function startScanner() {
  if (scannerRunning) return;

  // If the click happens before Firebase finishes restoring the login session,
  // wait for it instead of silently returning.
  if (!authReady) {
    message("⏳ Checking Login", "Please wait while LifeLinkQR verifies your scanner account...");
    await authReadyPromise;
  }

  if (!auth.currentUser) {
    message("❌ Login Required", "You must be logged in with an approved professional account before scanning.");
    return;
  }

  if (!accessReady || !currentRole) {
    message("⛔ Scanner Not Authorised", authError || "Your scanner profession has not been approved yet.");
    return;
  }

  if (typeof Html5Qrcode === "undefined") {
    message("❌ Scanner Library Missing", "Html5Qrcode did not load. Check your internet connection, then refresh the page.");
    return;
  }

  if (!window.isSecureContext) {
    message("🔒 Secure Connection Required", "Open LifeLinkQR using VS Code Live Server (http://localhost) or an HTTPS website. Do not use file://.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    message("❌ Camera Not Available", "This browser does not expose camera access. Try Chrome on localhost or HTTPS.");
    return;
  }

  setButton("📷 Requesting Camera...", true);
  message("📷 Camera Permission", "Chrome should ask for camera permission. Choose Allow.");

  try {
    // Test permission first. Release the stream before Html5Qrcode opens it.
    const testStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    testStream.getTracks().forEach(track => track.stop());
  } catch (e) {
    console.error("Camera permission error:", e);
    setButton("📷 Start Camera Scanner", false);
    message("📷 Camera Permission Needed", `${e.name || "CameraError"}: ${e.message || e}. Check Chrome site permissions and click Allow.`);
    return;
  }

  const reader = document.getElementById("reader");
  if (!reader) {
    setButton("📷 Start Camera Scanner", false);
    message("❌ Scanner Container Missing", "The page is missing the #reader camera container.");
    return;
  }

  try {
    reader.innerHTML = "";
    scanner = new Html5Qrcode("reader");
    scannerRunning = true;
    setButton("📷 Scanner Running — Point at QR Code", true);
    message("📷 Scanner Running", "Point the camera at the patient's LifeLinkQR code.");

    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      async (decodedText) => {
        if (!scannerRunning) return;
        await stopScanner();
        await processQRCode(decodedText);
      },
      () => {}
    );
  } catch (e) {
    console.error("Scanner start error:", e);
    scannerRunning = false;
    try { if (scanner) await scanner.clear(); } catch (_) {}
    scanner = null;
    setButton("📷 Start Camera Scanner", false);
    message("❌ Camera Could Not Start", `${e.name || "CameraError"}: ${e.message || e}. Check that no other application is using the camera.`);
  }
}

async function stopScanner() {
  if (!scanner) return;
  try { if (scannerRunning) await scanner.stop(); } catch (e) { console.warn("Scanner stop:", e); }
  scannerRunning = false;
  setButton("📷 Start Camera Scanner", false);
}

async function processQRCode(decodedText) {
  scanResult.style.display = "block";
  resultMessage.innerHTML = "";
  closeResultModal();
  let profileId;

  try {
    const payload = JSON.parse(decodedText);
    if (payload.app !== "LifeLinkQR" || typeof payload.profileId !== "string") throw new Error();
    profileId = payload.profileId.trim().toUpperCase();
  } catch (_) {
    const text = decodedText.trim();
    if (/^LLQ-[A-Z0-9]{8}$/i.test(text)) profileId = text.toUpperCase();
    else {
      showResult(`<div class="access-box"><h3>❌ Invalid QR Code</h3><p>Please scan a valid LifeLinkQR code.</p></div>`);
      return;
    }
  }

  scannedId.textContent = profileId;
  const access = ROLE_ACCESS[currentRole];
  if (!access) return;

  try {
    const profileSnap = await getDoc(doc(db, "profiles", profileId));
    if (!profileSnap.exists()) {
      showResult(`<div class="access-box"><h3>❌ Profile Not Found</h3><p>No LifeLinkQR profile exists for ${escapeHtml(profileId)}.</p></div>`);
      return;
    }

    const profile = profileSnap.data();
    if (profile.accountStatus !== "active") {
      showResult(`<div class="access-box"><h3>⛔ Profile Not Active</h3><p>This LifeLinkQR profile is not active.</p></div>`);
      return;
    }

    // Fast client-side QR status gate. Firestore rules remain authoritative.
    if (String(profile.qrStatus || "").trim().toLowerCase() === "deactivated") {
      showResult(`<div class="access-box"><div class="modal-category">🔒</div><h2>QR Access Blocked</h2><p class="patient-name">${escapeHtml(profileId || "Unknown QR")}</p><p>This LifeLinkQR has been <strong>deactivated by the owner</strong>.</p><div class="privacy-note">No protected information was released.</div></div>`);
      return;
    }

    // IMPORTANT SECURITY DESIGN:
    // Do NOT read the owner's /users/{uid} document from the scanner.
    // That document is private and Firestore correctly blocks a scanner from
    // reading another person's account document. The activeProfile() rule
    // performs the owner/QR-status check server-side before allowing the
    // protected record read below.
    if (!profile.uid) {
      showResult(`<div class="access-box"><h3>❌ Profile Configuration Error</h3><p>This LifeLinkQR profile is missing its owner identity.</p></div>`);
      return;
    }

    // IMPORTANT: only request the record belonging to the authenticated role.
    // Firestore rules enforce the profession-specific permission here.
    const recordSnap = await getDoc(doc(db, "profiles", profileId, access.collection, "main"));
    if (!recordSnap.exists()) {
      showResult(`<div class="access-box"><h3>${access.icon} ${escapeHtml(access.title)}</h3><p><strong>Name:</strong> ${escapeHtml(profile.name || "Not provided")}</p><hr><p>No ${escapeHtml(access.title.toLowerCase())} record was found.</p></div>`);
      return;
    }

    let record = recordSnap.data();

    // Emergency responders only receive fields explicitly marked by the owner
    // as emergency-visible. The owner controls this flag from the Patient Owner Portal.
    if (currentRole === "civilian") {
      if (record.showEmergency !== true) {
        showResult(`<div class="access-box"><div class="modal-category">🚨</div><h2>Emergency Information</h2><p class="patient-name">${escapeHtml(profile.name || "Not provided")}</p><p>The owner has not enabled emergency information for responder access.</p><div class="privacy-note">🔐 Emergency visibility is controlled by the profile owner.</div></div>`);
        await writeAccessLog({ profileId, access, result: "authorised", reason: "Emergency access requested; owner has not enabled emergency-visible information." });
        return;
      }
      const allowedEmergencyFields = [
        "emergencyContact", "emergencyRelationship", "emergencyPhone",
        "bloodType", "allergies", "residentialArea", "emergencyNotes"
      ];
      record = Object.fromEntries(Object.entries(record).filter(([key]) =>
        allowedEmergencyFields.includes(key)
      ));
    }

    displayData(profile, access, record);
    await writeAccessLog({
      profileId,
      access,
      result: "authorised",
      reason: "Professional role authorised for this information category."
    });
  } catch (e) {
    console.error("Firestore scan error:", e);
    const code = String(e?.code || "").toLowerCase();
    const text = String(e?.message || e || "");
    const denied = code.includes("permission-denied") || /permission[- ]denied/i.test(text);
    showResult(denied
      ? `<div class="access-box"><div class="modal-category">🔒</div><h2>QR Access Blocked</h2><p class="patient-name">${escapeHtml(profileId || "Unknown QR")}</p><p>This LifeLinkQR is currently <strong>deactivated, rejected, or not approved for protected access</strong>.</p><div class="privacy-note">The server has blocked access. No protected information was released.</div></div>`
      : `<div class="access-box"><h3>⛔ Access Denied</h3><p>${escapeHtml(text)}</p></div>`
    );
  }
}


async function writeAccessLog({ profileId, access, result, reason }) {
  try {
    if (!auth.currentUser || !scannerAccount) return;

    await addDoc(collection(db, "profiles", profileId, "accessLogs"), {
      scannerUid: auth.currentUser.uid,
      scannerName: scannerAccount.name || scannerAccount.displayName || "Professional Scanner",
      scannerRole: currentRole,
      accessedCategory: ({
        doctor: "medical",
        police: "criminal",
        educator: "academic",
        civilian: "emergency"
      })[currentRole] || "unknown",
      categoryLabel: access.title,
      result,
      reason,
      scannedAt: serverTimestamp()
    });
  } catch (error) {
    // Audit logging must never make an otherwise successful scan fail.
    console.warn("LifeLinkQR audit log could not be written:", error);
  }
}

function displayData(profile, access, record) {
  let html = `<div class="access-box modal-access-box"><div class="modal-category">${access.icon}</div><h2 id="resultModalTitle">${escapeHtml(access.title)}</h2><p class="patient-name">${escapeHtml(profile.name || "Not provided")}</p><p><strong>Scanner role:</strong> ${escapeHtml(access.name)}</p><hr>`;
  for (const [key, value] of Object.entries(record)) {
    if (["profileId", "uid"].includes(key)) continue;
    html += `<div class="info-row"><span>${escapeHtml(formatFieldName(key))}</span><strong>${escapeHtml(formatValue(value))}</strong></div>`;
  }
  html += `<div class="privacy-note">🔐 Only ${escapeHtml(access.title.toLowerCase())} is available to this scanner role.</div></div>`;
  showResult(html);
}

function showResult(html) {
  resultMessage.innerHTML = html;
  if (resultModal) {
    resultModal.classList.add("show");
    resultModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
}

function closeResultModal() {
  if (!resultModal) return;
  resultModal.classList.remove("show");
  resultModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

openResultBtn?.addEventListener("click", () => {
  if (resultMessage.innerHTML.trim()) showResult(resultMessage.innerHTML);
});
closeResultBtn?.addEventListener("click", closeResultModal);
closeResultBtnBottom?.addEventListener("click", closeResultModal);
resultModal?.querySelector("[data-close-modal]")?.addEventListener("click", closeResultModal);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeResultModal();
});

function formatFieldName(s) { return s.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()); }
function formatValue(v) {
  if (v == null || v === "") return "—";

  // Firestore Timestamp can be native, serialized, or wrapped by an exporter.
  // Never expose its internal type/seconds/nanoseconds representation.
  if (typeof v.toDate === "function") return formatLifeLinkTimestamp(v);
  if (v instanceof Date) return formatLifeLinkTimestamp(v);

  if (typeof v === "object") {
    const rawType = String(v.type || "").toLowerCase();
    const seconds = Number(v.seconds);
    const nanoseconds = Number(v.nanoseconds || 0);

    if ((rawType.includes("firestore/timestamp") ||
         Object.prototype.hasOwnProperty.call(v, "seconds")) &&
        Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000 + (Number.isFinite(nanoseconds) ? Math.floor(nanoseconds / 1000000) : 0));
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat("en-ZA", {
          day: "2-digit", month: "long", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        }).format(date);
      }
      return "Not available";
    }

    if (v.value && typeof v.value === "object") return formatValue(v.value);

    return Object.entries(v)
      .filter(([key]) => !["type", "seconds", "nanoseconds"].includes(key))
      .map(([key, val]) => `${formatFieldName(key)}: ${formatValue(val)}`)
      .join("; ") || "—";
  }

  return String(v);
}

function escapeHtml(v) { return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
