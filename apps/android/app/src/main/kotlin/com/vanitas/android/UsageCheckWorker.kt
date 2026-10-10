package com.vanitas.android

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.vanitas.android.core.AlertThresholds
import com.vanitas.android.core.UsageEvaluator
import com.vanitas.android.core.VanitasException
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

/**
 * Periodic (every 6h) pull of the 24h usage window; [UsageEvaluator] decides
 * what is worth saying and [Notifier] says it.
 *
 * Failure policy: a dead network retries, an expired session does not — retrying
 * 401s forever would just drain the battery until the user signs in again.
 */
class UsageCheckWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as VanitasApp).container
        val session = container.session

        if (!session.notificationsEnabled) return Result.success()
        if (session.token.isNullOrBlank()) return Result.success()

        return try {
            val usage = container.client().usage("24h")
            val alerts = UsageEvaluator.evaluateAndRecord(
                usage = usage,
                thresholds = AlertThresholds(quotaPercent = session.quotaThresholdPercent),
                store = session,
                nowMs = System.currentTimeMillis(),
            )
            alerts.forEach { Notifier.post(applicationContext, it) }
            Result.success()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (auth: VanitasException) {
            if (auth.isAuthFailure) Result.success() else Result.retry()
        } catch (unexpected: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_NAME = "vanitas_usage_check"
        private const val INTERVAL_HOURS = 6L

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<UsageCheckWorker>(INTERVAL_HOURS, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME)
        }
    }
}
