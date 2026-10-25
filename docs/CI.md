# CI status

The source repository is prepared for public publication as [nicognaW/memo-doom](https://github.com/nicognaW/memo-doom). GitHub authenticated both supplied credentials, but rejected both pushes that included an active workflow because workflow write permission was unavailable.

The complete configuration is retained in [ci/test.yml](ci/test.yml). It is a template, so it does not run in GitHub Actions. The original preparation commits remain in history; no development dates or passing CI results were invented.

All checks can be run locally:

```sh
npm ci
npm run verify:public
npm run verify:assets
npm test
```

To activate the existing configuration, use a credential or the GitHub interface with permission to write workflows. Move `docs/ci/test.yml` to `.github/workflows/test.yml`, update references to the template, commit and push. Check the resulting Actions run before claiming hosted CI success. Source changes that precede activation do not receive automatic CI checks.
