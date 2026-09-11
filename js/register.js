
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
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const form = document.getElementById("registerForm");
const message = document.getElementById("message");
const qrSection = document.getElementById("qrSection");
const profileIdDisplay = document.getElementById("profileIdDisplay");
const profileSummary = document.getElementById("profileSummary");
const registerButton = document.getElementById("registerButton");

form?.addEventListener("submit", handleRegistration);

async function handleRegistration(event) {
    event.preventDefault();
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const profession = document.getElementById("profession").value;

    if (!name || !email || !password || !profession) {
        message.textContent = "Please complete all fields.";
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";
    message.textContent = "Creating your LifeLinkQR account...";

    try {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        const profileId = createProfileId();

        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name,
            email,
            role: profession,
            profileId,
            accountStatus: "pending",
            verificationStatus: "pending",
      qrStatus: "active",
      qrStatusUpdatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        });

        await setDoc(doc(db, "profiles", profileId), {
            profileId,
            uid: user.uid,
            name,
            accountStatus: "pending",
            qrStatus: "active",
            qrStatusUpdatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        });

        message.innerHTML = `<div class="success-message">✅ Account created. Your profession must be verified by a LifeLinkQR administrator before scanner access is activated.</div>`;
        profileIdDisplay.textContent = profileId;
        profileSummary.innerHTML = `
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Profession:</strong> ${escapeHtml(getProfessionName(profession))}</p>
            <p><strong>Status:</strong> Pending Verification</p>
            <p><strong>Scanner Access:</strong> Disabled until verification.</p>`;

        qrSection.style.display = "block";
        generateLifeLinkQR(profileId);
        form.style.display = "none";
        qrSection.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        console.error("Registration error:", error);
        message.innerHTML = `<div class="error-message">❌ ${escapeHtml(getFriendlyError(error))}</div>`;
        registerButton.disabled = false;
        registerButton.textContent = "Create Account";
    }
}

function createProfileId() {
    return "LLQ-" + crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function generateLifeLinkQR(profileId) {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer || typeof QRCode === "undefined") return;
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: JSON.stringify({ app: "LifeLinkQR", profileId }),
        width: 240,
        height: 240,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

function getProfessionName(role) {
    return { doctor: "Doctor", police: "Police Officer", educator: "Educator", civilian: "Civilian" }[role] || role;
}

function getFriendlyError(error) {
    const messages = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/network-request-failed": "Network error. Check your internet connection and try again.",
        "permission-denied": "Firebase denied the database write. Make sure the Firestore rules are deployed."
    };
    return messages[error.code] || error.message || "Registration failed.";
}

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
