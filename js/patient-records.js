import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const recordTypes = [
    { collection: "medicalRecords", element: "medicalRecord", title: "🩺 Medical Information" },
    { collection: "academicRecords", element: "academicRecord", title: "🎓 Academic Information" },
    { collection: "criminalRecords", element: "criminalRecord", title: "👮 Criminal Information" },
    { collection: "civilianRecords", element: "civilianRecord", title: "🆘 Emergency / Civilian Information" }
];

export async function loadPatientRecordStatus(profileId) {
    for (const item of recordTypes) {
        const target = document.getElementById(item.element);
        if (!target) continue;

        try {
            const snapshot = await getDoc(
                doc(db, "profiles", profileId, item.collection, "main")
            );

            target.textContent = snapshot.exists()
                ? `✅ ${item.title} available`
                : `${item.title} has not been added yet.`;
        } catch (error) {
            console.warn(`Unable to read ${item.collection}:`, error);
            target.textContent = "🔒 Record access is currently controlled by Firestore Rules.";
        }
    }
}
