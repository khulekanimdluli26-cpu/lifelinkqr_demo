LIFELINKQR - PROFESSION-BASED ACCESS

CORE SECURITY MODEL
-------------------
The QR code contains only the LifeLinkQR profile ID.
It does NOT contain medical, criminal, academic or civilian records.

The authenticated scanner's profession determines which single protected
Firestore subcollection is requested:

Doctor       -> profiles/{profileId}/medicalRecords/main
Police       -> profiles/{profileId}/criminalRecords/main
Educator     -> profiles/{profileId}/academicRecords/main
Civilian     -> profiles/{profileId}/civilianRecords/main

The frontend only requests the permitted collection, and Firestore rules
independently enforce the same restriction. Hiding fields in the frontend
is not treated as security.

FIRESTORE TEST STRUCTURE
------------------------
For a test profile LLQ-12345678, create:

profiles/LLQ-12345678
  name: "Test Learner"
  profileId: "LLQ-12345678"
  uid: "OWNER_FIREBASE_UID"
  accountStatus: "active"

profiles/LLQ-12345678/medicalRecords/main
  bloodType: "O+"
  allergies: "Penicillin"
  medicalConditions: "None"

profiles/LLQ-12345678/criminalRecords/main
  recordStatus: "No record"
  caseHistory: "None"

profiles/LLQ-12345678/academicRecords/main
  grade: "10"
  mathematics: "78%"
  physicalSciences: "82%"

profiles/LLQ-12345678/civilianRecords/main
  emergencyContact: "Test Contact"
  emergencyPhone: "0000000000"

EXPECTED RESULT
---------------
1. Login as a doctor and scan LLQ-12345678:
   Only medicalRecords/main can be read.

2. Login as police and scan the SAME QR:
   Only criminalRecords/main can be read.

3. Login as an educator and scan the SAME QR:
   Only academicRecords/main can be read.

4. Login as a civilian and scan the SAME QR:
   Only civilianRecords/main can be read.

IMPORTANT SECURITY NOTE
-----------------------
For a production system, scanner professions should be verified by an admin
or trusted backend and should not rely only on a self-selected registration
role. The current demo prevents a user from changing their role after the
user document is created, but an unverified user can still choose a role when
registering. Production deployment should use Firebase custom claims or an
admin-managed authorised-scanner collection.

FIRESTORE RULES
---------------
Deploy firestore.rules to the SAME Firebase project used by js/firebase.js.

TESTING
-------
Use VS Code Live Server (localhost) or a deployed HTTPS site.
Camera access normally requires HTTPS or localhost.

IMPORTANT FIX FOR DEMO DATA
---------------------------
The administrator must deploy the included firestore.rules. The rules allow only an administrator to create/update/delete protected demo records, while approved scanners can read only their authorised category.

If scanning LLQ-DEMO2026 finds the profile but says the authorised record does not exist, login as an administrator, open admin.html, and click Create / Reset Demo Patient. Then scan the same QR again with an approved doctor/police/educator/civilian account.
