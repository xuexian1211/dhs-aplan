# Fix `.runtime` ACL (Windows / DSH)

DSH sandboxes often leave workspace roots at **Low** integrity with an **Everyone DENY**.
`scripts/start-all.ps1` and harness turns need to write under `.runtime` (pid files, logs, tmp).
If those writes fail, run:

```powershell
pwsh -File E:\WorkSpaces\dsh-aplan\scripts\Fix-runtime-acl.ps1 -Workspace E:\WorkSpaces\<your-repo>
```

What it does:

1. `takeown /F .runtime /R /D Y`
2. Grant the current user `(OI)(CI)(F)`
3. Remove `Everyone` DENY
4. `icacls .runtime /setintegritylevel (OI)(CI)M` (Medium)
5. Print a verify summary + Low-root vs Medium-`.runtime` warning

## Plugin auto-fix

`dsh-aplan` (0.3.19+) runs the same repair on plugin start for each configured role `cwd`
(and the top-level `cwd`) when `fixRuntimeAcl` is `true` (default). Set `fixRuntimeAcl: false`
in the plugin config / GUI to skip.

Canonical copy lives in **dsh-aplan**. ERP (or any workspace) may copy the script into its own
`scripts/` folder if desired; do not commit ERP-only noise unless you want it there.
