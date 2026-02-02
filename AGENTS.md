# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds the Next.js App Router entry points (`page.tsx`, `layout.tsx`, `globals.css`).
- `components/` contains reusable UI building blocks (e.g., `ChatInterface.tsx`, `SettingsModal.tsx`).
- `lib/` provides utilities for API calls, image handling, and local storage (`api.ts`, `imageUtils.ts`, `storage.ts`).
- `types/` defines shared TypeScript types used across the app.
- `public/` stores static assets (icons, SVGs).
- Root config files (`next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`) define framework and tooling behavior.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Next.js dev server on `http://localhost:3000` (binds to `0.0.0.0`).
- `npm run build` creates a production build.
- `npm start` serves the production build locally.
- `npm run lint` runs ESLint with the Next.js config.

## Coding Style & Naming Conventions
- Use TypeScript with `strict` mode (see `tsconfig.json`).
- Indentation is 2 spaces; use single quotes and semicolons (match existing files).
- Component files use `PascalCase` (e.g., `ConversationSidebar.tsx`); variables and functions use `camelCase`.
- Prefer the `@/` alias for imports from the repo root over deep relative paths.

## Testing Guidelines
- No automated test runner is configured yet.
- If adding tests, keep names consistent (e.g., `ComponentName.test.tsx`) and colocate with the source file or in a `__tests__/` folder within the same module.
- Add a `test` script to `package.json` when introducing a framework.

## Commit & Pull Request Guidelines
- Current history uses short, imperative messages (e.g., “migrate to indexedDB”, “fix new chat not saved bug”).
- Keep commits focused and describe the primary change in present tense.
- For PRs, include: a clear summary, steps to verify (`npm run dev` + manual flow), and screenshots for UI changes.

## Security & Configuration Tips
- API keys and conversations are stored in browser `localStorage`; never commit secrets to the repo.
- No `.env` is required for local development; all runtime configuration is handled in the UI.
