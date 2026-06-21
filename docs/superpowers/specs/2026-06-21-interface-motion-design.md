# Interface Motion Design

## Goal

Add restrained, consistent motion throughout ChemVault Files so windows, expanding content, selection changes, and inspector transitions communicate state without feeling rigid or overly playful.

The motion language takes interaction cues from 21st.dev dialog and accordion components, adapted to this Astro and vanilla TypeScript codebase without importing their React or Tailwind implementations.

## Scope

The first implementation covers:

- Account, role-permission, and upload modals.
- Sidebar folder navigation and other expandable inline sections.
- Upload, sharing, and inspector content that expands or changes state.
- Inspector tab content transitions.
- File-list rows, file cards, buttons, and selected states.
- Desktop and responsive mobile layouts.

## Motion Language

The design uses a calm, utility-focused visual response:

- Modal overlay: opacity only.
- Modal surface: 8px upward movement plus scale from 0.98 to 1.
- Inline expand/collapse: opacity, height, and a 90-degree chevron rotation.
- Content replacement: 4px vertical movement plus opacity.
- Hover and selection: border, background, and shadow changes only; no positional jumps.

Timing and easing:

| Interaction | Duration | Easing |
| --- | ---: | --- |
| Hover, selection, focus | 120–160ms | ease-out |
| Inline expand/collapse | 180ms | cubic-bezier(.22, 1, .36, 1) |
| Modal open/close | 220ms | cubic-bezier(.22, 1, .36, 1) |
| Inspector content change | 160ms | cubic-bezier(.22, 1, .36, 1) |

No spring dynamics, bounce, overshoot, continuous looping, or high-amplitude motion will be used.

## Architecture

### CSS

Add a focused motion token and keyframe section to src/styles/chemvault-files.css.

- Shared custom properties define timing, easing, and distance.
- State attributes select entry and exit styles.
- Existing visual styles remain the source of truth for color, spacing, and layout.
- A prefers-reduced-motion rule removes movement and leaves short opacity changes only.

### TypeScript

Add small, reusable modal lifecycle helpers in src/scripts/chemvault-files.ts.

- Opening makes a modal visible, assigns an opening state, and transitions it to open.
- Closing assigns a closing state and waits for the surface animation to finish before restoring hidden.
- Existing focus placement and Escape/scrim handlers continue to use the same public open/close functions.

For dynamic content, render functions will assign an entry state/class only where content is replaced. This avoids global animations on polling, loading, and incidental re-renders.

## Accessibility and Failure Handling

- Respect prefers-reduced-motion.
- Preserve current focus behavior; initial modal focus happens after visibility is restored.
- Esc and scrim close actions remain available during animation, but duplicate transitions are ignored.
- A timed fallback hides a closing modal if an animation event is unavailable.
- The UI remains fully usable if CSS animation is disabled or unsupported.

## Verification

Automated checks:

- Unit tests cover modal state transitions and the no-motion fallback where practical.
- Existing npm run check remains green.

Rendered QA:

1. Open and close account, role, and upload modals.
2. Select files, switch inspector tabs, and open expandable controls.
3. Verify the same flows at desktop and mobile widths.
4. Confirm no console errors, focus regressions, clipped panels, or stuck overlays.
5. Confirm reduced-motion settings remove transform-based movement.

## Non-goals

- No new animation dependency.
- No redesign of the visual system.
- No changes to authorization, upload, library, or persistence behavior.
