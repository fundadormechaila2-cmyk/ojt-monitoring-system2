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
Deploy it to the Firebase project configured for the app:

```powershell
firebase deploy --only functions:manageAccount --project ojt-monitoringsystem2
```

For local development without the Cloud Function, set
`VITE_ACCOUNT_API=local` in `.env.local`, configure
`GOOGLE_APPLICATION_CREDENTIALS` to point to a Firebase Admin service-account
JSON file stored outside this repository, then run:

```powershell
npm run account-server
```

The local server listens on `http://127.0.0.1:5055`. Never put Admin service
account credentials in client-side environment variables or commit them.
