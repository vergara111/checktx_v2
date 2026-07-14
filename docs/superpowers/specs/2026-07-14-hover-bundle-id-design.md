# Hover Bundle ID Design

## Goal

Show the Jito bundle ID on a second line inside the existing green hover notification. Display it in shortened form using the first three and last three characters, for example `4ca...e7e`.

## Scope

- Change only the successful Jito-bundle state rendered by `showHoverNotification()` in `content.js`.
- Preserve the current first line, notification position, green styling, Jito Explorer URL, and non-bundle state.
- Do not change the injected Solscan `Landed By` row or the background API response.

## Design

Add a small formatter that accepts a bundle ID and returns its shortened display value. A normal ID uses the `abc...xyz` format. A missing or non-string ID produces no second line. An ID of six characters or fewer remains unchanged so the formatter never expands or obscures a short value.

For a successful bundle response, the notification contains:

1. The existing linked status text on the first line.
2. A separate block-level element on the second line containing the shortened `response.bundleId`.

The second line is display-only. Existing hover behavior remains unchanged, including the notification's `pointer-events: none` setting.

## Data Flow

`background.js` already returns both `bundleUrl` and `bundleId`. `showHoverNotification()` reads `response.bundleId`, formats it, and appends the second line when a display value is available. It does not parse the ID from the URL.

## Testing

Extend the existing VM-backed DOM regression test to verify:

- the formatter produces `4ca...e7e` for the example bundle ID;
- the green hover notification renders the current status on the first line;
- the shortened bundle ID appears in a distinct second-line element;
- a response without a bundle ID does not render an empty second line.

Run the existing DOM test, JavaScript syntax checks, and `git diff --check` after implementation.
