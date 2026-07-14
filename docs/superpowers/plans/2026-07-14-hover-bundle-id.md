# Hover Bundle ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Jito bundle ID as a shortened second line in the existing green Solscan hover notification.

**Architecture:** Keep the existing background response and hover-notification flow. Add one pure formatter in `content.js`, then let `showHoverNotification()` append a dedicated block element only when `response.bundleId` is usable; cover both formatting and DOM output in the existing VM-backed regression test.

**Tech Stack:** Chrome extension content script, browser DOM APIs, Node.js `assert` and `vm` test harness.

## Global Constraints

- Display normal bundle IDs with exactly the first three and last three characters, for example `4ca...e7e`.
- Preserve the current first line, notification position, green styling, Jito Explorer URL, non-bundle state, and `pointer-events: none` behavior.
- Do not change the injected Solscan `Landed By` row, `background.js`, or the API contract.
- Omit the second line for a missing or non-string bundle ID; preserve IDs of six characters or fewer unchanged.

---

## File Structure

- Modify `content.js`: own the pure bundle-ID formatter and successful hover-notification DOM.
- Modify `tests/custom-row-layout.test.js`: expose the formatter from the VM sandbox and verify formatting plus the two-line DOM contract.

### Task 1: Format and render the hover bundle ID

**Files:**
- Modify: `content.js:134-184`
- Test: `tests/custom-row-layout.test.js:123-209`

**Interfaces:**
- Consumes: `response.bundleId` from the existing successful `fetchJitoBundle` response.
- Produces: `shortenBundleId(bundleId): string` and an optional `#jito-hover-bundle-id` child inside `#jito-hover-notification`.

- [x] **Step 1: Write the failing formatter and DOM regression**

Expose the formatter from `buildRuntime()`:

```js
return {
  document,
  extractSignatureFromLink: sandbox.extractSignatureFromLink,
  insertCustomDiv: sandbox.insertCustomDiv,
  shortenBundleId: sandbox.shortenBundleId,
  showHoverNotification: sandbox.showHoverNotification,
};
```

Add a successful-bundle test after the existing non-bundle hover-position test:

```js
{
  const { document, shortenBundleId, showHoverNotification } = buildRuntime();
  const bundleId = '4caf8725c75b31a6982a46a9330963156cad22c8c9bd94f9c0d62d4bdf604e7e';
  const anchor = document.createElement('a');
  anchor.getBoundingClientRect = () => ({
    left: 100,
    top: 80,
    width: 24,
    height: 18,
    right: 124,
    bottom: 98,
  });

  assert.equal(shortenBundleId(bundleId), '4ca...e7e');
  assert.equal(shortenBundleId('abc123'), 'abc123');
  assert.equal(shortenBundleId(), '');

  showHoverNotification({
    isBundle: true,
    validatorTip: '0.001',
    bundleUrl: `https://explorer.jito.wtf/bundle/${bundleId}`,
    bundleId,
  }, anchor);

  const notification = document.getElementById('jito-hover-notification');
  const bundleIdLine = document.getElementById('jito-hover-bundle-id');
  assert.equal(notification.children[0].textContent, '✓ Jito bundle (tip: 0.001)');
  assert.ok(bundleIdLine, 'bundle ID should render on a separate line');
  assert.equal(bundleIdLine.tagName, 'DIV');
  assert.equal(bundleIdLine.textContent, '4ca...e7e');

  showHoverNotification({
    isBundle: true,
    validatorTip: '0.001',
    bundleUrl: 'https://explorer.jito.wtf/',
  }, anchor);
  assert.equal(
    document.getElementById('jito-hover-bundle-id'),
    null,
    'missing bundle IDs should not create an empty second line'
  );
}
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
node tests/custom-row-layout.test.js
```

Expected: FAIL with `TypeError: shortenBundleId is not a function`, proving the new formatter and DOM behavior do not exist yet.

- [x] **Step 3: Add the minimal formatter and second-line DOM**

Add the pure helper immediately before `showHoverNotification()`:

```js
function shortenBundleId(bundleId) {
  if (typeof bundleId !== 'string' || bundleId.length === 0) {
    return '';
  }

  if (bundleId.length <= 6) {
    return bundleId;
  }

  return `${bundleId.slice(0, 3)}...${bundleId.slice(-3)}`;
}
```

After `notification.appendChild(adLink)` in the successful Jito-bundle branch, append the optional second line:

```js
const shortenedBundleId = shortenBundleId(response.bundleId);
if (shortenedBundleId) {
  const bundleIdLine = document.createElement('div');
  bundleIdLine.id = 'jito-hover-bundle-id';
  bundleIdLine.textContent = shortenedBundleId;
  bundleIdLine.style.marginTop = '2px';
  notification.appendChild(bundleIdLine);
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node tests/custom-row-layout.test.js
```

Expected: PASS with `custom row layout contract ok` and no warnings or errors.

- [x] **Step 5: Run syntax and whitespace verification**

Run:

```bash
node --check content.js
node --check background.js
git diff --check
```

Expected: all three commands exit with status 0 and produce no error output.

- [x] **Step 6: Review the scoped diff**

Run:

```bash
git diff -- content.js tests/custom-row-layout.test.js
```

Expected: only the formatter, successful hover-notification second line, VM export, and focused regression assertions are changed; the `Landed By` row and background request logic remain untouched.

- [x] **Step 7: Commit the implementation**

```bash
git add content.js tests/custom-row-layout.test.js docs/superpowers/plans/2026-07-14-hover-bundle-id.md
git commit -m "Show bundle ID in hover notification"
```
