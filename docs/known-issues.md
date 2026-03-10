# Known Issues

## Steam Runtime Download Uses Wrong API

Steam Runtime installation does not reliably download from the correct source.
The current download flow is hitting the wrong API / endpoint for steamrt,
which causes installs to fail or fetch invalid metadata.

**Current state:** Steam Runtime presence checks are wired up, but the actual
download step needs to be corrected to use the proper upstream API and payload.

**TODO:** Rework the steamrt downloader to call the correct API endpoint,
validate the returned metadata, and download the expected runtime artifacts.
