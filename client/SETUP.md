# RB Assistant — Setup

Floating desktop-style AI answer window, built with React 19 + TypeScript + Tailwind CSS v4 on TanStack Start.

## Requirements

- Node.js 20+ (or Bun 1.1+)

## Install & run

```bash
bun install      # or: npm install
bun run dev      # or: npm run dev
```

The app runs at http://localhost:8080.

## Build

```bash
bun run build
bun run start
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/routes/__root.tsx` | HTML shell, global head tags, Google Fonts links |
| `src/routes/index.tsx` | Home route — desktop backdrop + assistant window |
| `src/components/RBAssistantWindow.tsx` | The window: header, answer body, footer, resize logic |
| `src/styles.css` | Design system — color tokens (oklch), fonts, glass/chrome classes |

## Design system

All colors, shadows and glass effects are defined as tokens and `rb-*` classes in `src/styles.css`.
Fonts: Plus Jakarta Sans (UI) and JetBrains Mono (code), loaded via `<link>` in the root route.

## Features

- Size presets S / M / L with animated width+height transitions
- Free drag-resize from the bottom-right grip (380–1100 × 340–900 px), auto-syncing the preset
- Live dimension readout in the footer
- `Shift + Space` triggers a simulated new capture
- Copy Answer button with transient "Copied!" feedback
