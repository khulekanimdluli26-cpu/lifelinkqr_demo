
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
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const DEMO_ID = "LLQ-DEMO2026";
const message = document.getElementById("demoMessage");
const createButton = document.getElementById("createDemoBtn");
const demoId = document.getElementById("demoId");

let admin = false;

demoId.textContent = DEMO_ID;

onAuthStateChanged(auth, async user => {
  if (!user) {
    message.textContent = "Login as an administrator first.";
    createButton.disabled = true;
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    admin = adminSnap.exists();
    createButton.disabled = !admin;
    message.textContent = admin
      ? "Administrator verified. You can create/reset the fictional demo patient."
      : "This account is not an authorised administrator.";
  } catch (error) {
    createButton.disabled = true;
    message.textContent = error.message || "Could not verify administrator.";
  }
});

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

createButton.addEventListener("click", async () => {
  if (!admin) return;
  createButton.disabled = true;
  message.textContent = "Creating demo patient and protected records...";

  try {
    await setDoc(doc(db, "profiles", DEMO_ID), {
      profileId: DEMO_ID,
      uid: "DEMO_PATIENT",
      name: "Thando Mthembu (Demo Patient)",
      accountStatus: "active",
      demo: true,
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "profiles", DEMO_ID, "medicalRecords", "main"), {
      bloodType: "O+",
      allergies: "Penicillin",
      medicalConditions: "Asthma",
      currentMedication: "Salbutamol inhaler",
      emergencyMedicalNote: "Demo data only — call emergency services in a real emergency.",
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "profiles", DEMO_ID, "criminalRecords", "main"), {
      recordStatus: "No criminal record (demo)",
      caseHistory: "None",
      legalNotes: "Fictional test data only.",
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "profiles", DEMO_ID, "academicRecords", "main"), {
      grade: "10",
      school: "LifeLinkQR Demonstration School",
      mathematics: "78%",
      physicalSciences: "82%",
      academicStatus: "Good standing",
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "profiles", DEMO_ID, "civilianRecords", "main"), {
      emergencyContact: "Demo Contact",
      emergencyPhone: "0000000000",
      relationship: "Parent/Guardian (demo)",
      notes: "Fictional test data only.",
      updatedAt: serverTimestamp()
    });

    message.innerHTML = "<strong>✅ Demo patient created.</strong> Use the SAME QR/ID " + DEMO_ID + " while testing different approved scanner professions.";
    createButton.textContent = "Demo Patient Ready";
  } catch (error) {
    console.error(error);
    message.innerHTML = "❌ Could not create demo data: <strong>" + escapeHtml(error.message || error) + "</strong><br><small>Make sure the latest firestore.rules are deployed and this account exists in admins/{YOUR_UID}.</small>";
    createButton.disabled = false;
  }
});
