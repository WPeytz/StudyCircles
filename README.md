# StudyCircles — MVP (Vue 3 + Vite)

A lean starter you can run in VS Code to validate:
- Resource uploads (via Supabase Storage)
- Study groups
- Ask-a-question with AI (mocked endpoint by default)

## 🚀 Quickstart

**Prereqs:** Node.js 18+

```bash
cd studycircles-mvp
npm install
npm run dev
```

Open the URL that Vite prints (default: http://localhost:5173).

## 🔐 Environment (optional but recommended)

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# Optional: your serverless function that proxies to your LLM
VITE_AI_ENDPOINT=https://your-domain.com/api/ask
```

> In Supabase, create a **public bucket** named `resources` to enable uploads.

## 🧱 Project Structure

```
studycircles-mvp/
├─ public/
├─ src/
│  ├─ assets/           # base CSS
│  ├─ components/       # shared UI (NavStat)
│  ├─ pages/            # Home, Resources, Groups, Ask, Profile
│  ├─ services/         # supabase client + AI client
│  ├─ App.vue
│  ├─ main.js
│  └─ router.js
├─ index.html
├─ package.json
├─ vite.config.js
└─ README.md
```

## 🧠 Notes

- **AI**: `Ask.vue` uses a mocked response unless `VITE_AI_ENDPOINT` is set.
- **Auth**: Not wired for speed. Add Supabase Auth when you want profiles & gating.
- **Uploads**: `Resources.vue` uploads to the `resources` bucket if Supabase env vars are present.

## ✅ Next Steps After Validation

- Add university → course taxonomy and search.
- Upvotes, comments, and moderation.
- Tutor marketplace and study-session scheduling.
- Serverless API for AI answers and safe key handling.
```