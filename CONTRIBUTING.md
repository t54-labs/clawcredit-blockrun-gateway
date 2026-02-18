# Contributing

Thanks for contributing to `clawcredit-blockrun-gateway`.

## Development setup

```bash
npm install
```

## Local quality gates

Run all checks before opening a PR:

```bash
npm run typecheck
npm test
npm run build
```

## Commit and PR guidelines

- Use focused commits with clear messages.
- Keep behavior changes covered by tests.
- Update docs/README when setup or runtime behavior changes.
- Never commit secrets, API tokens, or private logs.

## Reporting bugs

Use the GitHub bug template and include:

- exact steps and commands
- observed vs expected behavior
- sanitized logs and HTTP status codes
- package version and runtime environment

## Security issues

Please do not open public issues for vulnerabilities.
Use the process in [`SECURITY.md`](./SECURITY.md).
