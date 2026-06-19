# Bangkok District Analytics

Next.js GIS dashboard for Bangkok district analysis. The app helps officers and
urban analysts start from operational workflows, compare districts, inspect map
layers, read plain-language interpretation, and export supporting evidence.

For future development, start with [AGENTS.md](AGENTS.md). It is the canonical
handoff for architecture, UX principles, active modules, data cautions, and
verification steps.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Common Checks

```bash
npx tsc --noEmit
npx eslint src/app/page.tsx src/components/ui/ViewTabs.tsx src/components/analysis/PlainLanguageGuide.tsx
```

Full-project lint still includes existing technical debt in some older files, so
prefer scoped lint checks when validating a focused change.

## Current Product Direction

- Make the home page a workflow entry point, not a module catalog.
- Keep satellite, open-data, and complaint-source limitations visible.
- Use Thai plain-language explanations for interpretation, with technical terms
  preserved only when useful for auditability.
- Do not change scoring formulas, thresholds, or methodology only to simplify UI.
