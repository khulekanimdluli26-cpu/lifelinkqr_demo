import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const profileIdEl = document.getElementById("profileId");
let profileId = "";

const mappings = {
  civilianRecords: [
    ["emergencyContact", "emergencyContact"],
    ["emergencyRelationship", "emergencyRelationship"],
    ["emergencyPhone", "emergencyPhone"],
    ["emergencyBloodType", "bloodType"],
    ["emergencyAllergies", "allergies"],
    ["residentialArea", "residentialArea"],
    ["emergencyNotes", "emergencyNotes"],
    ["showEmergency", "showEmergency"]
  ],
  medicalRecords: [
    ["medicalBloodType", "bloodType"],
    ["medicalAllergies", "allergies"],
    ["medicalConditions", "medicalConditions"],
    ["medications", "medications"],
    ["emergencyMedicalNotes", "emergencyMedicalNotes"]
  ],
  academicRecords: [
    ["school", "school"],
    ["grade", "grade"],
    ["mathematics", "mathematics"],
    ["physicalSciences", "physicalSciences"],
    ["academicNotes", "academicNotes"]
  ]
};

function formatTimestamp(value) {
  if (!value) return "Not available";
  let date = null;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (typeof value.seconds === "number") {
    date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
  } else {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) date = d;
  }
  if (!date || Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function messageFor(collection) {
  return document.getElementById({
    civilianRecords: "civilianMessage",
    medicalRecords: "medicalMessage",
    academicRecords: "academicMessage"
  }[collection]);
}

function setMessage(collection, text, ok = true) {
  const el = messageFor(collection);
  if (!el) return;
  el.textContent = text;
  el.className = ok ? "owner-msg ok" : "owner-msg err";
}

function fillForm(collection, data) {
  for (const [inputId, field] of mappings[collection]) {
    const el = document.getElementById(inputId);
    if (el) {
      if (el.type === "checkbox") el.checked = data?.[field] === true;
      else el.value = data?.[field] ?? "";
    }
  }
}

async function loadRecord(collection) {
  const ref = doc(db, "profiles", profileId, collection, "main");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    setMessage(collection, "No information saved yet. Add it below.");
    return;
  }

  const data = snap.data();
  fillForm(collection, data);
  setMessage(
    collection,
    data.updatedAt
      ? `✓ Loaded • Last updated: ${formatTimestamp(data.updatedAt)}`
      : "✓ Information loaded."
  );
}

async function saveRecord(collection) {
  const data = {};

  for (const [inputId, field] of mappings[collection]) {
    const el = document.getElementById(inputId);
    data[field] = el ? (el.type === "checkbox" ? el.checked : el.value.trim()) : "";
  }

  const ref = doc(db, "profiles", profileId, collection, "main");

  try {
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });

    const snap = await getDoc(ref);
    const saved = snap.exists() ? snap.data() : null;

    setMessage(
      collection,
      saved?.updatedAt
        ? `✓ Saved successfully • ${formatTimestamp(saved.updatedAt)}`
        : "✓ Saved successfully."
    );
  } catch (error) {
    console.error("Owner record save failed:", collection, error);
    setMessage(
      collection,
      "Save blocked by Firestore Rules. The portal is working, but owner write permission for this collection must be enabled.",
      false
    );
  }
}

function attachForm(formId, collection) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!profileId) return;
    await saveRecord(collection);
  });
}

attachForm("civilianForm", "civilianRecords");
attachForm("medicalForm", "medicalRecords");
attachForm("academicForm", "academicRecords");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) throw new Error("User account information was not found.");

    const userData = userSnap.data();
    profileId = String(userData.profileId || "").trim().toUpperCase();

    if (!profileId) throw new Error("No LifeLinkQR ID is assigned to this account.");

    if (profileIdEl) profileIdEl.textContent = profileId;

    await Promise.all([
      loadRecord("civilianRecords"),
      loadRecord("medicalRecords"),
      loadRecord("academicRecords")
    ]);
  } catch (error) {
    console.error("Owner portal load failed:", error);
    if (profileIdEl) profileIdEl.textContent = "Unavailable";
    for (const collection of Object.keys(mappings)) {
      setMessage(collection, error.message || "Unable to load owner information.", false);
    }
  }
});
