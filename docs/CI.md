# CI — what runs and why

One workflow, three jobs. The point is that the 378-test suite stops being
something a human has to remember to run.

## Jobs

| Job | Runs | Fails the build when |
|---|---|---|
| `lint` | `node -c` on every `web/js` file, `python3 -m compileall` on every `*.py` | a file does not parse |
| `guard` | `scripts/assets/check_world_sync.py`, the three `--check` asset scripts | `world.py` drifted from `config.js`, or the committed tileset/tilemap/asset hashes are stale |
| `test` | `node tests/run_all_e2e.js` | any of the 378 tests fail |

`lint` and `guard` are cheap and run first: a syntax error or a stale asset
should not cost 80 seconds of test time to discover.

## Why not more

No dependency-caching steps, no matrix of Node versions, no coverage upload.
The suite has zero runtime dependencies and runs in ~80s on one runner; a matrix
would multiply that cost without testing anything different, because the code
targets one Node version in the container and one in CI.

## Adding a check

Put it in `make check` first. If it belongs in CI it almost certainly belongs
there too, and keeping the two in sync means a contributor can reproduce a CI
failure locally with one command.
