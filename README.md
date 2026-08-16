**Languages:** [English](README.md) · [简体中文](README.zh.md)

# dsh-autogate

DeepSeek Harness auto-approval plugin: adds two permission presets — **semi-auto (`auto-ask`) + full-auto (`auto`)** — on top of the **workspace-write sandbox**, using layered decisions: deterministic rules + LLM safety approval + (in semi-auto) proactive human approval initiated by the denied party. It keeps the workspace sandbox boundary and never relaxes to full-access.

## Layered design

| Layer | Decision | Description |
| --- | --- | --- |
| L0 Deterministic rules | allow / deny | Zero cost, zero LLM: read-only ops, session state, in-workspace edits and deletes, build/test, and the `run_code` container pass directly; reads of ordinary paths outside the workspace pass directly; writes/deletes outside the workspace (except writes to sensitive shell/credential config files) pass and rely on the workspace-write sandbox to intercept + escalation popup; writes to sensitive config files outside the workspace go to LLM review; empty commands, dynamic command names, and missing arguments fall through to the sandbox; privilege escalation, self-destruction, credential exfiltration, and deletion of critical paths are hard-denied |
| L1 LLM safety approval | allow / deny | Operations the sandbox doesn't intercept but are semantically dangerous (unrecognized tools, ambiguous shell, sensitive path reads, dynamic targets, block devices, persistent terminals, git state changes, network/database operations, writes to protected in-workspace paths) go to a two-state LLM decision: operations explicitly authorized by the user are allowed, reducing manual approvals |
| L2 Human approval | ask | Two channels: ① the AI uses ask_user_question to confirm the operation is legitimate, then re-runs it and passes the LLM again; ② the AI retries with sandbox_permissions + justification to go through DSH's built-in sandbox escalation — this plugin runs the LLM first: a reasonable escalation is approved directly without a popup, dangerous/uncertain cases show a human popup |

## Two modes

| Preset key | Mode | escalation approval fallback |
| --- | --- | --- |
| `auto-ask` | Semi-auto (default) | LLM deny/error → delegate to a human popup (L2 fallback) |
| `auto` | Full-auto | LLM deny/error → deny directly, no human popup (LLM decision is final) |

Both modes share the same L0 deterministic rules and L1 LLM classifier; the only difference is the **L2 human fallback**: semi-auto keeps the human popup, full-auto treats the LLM decision as final. Hard deny (L0 guard) and the `preflight` switch behave identically in both modes.

## Key differences from similar plugins

- **Ordinary calls stay workspace-write**: L0/L1 decisions never widen the sandbox, so even if the L1 LLM misjudges, ordinary file writes stay confined to the workspace (unlike similar plugins that run every call with danger-full-access). The **L2 escalation channel is the exception**: an approved escalation runs that single call with the requested wider sandbox — see the security disclaimer.
- **Unrecognized tools go to LLM classification by default instead of being allowed** — but `run_code` passes directly as a code-execution container; every tool call inside it is still evaluated by this policy and the sandbox.
- **fail-closed**: classifier errors / timeouts / no route / malformed output always deny; the denied party (AI) proactively escalates to human approval as appropriate.

## ⚠️ Security disclaimer

This plugin is a **decision layer that reduces manual approvals — not a security boundary**. The real enforcement boundary remains DSH's workspace-write sandbox and its escalation approval.

- The L1 LLM classifier is heuristic and can misjudge (allow a dangerous operation or deny a safe one). fail-closed reduces false allows but cannot eliminate them.
- Static path checks (including the symlink realpath hardening) still have a TOCTOU window: a symlink can be retargeted after the check passes and before the actual write.
- In **full-auto (`auto`) mode** the LLM decision is final with no human popup — use it only in environments you trust.
- You remain responsible for the final effect of every approved operation. Review the approval trail, and prefer semi-auto (`auto-ask`) when in doubt.
- The **L2 escalation path is a one-shot widening**: when the LLM approves a sandbox escalation, that single call runs with the requested wider sandbox (typically full-access), not workspace-write. It does not widen other calls, but it is a real one-time elevation — do not read "sandbox stays workspace-write" as covering escalations.

## Install

    # Install from GitHub (compiled lib/ is committed)
    dsh plugin --profile web add github:wangxing-git/dsh-autogate

    # Restart dsh

## Configuration

Configuration is wired through the DSH settings service (`ctx.settings`): write an `autogate:` section in `$DSH_HOME/settings.yaml` and it hot-reloads immediately; when the settings service is not mounted, it falls back to the entry config in `cordis.patch.yml` (`config: {}`).

> **About the settings UI**: DSH 0.1.0-rc.6's Web settings page hard-codes an allowlist for third-party plugin namespaces (`WEB_SETTINGS_NAMESPACES` in `dsh-host-apiproxy`), and `autogate` is not in it by default, so the settings card may not show. To make the card show, append `"autogate"` to that array and restart dsh (a change to the official package that must be redone after a DSH upgrade); otherwise configure manually via `settings.yaml` below — functionally equivalent.

    autogate:
      preflight: false                 # pre-sandbox interception switch: true runs deterministic rules + LLM classification, false (default) relies entirely on the sandbox
      presetName: auto-ask             # semi-auto preset key (default auto-ask): delegates to a human fallback popup after LLM deny
      fullAutoPresetName: auto         # full-auto preset key (default auto): LLM decision is final, no human popup
      classifierTimeoutMs: 8000        # classifier timeout (100–60000ms), fail-closed on timeout
      classifierMaxOutputTokens: 1024  # classifier max output tokens (64–4096)
      # classifierPrompt: |              # review (classification) system prompt; empty uses the built-in default
      #   (custom review prompt judging intent / type / reversibility / impact)
      # Fixed classifier model (defaults to the current session's provider/model; both fields must be set together)
      # classifierProvider: deepseek
      # classifierModel: deepseek-chat
      # Standalone OpenAI-compatible classification endpoint (optional; must be HTTPS, loopback may use http)
      # classifierEndpoint: https://api.example.com/v1/chat/completions
      # classifierApiKeyEnv: DEEPSEEK_API_KEY   # environment variable name for the HTTP endpoint API key
      # workspaceRoot: /path/to/ws              # override workspace root (default: session cwd)
      # dshHome: /path/to/.dsh                  # override DSH_HOME (default: ~/.dsh or $DSH_HOME)
      # tempRoots: [/tmp]                       # trusted temporary directories (default: system temp dir)

## Decision flow

> **`preflight` switch (default `false`)**: controls whether the two pre-sandbox steps ("ordinary deterministic rules + LLM classification") run. When `false`, steps 3 and 4 below are skipped and tool calls go straight into the workspace-write sandbox (fully relying on the sandbox policy); step 2 hard deny and step 5 escalation approval always apply, regardless of this switch. Set `true` to restore the full pre-sandbox interception.

1. Non-Auto session: pass through unchanged, official behavior untouched.
2. Auto session: synchronous hard deny (privilege escalation, self-destruction, credential exfiltration, deletion of root/home/DSH_HOME/system-critical paths) → cannot be overridden by later listeners or the LLM.
3. Deterministic allow (read-only, session state, in-workspace edits and deletes, read-only shell, build/test, version probing, `run_code` container; reads of ordinary paths outside the workspace pass directly; writes/deletes outside the workspace (except writes to sensitive shell/credential config files) pass and rely on the workspace-write sandbox + escalation, writes to sensitive config files outside the workspace go to LLM review; empty commands, dynamic command names, missing arguments fall through to the sandbox).
4. Operations the sandbox doesn't intercept but are semantically dangerous (ambiguous shell, sensitive path reads, dynamic targets, block devices, persistent terminals, git state changes, network/database, writes to protected in-workspace paths) → LLM two-state decision (allow / deny).
5. After an LLM deny or classifier error, the AI has two human-approval channels (**semi-auto `auto-ask` mode only**):
   a. use ask_user_question to confirm the operation is legitimate, then re-run after the user confirms and pass LLM approval again;
   b. retry with sandbox_permissions + justification on bash/pwsh to go through DSH's built-in sandbox escalation — this plugin runs the LLM first: a reasonable escalation (explicitly authorized by the user) is approved directly without a popup, and that single call then runs with the requested wider sandbox (typically full-access); dangerous/uncertain cases show a human popup.

   **Full-auto `auto` mode**: escalation approval is decided by the LLM as final — allow approves directly, deny / classifier error denies directly, no human popup.

## Approval trail UI

While the plugin is active, a floating **Approval trail** toggle appears in the bottom-right corner of the DSH web UI (injected into the `shell.overlay` slot). It is only visible once at least one decision has been recorded.

- The toggle shows the current record count and expands/collapses the panel.
- The panel lists the **most recent 50 records** (the trail itself is a process-level ring buffer capped at 200; the panel shows the newest window).
- Each entry shows the decision layer (`L0` deterministic / `L1` LLM / `L2` human), the decision (`allow` / `deny` / `ask`), and the tool name, with a color bar: green = allow, red = deny, orange = ask.
- Expanding an entry reveals the one-line operation summary, the deny/allow reason, the tool `callId`, the local time, and the decision duration.
- The **Locate (定位)** button scrolls the session view to the corresponding tool call.
- Data is polled from the plugin's `trail` RPC every 2 seconds (the last snapshot is kept on failure).
- The trail is process-level and in-memory only: it resets when dsh restarts and is never persisted.
- The deny/allow reason follows the DSH setting language (zh/en): it is English when `en` is explicitly set, otherwise (including when unset) it falls back to Simplified Chinese, matching the UI language.

## Directory structure

    src/
      index.ts         Entry: guard + tools/pre-execute two-state decision + escalation retry allow + approval-trail RPC
      policy.ts        Tool-level deterministic rules (L0) and danger detection
      shell.ts         bash/pwsh static analysis (L0 hard deny + dangerous shell detection)
      classifier.ts    LLM classifier (DSH built-in LLM / optional HTTP endpoint) + sanitization + system prompt
      paths.ts         Path normalization, dangerous-path detection, workspace-root resolution
      trail.ts         Approval trail (process-level ring buffer, append-only, not persisted)
      types.ts         Shared types
      client.tsx       Settings UI card + approval-trail panel (client bundle)
      client-logic.ts  Client UI logic (form controller / trail controller / i18n strings)
    tests/             Tests (paths / shell / policy / classifier / trail / settings / client-logic / index)
    scripts/
      build-client.mjs     Client bundle build script
      fix-session-zstd.py  Session zstd repair script
    cordis.patch.yml   Permission preset table (inserts auto-ask semi-auto + auto full-auto, sandbox=workspace-write)
    lib/                Compiled output (generated by build and version-controlled; do not edit by hand)

## Known limitations

- Path containment is evaluated on real identity (the deepest existing ancestor is resolved through realpath), so a symlink inside the workspace no longer bypasses L0/L1 classification; the remaining TOCTOU window is a symlink retargeted between the check and the actual write, which the workspace-write sandbox still catches.
- Deleting files inside the workspace is allowed directly, relying on the workspace-write sandbox as the fallback; session artifact tracking is not performed, and deletes outside the workspace also pass and rely on sandbox interception + escalation.
- The classifier defaults to reusing the current session model; if the session uses a third-party provider, classification requests go to that provider (sanitized and bounded).
- The `preflight` switch defaults to `false`: ordinary tool calls rely entirely on the workspace-write sandbox, and only the hard-deny guard and the escalation pre-approval run by default. Set `preflight: true` to add deterministic rules + LLM classification on every call.
- Credential-exfiltration detection is a shallow text pattern (it cannot see base64-encoded or chunked secrets); treat it as a tripwire, not a guarantee.

## License

MIT