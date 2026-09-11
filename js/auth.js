import {
    auth,
    db
} from "./firebase.js";

import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


const form =
    document.getElementById("loginForm");

const message =
    document.getElementById("message");


form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const email =
            document
                .getElementById("email")
                .value
                .trim();


        const password =
            document
                .getElementById("password")
                .value;


        try {

            showMessage(
                "Signing you in...",
                "loading"
            );


            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


            showMessage(
                "Login successful!",
                "success"
            );


            setTimeout(() => {

                window.location.href =
                    "dashboard.html";

            }, 1000);


        } catch (error) {

            console.error(error);


            let errorMessage =
                "Invalid email or password.";


            if (
                error.code ===
                "auth/user-not-found"
            ) {

                errorMessage =
                    "No account exists with this email.";

            }


            if (
                error.code ===
                "auth/wrong-password"
            ) {

                errorMessage =
                    "Incorrect password.";

            }


            showMessage(
                errorMessage,
                "error"
            );

        }

    }
);


function showMessage(text, type) {

    message.textContent = text;

    message.className =
        "message " + type;

}
