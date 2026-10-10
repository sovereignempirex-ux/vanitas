package com.vanitas.android

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.vanitas.android.core.AlertKind
import com.vanitas.android.core.UsageAlert

/**
 * Turns a [UsageAlert] — decided in :core, which knows nothing about Android —
 * into a system notification. Everything Android-specific (channel, permission,
 * ids) lives here.
 */
object Notifier {

    const val CHANNEL_ID = "usage_alerts"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.channel_usage),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_usage_desc)
        }
        manager.createNotificationChannel(channel)
    }

    /** False on API 33+ until the user granted POST_NOTIFICATIONS. */
    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    fun post(context: Context, alert: UsageAlert) {
        if (!canNotify(context)) return

        val title = context.getString(titleFor(alert.kind), alert.keyName)
        val body = when (alert.kind) {
            AlertKind.QUOTA -> context.getString(
                R.string.notif_quota_body,
                alert.keyName,
                alert.quotaPercent,
            )
            AlertKind.ERRORS -> context.getString(
                R.string.notif_errors_body,
                alert.errorCount,
                alert.totalRequests,
                alert.keyName,
            )
            AlertKind.THROTTLED -> context.getString(
                R.string.notif_throttled_body,
                alert.throttledCount,
                alert.totalRequests,
                alert.keyName,
            )
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .build()

        // The dedupe key is stable per (kind, key, window), so a repeat in the
        // same window updates instead of stacking.
        NotificationManagerCompat.from(context)
            .notify(alert.dedupeKey.hashCode(), notification)
    }

    private fun titleFor(kind: AlertKind): Int = when (kind) {
        AlertKind.QUOTA -> R.string.notif_quota_title
        AlertKind.ERRORS -> R.string.notif_errors_title
        AlertKind.THROTTLED -> R.string.notif_throttled_title
    }
}
