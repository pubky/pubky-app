[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pubky/pubky-app)

# Pubky web app

## Prerequisites

- Node.js (see [.nvmrc](./.nvmrc) for the recommended version)

## Getting Started

First, install the dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Dependency install scripts

npm 11.16+ gates dependency lifecycle scripts (`preinstall` / `install` / `postinstall`) behind the `allowScripts` field in `package.json`: npm 11 warns about unapproved scripts but still runs them, npm 12 skips them. The five packages listed there are approved by name (any version), which matches how the project has always installed. `cypress` needs its script to download the Cypress binary; the `sharp`, `@sentry/cli`, and `unrs-resolver` scripts are fallbacks that only do work when their prebuilt platform package is missing; `browser-tabs-lock` only prints a message. Any new dependency with an install script is still flagged (npm 11 warns, npm 12 skips it and the install may break); review it with `npm install-scripts ls` and, if it is legitimate, add it with `npm install-scripts approve <pkg> --no-allow-scripts-pin`.

## Environment Variables

Copy the example environment file and adjust the values as needed:

```bash
cp .env.example .env
```

See [docs/environment.md](./docs/environment.md) for more details.

## Common Workflows

- Check architecture and coding conventions: [docs/README.md](./docs/README.md)
- Run local code review workflow (Cursor): use `/review` (defined in `.cursor/skills/code-review/SKILL.md`)
- Follow commit message format: [docs/commit-message.md](./docs/commit-message.md)

## License

This project is licensed under the MIT License.  
See the [LICENSE](./LICENSE) file for more details.
