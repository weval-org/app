# Contributing to Weval

Thanks for your interest in contributing! This guide covers how to report bugs and get involved.

## Reporting Bugs

Before filing a bug report, locate your **Blueprint ID** — you can find it in your dashboard URL or on the settings page. This is required for us to reproduce your issue.

File a bug report here: [**Open a new issue**](https://github.com/weval-org/app/issues/new/choose)

All fields marked as required must be filled out. The more detail you provide (steps to reproduce, console logs, screenshots), the faster we can help.

## Development Setup

### Prerequisites

- Node.js 18 (see `.nvmrc`)
- pnpm 9.6.0 (see `packageManager` in `package.json`)
- API keys for the model providers you want to test

### Install and configure

```bash
cp .env.template .env
pnpm install
```

The following variables are required for most local work:

- `STORAGE_PROVIDER` (`local` or `s3`)
- `GITHUB_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and
  `SESSION_SECRET` for authentication and the Sandbox Studio
- At least one provider key: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`,
  `ANTHROPIC_API_KEY`, `X_API_KEY`, or another configured provider

`APP_S3_*`, `SENTRY_*`, and analytics keys are optional unless you are testing
S3, Sentry, or analytics behavior. Set `URL` and `NEXT_PUBLIC_APP_URL` to
`http://localhost:3172` for local development.

### Run the app

```bash
pnpm dev
```

The web app runs on port `3172`.

### Run the CLI

```bash
pnpm cli <command> --help
```

The CLI entrypoint is `src/cli/index.ts`; use `pnpm cli --help` to list the
available commands.

### Run tests and checks

```bash
pnpm test:web
pnpm test:cli
pnpm test:e2e
pnpm typecheck
pnpm lint
```

The pre-commit hook runs lint-staged, so typecheck and lint are expected before
opening a PR.

### Author and validate a blueprint

Blueprints follow [BLUEPRINT_FORMAT.md](docs/BLUEPRINT_FORMAT.md). You can use
the Sandbox Studio at `http://localhost:3172/sandbox` or run the CLI against a
local blueprint file to validate it before submitting a PR.

## Code of Conduct

We follow standard open source community norms. Be respectful, constructive, and collaborative.
