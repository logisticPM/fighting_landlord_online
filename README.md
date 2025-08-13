### Landlord Online (Demo)

Three-player online Dou Dizhu demo built from the existing assets and rules. Authoritative server with Socket.IO; thin PIXI client that reuses the sprite sheet loader.

Prerequisites
- Node.js 18+

Setup
- Copy assets: copy the folder `landlord/public/GameAssets` to `landlord_online/client/public/GameAssets` (keep the same structure)
- Start server: `cd server && npm i && npm run dev`
- Start client: `cd client && npm i && npm run dev`
- Open three browser tabs, enter the same room ID to play

Notes
- Bidding is simplified: landlord is assigned randomly for the demo; 3 bottom cards go to the landlord
- Supported combinations: single, pair, triple, triple+single, triple+pair, bomb, rocket
- Server is authoritative and validates every play, broadcasting state snapshots

Deploy (Azure quick start)
- Backend (Azure Web App)
  - Create Web App (Linux, Node 18), enable WebSockets
  - GitHub Secrets: `AZURE_WEBAPP_PUBLISH_PROFILE`, `WEBAPP_NAME`
  - Push to main; `.github/workflows/server.yml` builds and deploys `landlord_online/server`
- Frontend (Azure Storage Static Website)
  - GitHub Secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `STORAGE_ACCOUNT`, `VITE_SERVER_URL`
  - Push to main; `.github/workflows/client.yml` builds and uploads `landlord_online/client/dist`

Local env templates
- `client/.env.example`: `VITE_SERVER_URL=https://<your-webapp>.azurewebsites.net`
- `server/.env.example`: `PORT=5179`
