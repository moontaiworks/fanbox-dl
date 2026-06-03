# fanbox-dl

Rust FANBOX downloader and read-only API client.

## Install

Build from source:

```bash
cargo install --path .
```

## Usage

FANBOX uses the `FANBOXSESSID` cookie for authenticated requests. Keep your session value outside source control.

```bash
fanbox-dl download \
  --creator creator-id \
  --output ./fanbox-downloads
```

Select creators explicitly or from authenticated account state:

```bash
fanbox-dl download \
  --following \
  --supporting \
  --ignore-creator creator-to-skip
```

Authentication can come from `FANBOX_SESSION_ID`, a raw cookie, or a cookies.txt export:

```bash
fanbox-dl download \
  --creator creator-id \
  --cookie-file ./cookies.txt \
  --user-agent "Mozilla/5.0 ..."
```

`--cookie-file` accepts either a raw cookie value or a Netscape cookies.txt export. FANBOX-domain cookies such as `FANBOXSESSID` and `cf_clearance` are selected automatically.

Useful request controls:

```bash
fanbox-dl download \
  --supporting \
  --concurrency 3 \
  --request-interval-ms 1000 \
  --rate-limit-pause-ms 60000 \
  --max-retries 5
```

Preview selected creators and discovered post summaries without writing files:

```bash
fanbox-dl download --creator creator-id --dry-run
```

Verify existing asset size and SHA-256 before skipping unchanged posts:

```bash
fanbox-dl download --creator creator-id --verify-assets
```

Logs use JSON Lines by default. Add `--log-format pretty` for interactive use and `--verbose` for debug logs.

## Output Layout

The downloader stores each creator under the output directory:

```text
<output>/<creator>/manifest.json
<output>/<creator>/posts/<date>_<postId>_<title>/summary.json
<output>/<creator>/posts/<date>_<postId>_<title>/metadata.json
<output>/<creator>/posts/<date>_<postId>_<title>/content.md
<output>/<creator>/posts/<date>_<postId>_<title>/assets/...
```

The manifest schema remains version 1. Unchanged posts are skipped. Obsolete assets are moved to `archived/`.

## Development

Run the Rust checks:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```
