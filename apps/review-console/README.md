# apps/review-console

Minimal attorney review console (Milestone 1). A static page and one script in `public/`, served by the API at `/console`.

- Lists the review queue (`GET /v1/review`) and records decisions (`POST /v1/review/:id/decision`): approve, edit and send, call client, reject.
- Needs an attorney bearer token. In local dev the API prints dev tokens on start.
- Renders all queue text with `textContent` and is served with a strict CSP.
- English-only staff tool for now. It moves into the app (with i18n) once the mobile app is scaffolded.
