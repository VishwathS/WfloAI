# FlowAI

FlowAI is a Phase 1 scaffold for an AI-first visual workflow builder built with Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, and Supabase.

## Features

- Google OAuth login with Supabase Auth
- Protected dashboard routes
- Workflow listing and creation
- Placeholder workflow canvas page
- Supabase SQL migration with row-level security

## Prerequisites

- Node.js 18.18+ or 20+
- A Supabase project

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and fill in your Supabase values:

```bash
cp .env.local.example .env.local
```

3. In Supabase Authentication:

- Enable the Google provider
- Add `http://localhost:3000/auth/callback` as an authorized redirect URL

4. Run the SQL migration in your Supabase project:

- Open the SQL editor in Supabase
- Run the contents of [supabase/migrations/202605140001_init_flowai.sql](/c:/Users/vishw/wflo-AI/supabase/migrations/202605140001_init_flowai.sql:1)

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:3000`

## Project Structure

- `app/(auth)/login/page.tsx`: login page
- `app/auth/callback/route.ts`: OAuth callback handler
- `app/(dashboard)/page.tsx`: dashboard
- `app/(dashboard)/workflows/[id]/page.tsx`: workflow placeholder page
- `components/ui`: shadcn-style UI components
- `lib/supabase.ts`: browser Supabase client
- `lib/supabase/server.ts`: server and middleware Supabase clients
- `lib/types.ts`: shared workflow types
- `middleware.ts`: route protection

## Notes

- Phase 1 does not include React Flow or AI node execution.
- Workflow graph data is stored as JSON and starts with empty `nodes` and `edges` arrays.
