# Python runtime dependencies

`python-runtime.toml` and `python-runtime.lock` at the repository root are the
Python project manifest and uv lockfile, under intentionally non-discoverable
names. Do not recreate root `pyproject.toml` / `uv.lock`: the publishing
installer rewrites their source mappings, incorrectly assigning Transformers
to the PyTorch CPU index.

The API build calls `install-python-runtime.mjs` before bundling. It copies the
manifest and lockfile into a temporary project, calls `uv sync --locked`
directly, and installs into the existing root `.pythonlibs`. Python and uv
remain provided by the Replit Python module. No package versions, model files,
or API runtime interpreter paths are changed by this arrangement.

Check resolution without modifying the environment:

```sh
node scripts/install-python-runtime.mjs --check
```

Restore an environment manually:

```sh
node scripts/install-python-runtime.mjs
```

For dependency changes, materialize these two files under the standard names
in an isolated temporary project, update and validate its lockfile, then copy
both back under their tracked names. Keep PyTorch's CPU index scoped to
PyTorch. Never resolve a different dependency set implicitly during publishing.