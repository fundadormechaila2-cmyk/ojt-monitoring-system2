# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Account management

Account actions use the Firebase `manageAccount` Cloud Function by default.
For local development without Cloud Functions, the trusted local server uses
the Firebase Admin SDK. Create a dedicated service account for the Firebase
project `ojt-monitoringsystem2` with only the Firebase Authentication and
Firestore permissions this server needs. Download its private key to a
location outside this repository (for example,
`C:\secure\ojt-monitoringsystem2-adminsdk.json`). Do not put that key in
frontend environment variables or commit it.

Open a PowerShell terminal in the repository and start the backend:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\ojt-monitoringsystem2-adminsdk.json"
$env:GCLOUD_PROJECT = "ojt-monitoringsystem2"
npm run account-server
```

In a second PowerShell terminal in the repository, start the frontend using the
local backend:

```powershell
$env:VITE_ACCOUNT_API = "local"
npm run dev
```

The backend listens only on `http://127.0.0.1:5055`. Permanent deletion
requires an authenticated, active administrator. The Authentication account
and user profile are removed; the student roster, attendance, OJT hours,
evaluations, and applications remain in Firestore.

To use the deployed Cloud Function instead, deploy it to the configured
project:

```powershell
firebase deploy --only functions:manageAccount,functions:manageAccountApi,hosting --project ojt-monitoringsystem2
```

The first Cloud Functions deployment may require the project owner to enable
the Cloud Build and Artifact Registry APIs. If deployment reports a permission
error enabling either API, the owner can enable them in Google Cloud Console,
then rerun the deploy command above.

The frontend calls `manageAccountApi` with the current Firebase ID token in a
Bearer authorization header. The endpoint verifies that token with Firebase
Admin before invoking the account-management logic. The callable
`manageAccount` remains available for compatibility.
