import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

console.log("LifeLinkQR login system loaded");

const form = document.getElementById("loginForm");
const message = document.getElementById("message");
const loginButton = form?.querySelector('button[type="submit"]');

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value || "";

  if (!email || !password) {
    message.textContent = "Please enter your email and password.";
    return;
  }

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";
  }
  message.textContent = "Signing in securely...";

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const uid = result.user.uid;

    console.log("Firebase Authentication successful:", uid);
    message.textContent = "Login successful. Checking your LifeLinkQR account...";

    // Admin check: safe because Firestore rules allow a signed-in user
    // to read only their own admins/{uid} document.
    try {
      const adminSnap = await getDoc(doc(db, "admins", uid));
      if (adminSnap.exists()) {
        console.log("Account type: administrator");
        window.location.replace("admin.html");
        return;
      }
    } catch (adminError) {
      // A missing/blocked admin lookup must not prevent normal users from logging in.
      console.warn("Admin lookup skipped:", adminError);
    }

    // Customer accounts live in customers/{uid} and do not necessarily
    // have a users/{uid} document.
    try {
      const customerSnap = await getDoc(doc(db, "customers", uid));
      if (customerSnap.exists()) {
        const customer = customerSnap.data();
        if (customer.accountStatus && customer.accountStatus !== "active") {
          throw new Error("Your customer account is not active.");
        }
        console.log("Account type: customer");
        window.location.replace("customer-dashboard.html");
        return;
      }
    } catch (customerError) {
      // Re-throw an explicit inactive-account error, but tolerate a transient
      // lookup failure and let the professional lookup below decide.
      if (customerError.message === "Your customer account is not active.") {
        throw customerError;
      }
      console.warn("Customer lookup skipped:", customerError);
    }

    // Professional LifeLinkQR accounts live in users/{uid}.
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      throw new Error("Your account information could not be accessed. Please contact the administrator.");
    }

    const userData = userSnap.data();
    const role = String(userData.role || "").trim().toLowerCase();

    if (!role) {
      throw new Error("Your LifeLinkQR account has no profession assigned. Please contact the administrator.");
    }

    const allowedRoles = ["doctor", "police", "educator", "civilian"];
    if (!allowedRoles.includes(role)) {
      throw new Error(`Your account role is not recognised: ${userData.role || "missing"}.`);
    }

    console.log("Account type: professional", { role });
    message.textContent = "Login successful. Opening your professional dashboard...";
    window.location.replace("dashboard.html");
  } catch (error) {
    console.error("LifeLinkQR login error:", error);

    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
      message.textContent = "❌ Incorrect email or password.";
    } else if (error.code === "auth/too-many-requests") {
      message.textContent = "❌ Too many login attempts. Please try again later.";
    } else if (error.code === "auth/network-request-failed") {
      message.textContent = "❌ Network error. Check your internet connection and try again.";
    } else if (error.code === "permission-denied") {
      message.textContent = "❌ Firebase denied access to your account information. Please make sure the latest Firestore rules are deployed.";
    } else {
      message.textContent = "❌ " + (error.message || "Login failed. Please try again.");
    }

    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = "Login";
    }
  }
});
