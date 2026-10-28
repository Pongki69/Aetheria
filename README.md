# Aetheria

A spatial 3D workspace for an AI workforce, with customizable agents, imported models, task conversations, and animation tools.

## Run locally

Install Node.js with npm, then install both projects' dependencies:

```sh
cd ai-office-ui
npm ci
cd ../backend
npm ci
```

Copy `backend/.env.example` to `backend/.env` and configure the providers you want to use. Keep real credentials private. Administrator bootstrap settings, email verification, Sketchfab imports, and local-model settings are documented in the example file. See [backend setup](backend/README.md) for email configuration.

Start each service in a separate terminal:

```sh
cd backend
npm run dev
```

```sh
cd ai-office-ui
npm run dev
```

Open http://localhost:5173. On Windows, `start-dev.bat` can start both services after installation and configuration.

## Build

```sh
cd ai-office-ui
npm run build
```

## Local data

Browser workspaces and imported assets use local browser storage. Backend account data is stored in `backend/data/`. Local account data, uploaded files, API keys, and generated builds are excluded from this repository. A fresh checkout needs its own configuration and accounts.

Model assets retain their original creators' rights; inclusion does not grant a license to third-party content.
