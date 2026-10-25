# Mini-program collaboration workflow

- Read the current user request and choose the correct task branch before editing. Preserve existing uncommitted changes and pending feature branches.
- Keep API field names, authentication and error handling consistent with the backend. Coordinate interface changes with the backend repository.
- Run the contract/check scripts actually present on the selected branch. The template `npm test` is a placeholder and is not a passing business test suite. Where business tests are absent, report syntax/configuration checks separately.
- Server-side JavaScript/configuration checks do not validate WeChat DevTools pages, mobile behavior or release readiness. State exactly which checks ran.
- Push a separate task branch and return a pull request link. Do not merge, upload, publish or release the mini-program merely because source checks pass.
- Never commit personal tokens, application secrets, private local project settings, production configuration or user data.
- Browser operations use the user's configured ego-browser; unavailable tools must not be replaced with another browser without instruction.
