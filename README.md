# Personal Gemini Journal & Growth Intelligence

A production-grade, secure, multi-turn AI journal application powered by **Google Gemini 3 models**, **Firebase Authentication with Google Sign-In**, **Cloud Firestore per-user data isolation**, and **Cloud Run** backend gateway.

---

## Threat Summary Table (5 Threat Zones)

| Threat Zone | Identified Threat / Vulnerability | Architectural & Code-Level Countermeasure |
|---|---|---|
| **Input Surfaces** | Malicious injection in journal prompts, oversized payloads, prompt injection attempts | Strict schema validation, string sanitization (`slice(0, 10000)`), defensive destructuring, and payload length limits on Express gateway. |
| **Planning & Reasoning** | System instruction bypass, jailbreaks, prompt hijacking | Context separation with explicit `systemInstruction`, structured JSON schemas (`responseMimeType: application/json`), and multi-model fallback ladder (`gemini-3.7-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest`). |
| **Tool / Execution** | Unauthorized API access, server-side credential leakage | Zero client-side API keys. Server-side token verification using Firebase Admin SDK. Secrets managed via Google Cloud Secret Manager. |
| **Memory & State** | Cross-user data leakage, unauthorized reads/writes in database | Strict per-user Firestore isolation (`/users/{userId}/**`). Enforced owner-bound security rules (`request.auth.uid == userId`) and client-side database subscriptions. |
| **Inter-System Comms** | Insecure token handling, Man-in-the-Middle token theft | Authorization Bearer header authentication, HTTPS enforcement on Cloud Run, and strict CORS/origin restrictions. |

---

## Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    React + Vite Frontend                    │
│   • Google Sign-In via Firebase Auth                        │
│   • Real-Time Firestore Synchronization (/users/{userId}/*)  │
│   • Personal Growth Intelligence Visualizer (Recharts)      │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
     Bearer ID Token               Firestore Rules
     + AI Requests                (isOwner: uid == userId)
               │                              │
               ▼                              │
┌──────────────────────────────┐              │
│       Cloud Run Gateway      │              │
│   • Express.js / Node.js     │              │
│   • Firebase Admin Auth JWT  │              │
│   • Secret Manager Access    │              │
│   • Gemini Resilient Ladder  │              │
└──────────────┬───────────────┘              │
               │                              │
         Gemini API                           │
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      Google Gemini Models    │ │       Cloud Firestore      │
│   • gemini-3.7-flash         │ │   /users/{userId}          │
│   • gemini-3.1-flash-lite    │ │     ├── /entries/{id}      │
│   • gemini-flash-latest      │ │     │     └── /messages/{id│
└──────────────────────────────┘ │     └── /insights/{id}     │
                                 └────────────────────────────┘
```

---

## 1. Prerequisites & GCP Setup

1. **Install and authenticate Google Cloud SDK**:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable required Google Cloud APIs**:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     secretmanager.googleapis.com \
     firestore.googleapis.com \
     aiplatform.googleapis.com
   ```

---

## 2. Secret Management Setup

Create the server-side `GEMINI_API_KEY` secret in Google Cloud Secret Manager:

```bash
# Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant default Cloud Run compute service account access
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Firestore Security Rules

Deploy the owner-bound security rules to ensure zero cross-user exposure:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    // User Profile Document
    match /users/{userId} {
      allow read, write: if isOwner(userId);

      // User's Journal Entries
      match /entries/{entryId} {
        allow read, write: if isOwner(userId);

        // Turn Messages in an entry
        match /messages/{messageId} {
          allow read, write: if isOwner(userId);
        }
      }

      // Personal Growth Intelligence Reports
      match /insights/{insightId} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

---

## 4. Cloud Run Deployment Flow

Build and deploy the application container to Cloud Run with automated secret mounting and campaign verification labels:

```bash
# Build and deploy service to Cloud Run
gcloud run deploy personal-gemini-journal \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars=NODE_ENV=production \
  --update-labels=dev-tutorial=cloud-run-ai-challenge
```

---

## 5. End-to-End Functional Verification Walkthrough

| Test Case ID | Feature / User Interaction | Steps to Verify | Expected Outcome |
|---|---|---|---|
| **TC-01** | Google Sign-In & Auth State | Click "Sign in with Google Account", select account in popup. | Session establishes, redirects to dashboard, creates/syncs user profile under `/users/{uid}`. |
| **TC-02** | Create Reflection & Initial AI Turn | Click "New Reflection", choose mood (e.g. "Reflective"), type prompt, submit. | Modal calls `/api/ai/initial-reflection`, persists entry + messages to Firestore, opens thread view. |
| **TC-03** | Multi-Turn Conversation | In active thread view, type follow-up question and hit Send. | Backend processes history with Gemini fallback ladder, streams/saves new turn to subcollection `/users/{uid}/entries/{id}/messages`. |
| **TC-04** | Structured Summarization | Click "Summarize" in active conversation thread. | Server generates executive summary, mood categorization, and tags; updates entry doc. |
| **TC-05** | Growth Intelligence Report | Click "Growth Intelligence" tab, select 7/30/90 days, click "Generate New Report". | Analyzes journal entries, extracts recurring themes, emotional stability score, blockers, and next steps with Recharts visualizer. |
| **TC-06** | Export & Security Inspection | Click "Privacy Architecture" modal, then click JSON Export button. | Security modal displays architecture details; JSON file containing all personal entries and insights downloads cleanly. |
| **TC-07** | Deletion & Cleanup | Click trash icon on an entry card or thread view, confirm deletion. | Entry document and all message subcollection docs are deleted atomically via batch write. |
