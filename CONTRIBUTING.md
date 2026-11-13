# Contributing

Thanks for helping! The flow is simple:

1. **Start from an issue.** Open one (bug or feature) or pick an existing one, so we agree on what to build before code is written.
2. **One branch per issue**, named `oct-<number>-<short-name>`, branched from `main`. Never push to `main` directly.
3. **Keep the change small** and focused on the issue. Non-trivial logic comes with a test.
4. **Commit messages** in English: `OCT-<number> what changed`.
5. **Open a pull request** to `main` using the PR template and link the issue.
6. **CI must pass** (lint and formatting, type check, tests, build). Run them locally first:

   ```sh
   pnpm install
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

7. **Review.** A PR is merged after review; PRs that change the UI also get a design review.

## Rules

- **No secrets in code, logs or commits.** API keys and other settings come only from environment variables.
- **No assumptions about the host.** Anything install-specific is configured through environment variables.
- **UI values** (colors, spacing, fonts…) come only from the design tokens file.

By contributing you agree that your contributions are licensed under [AGPL-3.0](LICENSE).
