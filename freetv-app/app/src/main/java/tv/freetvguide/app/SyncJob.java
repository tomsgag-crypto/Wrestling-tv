package tv.freetvguide.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** On the phone: every 15 minutes on Wi-Fi, swap changes with the linked TV (so things set while you were out reach it). */
public class SyncJob extends JobService {
    static void schedule(Context c) {
        if (!SyncStore.paired(c) || !"full".equals(BuildConfig.FLAVOR)) return;
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js.getPendingJob(7311) != null) return;
            js.schedule(new JobInfo.Builder(7311, new ComponentName(c, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
        } catch (Exception ignored) { }
    }

    @Override public boolean onStartJob(JobParameters p) {
        new Thread(() -> {
            try { SyncStore.syncWithTv(getApplicationContext()); } catch (Exception ignored) { }
            jobFinished(p, false);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }
}
