# Chat Deep-Link Autosend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a URL deep-link entry point that fills the chat composer and optionally sends the prompt automatically.

**Architecture:** A small parser in `lib/chatDeepLink.ts` turns the current URL into a normalized action. `components/ChatInterface.tsx` consumes that action once after conversation/API readiness and delegates sending to the existing submit flow.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Node built-in test runner.

---

### Task 1: URL Parser

**Files:**

- Create: `lib/chatDeepLink.ts`
- Create: `lib/chatDeepLink.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChatDeepLinkAction } from './chatDeepLink.ts';

test('parseChatDeepLinkAction fills prompt from search params without autosend by default', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello%20world'),
    { prompt: 'hello world', autoSend: false }
  );
});

test('parseChatDeepLinkAction enables autosend only for autoSend=1', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello&autoSend=1'),
    { prompt: 'hello', autoSend: true }
  );
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello&autoSend=true'),
    { prompt: 'hello', autoSend: false }
  );
});

test('parseChatDeepLinkAction reads hash params when search params are absent', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/#prompt=hash%20prompt&autoSend=1'),
    { prompt: 'hash prompt', autoSend: true }
  );
});

test('parseChatDeepLinkAction prefers search params over hash params', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=search#prompt=hash&autoSend=1'),
    { prompt: 'search', autoSend: false }
  );
});

test('parseChatDeepLinkAction ignores empty prompts and invalid urls', () => {
  assert.equal(parseChatDeepLinkAction('https://chat.example.com/?prompt=%20%20'), null);
  assert.equal(parseChatDeepLinkAction('not a url'), null);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `lib/chatDeepLink.ts` does not exist.

- [ ] **Step 3: Implement parser**

```typescript
export interface ChatDeepLinkAction {
  prompt: string;
  autoSend: boolean;
}

function parseHashParams(hash: string): URLSearchParams {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(normalizedHash.startsWith('?') ? normalizedHash.slice(1) : normalizedHash);
}

export function parseChatDeepLinkAction(urlValue: string): ChatDeepLinkAction | null {
  let url: URL;

  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  const searchPrompt = url.searchParams.get('prompt');
  const hashParams = parseHashParams(url.hash);
  const prompt = (searchPrompt ?? hashParams.get('prompt') ?? '').trim();

  if (!prompt) {
    return null;
  }

  const autoSendValue = searchPrompt !== null
    ? url.searchParams.get('autoSend')
    : hashParams.get('autoSend');

  return {
    prompt,
    autoSend: autoSendValue === '1',
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: PASS for all parser tests and existing settings tests.

### Task 2: Chat Component Integration

**Files:**

- Modify: `components/ChatInterface.tsx`

- [ ] **Step 1: Import parser and add refs**

Add `useEffect` already exists in the file; import `parseChatDeepLinkAction` from `@/lib/chatDeepLink`. Add refs to track one-time action handling.

- [ ] **Step 2: Extract submit helper**

Move the existing `handleSubmit` body into a reusable `submitPrompt(promptText: string)` helper that contains the same validation and send logic. Keep `handleSubmit` as a thin form-event wrapper.

- [ ] **Step 3: Apply deep-link action once**

Add an effect that:

```typescript
useEffect(() => {
  if (deepLinkActionHandledRef.current || !conversation || !apiConfig) return;

  const action = parseChatDeepLinkAction(window.location.href);
  if (!action) return;

  deepLinkActionHandledRef.current = true;
  setInput(action.prompt);

  if (action.autoSend) {
    void submitPrompt(action.prompt);
  }
}, [apiConfig, conversation, submitPrompt]);
```

- [ ] **Step 4: Validate integration**

Run: `npm run lint`

Expected: PASS with no hook dependency errors.

### Task 3: Documentation And Final Verification

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/planning.md`
- Modify: `docs/execution/chat-deep-link-autosend.md`

- [ ] **Step 1: Document stable behavior**

Update architecture to mention the deep-link parser and one-time chat action. Update planning completed work after validation.

- [ ] **Step 2: Run final commands**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Mark execution document complete**

Update `docs/execution/chat-deep-link-autosend.md` with commands, outcomes, and any remaining manual deployment check.
