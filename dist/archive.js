export function startArchiveSweeper(configs, log) {
    let timer;
    let disposed = false;
    const arm = () => {
        if (timer)
            clearInterval(timer);
        timer = undefined;
        const sample = configs()[0];
        if (!sample?.archiveDoneThreads) {
            log('[dhs-aplan] archive sweeper idle (archiveDoneThreads=false)');
            return;
        }
        const minutes = Math.max(5, Number(sample.archiveSweepMinutes) || 240);
        const ms = minutes * 60_000;
        log(`[dhs-aplan] archive sweeper armed every ${minutes}m dryRun=${sample.archiveDryRun} (DSH has no Plan-issue archive API yet; sweeps log only)`);
        timer = setInterval(() => {
            if (disposed)
                return;
            for (const cfg of configs()) {
                if (!cfg.archiveDoneThreads)
                    continue;
                const grace = Math.max(5, Number(cfg.archiveGraceMinutes) || 30);
                log(`[dhs-aplan${cfg.roleKey ? ':' + cfg.roleKey : ''}] archive sweep skipped: DSH cannot archive by Plan column yet (would wait ${grace}m after completed/canceled; dryRun=${cfg.archiveDryRun})`);
            }
        }, ms);
    };
    arm();
    // Re-arm periodically so GUI toggles take effect without plugin reload.
    const rearm = setInterval(arm, 30_000);
    return () => {
        disposed = true;
        if (timer)
            clearInterval(timer);
        clearInterval(rearm);
    };
}
