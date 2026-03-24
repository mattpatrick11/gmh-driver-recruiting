# GMH Driver Recruiting CRM

A clean, professional driver recruiting CRM built for GitHub Pages. Manage company drivers and owner-operators, track pipeline status, log touchpoints, send SMS, and share documents — all in one place.

---

## 🚀 Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/mattpatrick11/gmh-driver-recruiting.git
cd gmh-driver-recruiting
```

### 2. Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com) and sign in (free tier works great)
2. Click **New Project** → fill in name, password, region → Create
3. Wait ~2 minutes for the project to provision

### 3. Run the Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Open `supabase/schema.sql` from this repo
3. Paste the entire contents and click **Run**
4. This creates all tables and inserts default SMS templates

### 4. Add Your Credentials to `config.js`

1. In Supabase, go to **Settings → API**
2. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key

3. Open `config.js` in this repo and replace:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 5. Deploy the SMS Edge Function

This keeps your Twilio keys server-side and never exposes them in the browser.

**Install Supabase CLI:**
```bash
npm install -g supabase
```

**Log in and link your project:**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```
(Find `YOUR_PROJECT_REF` in Supabase → Settings → General → Reference ID)

**Set your Twilio secrets:**
```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set TWILIO_PHONE_NUMBER=+15550000000
```

**Deploy the function:**
```bash
supabase functions deploy send-sms
```

### 6. Enable GitHub Pages

1. Push your changes:
```bash
git add config.js
git commit -m "Add Supabase credentials"
git push
```

2. In your GitHub repo → **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / `/ (root)` → Save

Your app will be live at: `https://mattpatrick11.github.io/gmh-driver-recruiting/`

---

## 📋 Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Stats: total applicants, hired, pipeline, overdue follow-ups |
| **Company Drivers** | Full driver cards with search, filter, and profile modal |
| **Owner Operators** | Separate view for independent contractors |
| **Driver Profiles** | Status pipeline, editable fields, checklist, touchpoint history |
| **SMS Center** | Send templated messages, view history, manage templates |
| **Documents** | Share links to forms, handbooks, and rate sheets |

## 🔄 Status Pipeline

```
Applied → Contacted → Docs Sent → Offer Extended → Hired
                                                  ↘ Not Interested
```

## ✅ Onboarding Checklists

**Company Drivers:** Application, MVR, PSP, Employment Verification, Drug Test Scheduled, Drug Test Passed, Orientation, Onboarding

**Owner Operators:** Application, Authority Verified, Insurance, W-9, Rate Agreement, Load Board, First Load

---

## 🛠 Tech Stack

- **Frontend:** Pure HTML + Tailwind CSS CDN + Vanilla JS
- **Database:** Supabase (PostgreSQL)
- **SMS:** Twilio via Supabase Edge Function (Deno)
- **Hosting:** GitHub Pages

No build step. No dependencies to install. Just open and use.

---

## 🔒 Security Notes

- Supabase anon key is safe to expose in client-side code — it's designed for this
- Twilio credentials are stored as Supabase Edge Function secrets (never in the browser)
- For production, consider enabling Supabase Row Level Security (RLS) with auth
- See commented-out RLS lines at the bottom of `supabase/schema.sql`

---

## 📞 Support

Built by OpenClaw for GMH Transportation. Questions? Contact matt@gmhtrans.com
