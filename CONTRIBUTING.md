# Contributing

Atinder owns this project and decides what ships. Please follow these steps so your work can be reviewed.

## Branches

- `master` is production. Only Atinder releases to it.
- `dev` is where finished work is collected and tested before a release. There is no separate test site.
- Feature branches hold one task each.

## How to contribute

1. **Start from an issue.** Atinder creates the issues and assigns them. If you have an idea, open an issue and wait for it to be assigned before you start.
2. **Create a branch from `dev`.** Name it `feature/<issue-number>-short-name` or `fix/<issue-number>-short-name`. If you don't have write access, fork the repo first.
3. **Keep it small.** One issue per PR.
4. **Open a PR into `dev`.** Never target `master`.
5. **Add a demo video.** Every PR needs a short video of the change working. PRs without one won't be reviewed.

## Releases

Atinder merges `dev` into `master` when a set of changes is ready, and tags the release with a version number.

## Security

Never commit keys, tokens or `.env` files. If you find a security problem, tell Atinder privately instead of opening a public issue.
