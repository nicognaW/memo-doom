# CI status

GitHub Actions is enabled for [nicognaW/memo-doom](https://github.com/nicognaW/memo-doom). The active configuration is [test.yml](../.github/workflows/test.yml); it runs on pushes, pull requests and manual dispatch, with `contents: read` permission.

The [first hosted run](https://github.com/nicognaW/memo-doom/actions/runs/40190187069) passed on 2026-10-25 for commit `1f11fdf`, in 25 seconds. It installed locked dependencies, checked public files and module syntax, verified the game data, and ran the real-engine test suite. Browser Studio and physical-device tests remain separate checks.

Run the same checks locally:

```sh
npm ci
npm run verify:public
npm run verify:assets
npm test
```

## Publication history

The two credentials supplied for initial publication authenticated successfully, but GitHub rejected workflow writes. The source was first published with a CI template. The maintainer then authorized use of the already signed-in Vivaldi session; the existing configuration was committed through GitHub's editor and ran successfully. Those earlier limitations describe the initial publication stage, not the current CI state.

GitHub reported a deprecation warning for the Node 20 runtime targeted by `actions/checkout@v4` and `actions/setup-node@v4`, plus an Ubuntu runner-image migration notice. These did not fail the first run. The workflow sets Node.js 22 for the project tests.
