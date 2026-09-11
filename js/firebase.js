import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyAdujDCLQZgqsQubuE33EWeE3NN4c8-lss",

    authDomain:
        "lifelink-e3131.firebaseapp.com",

    projectId:
        "lifelink-e3131",

    storageBucket:
        "lifelink-e3131.firebasestorage.app",

    messagingSenderId:
        "466245505757",

    appId:
        "1:466245505757:web:4f59283a36a7fc7a5ac134",

    measurementId:
        "G-H6294GHB4W"

};


const app =
    initializeApp(firebaseConfig);


export const auth =
    getAuth(app);


export const db =
    getFirestore(app);

