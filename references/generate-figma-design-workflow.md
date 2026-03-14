# `generate_figma_design` Workflow Reference

`generate_figma_design` is a two-phase tool:

1. Generate capture instructions and a `captureId`
2. Poll that `captureId` until the upload completes

The tool does not capture the page by itself. It returns the capture ID and expects
the agent to execute the browser-side capture flow.

## Phase 1: Generate

Typical call against an existing file:

```js
generate_figma_design({
  outputMode: 'existingFile',
  fileKey: '<figma-file-key>',
  nodeId: '<target-page-node-id>',
})
```

The response includes:

- `captureId`
- capture instructions
- destination metadata

For a new file, call once with `outputMode: 'newFile'`, then use the returned claim URL
to obtain the new `fileKey` before generating additional capture IDs.

## LOCAL vs EXTERNAL

| Target host | Mode |
|---|---|
| `localhost`, `127.0.0.1`, `*.local` | LOCAL |
| everything else | EXTERNAL |

LOCAL flows rely on `capture.js` already being present in the app HTML.
EXTERNAL flows require runtime script injection or an already-instrumented page.

## Poll Loop

After firing `captureForDesign` in the browser:

1. Wait a few seconds.
2. Call `generate_figma_design({ captureId })`.
3. If the status is `pending` or `processing`, wait and poll again.
4. Stop only when the status is `completed`.

Do not create a new `captureId` while polling the current one.

## Multi-Page Capture

Each `captureId` captures one page or one prepared tab.

- Generate one `captureId` per tab or view.
- Fire captures in the intended order.
- Poll all outstanding capture IDs in parallel.

## Returned URLs

When a poll response returns a URL with `node-id=123-456`, convert it to `123:456`
before storing it in the final mapping.
