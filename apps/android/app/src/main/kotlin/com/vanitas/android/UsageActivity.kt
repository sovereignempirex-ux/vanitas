package com.vanitas.android

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vanitas.android.core.UsageAnalytics
import com.vanitas.android.core.UsageSummary
import com.vanitas.android.core.VanitasException
import com.vanitas.android.databinding.ActivityUsageBinding
import com.vanitas.android.databinding.ItemUsageBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * `GET /api/v1/api-keys/usage-analytics?period=…` — the same numbers the web
 * dashboard renders, in a list instead of charts.
 */
class UsageActivity : AppCompatActivity() {

    private lateinit var binding: ActivityUsageBinding
    private val container by lazy { (application as VanitasApp).container }
    private lateinit var adapter: UsageAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityUsageBinding.inflate(layoutInflater)
        setContentView(binding.root)

        adapter = UsageAdapter()
        binding.usageList.layoutManager = LinearLayoutManager(this)
        binding.usageList.adapter = adapter

        binding.periodGroup.setOnCheckedChangeListener { _, checkedId ->
            load(
                when (checkedId) {
                    R.id.period7d -> "7d"
                    R.id.period30d -> "30d"
                    else -> "24h"
                },
            )
        }
        binding.usageError.setOnClickListener { load(currentPeriod()) }

        load("24h")
    }

    private fun currentPeriod(): String = when (binding.periodGroup.checkedRadioButtonId) {
        R.id.period7d -> "7d"
        R.id.period30d -> "30d"
        else -> "24h"
    }

    private fun load(period: String) {
        binding.usageProgress.visibility = View.VISIBLE
        binding.usageError.visibility = View.GONE
        lifecycleScope.launch {
            try {
                val usage = withContext(Dispatchers.IO) { container.client().usage(period) }
                render(usage)
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                binding.usageError.text = when {
                    error.isAuthFailure -> {
                        container.signOut()
                        finish()
                        return@launch
                    }
                    error is VanitasException.Network -> getString(R.string.error_network)
                    else -> error.message ?: getString(R.string.error_generic, "")
                }
                binding.usageError.visibility = View.VISIBLE
            } catch (unexpected: Exception) {
                binding.usageError.text =
                    getString(R.string.error_generic, unexpected.message ?: "unexpected")
                binding.usageError.visibility = View.VISIBLE
            } finally {
                binding.usageProgress.visibility = View.GONE
            }
        }
    }

    private fun render(usage: UsageAnalytics) {
        binding.usageTotal.text = usage.totalVolume.toLocaleString()
        binding.usageSuccess.text = String.format(Locale.US, "%.1f%%", usage.overallSuccessRate)
        binding.usageErrors.text = usage.overallErrorCount.toLocaleString()
        binding.usageThrottled.text = usage.overallThrottledCount.toLocaleString()

        adapter.submit(usage.summaries)
        val empty = usage.summaries.isEmpty() && usage.totalVolume == 0
        binding.usageEmpty.visibility = if (empty) View.VISIBLE else View.GONE
    }

    private fun Int.toLocaleString(): String =
        java.text.NumberFormat.getIntegerInstance().format(this.toLong())
}

private class UsageAdapter : RecyclerView.Adapter<UsageAdapter.Holder>() {

    private val items = mutableListOf<UsageSummary>()

    fun submit(summaries: List<UsageSummary>) {
        items.clear()
        items.addAll(summaries)
        notifyDataSetChanged()
    }

    inner class Holder(val binding: ItemUsageBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
        Holder(ItemUsageBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val summary = items[position]
        val context = holder.itemView.context
        val binding = holder.binding

        binding.usageKeyName.text = summary.keyName.ifBlank { summary.keyPrefix }
        binding.usageEnv.text = summary.environment

        // Without a quota the server reports 0% — say so instead of implying
        // "the key is at zero percent of something it does not have".
        val quota = summary.quotaUsedPercent.toInt()
        if (summary.monthlyQuotaPresent()) {
            binding.quotaBar.progress = quota
            binding.usageQuota.text = context.getString(R.string.label_quota, quota)
        } else {
            binding.quotaBar.progress = 0
            binding.usageQuota.text = context.getString(R.string.label_no_quota)
        }

        binding.usageItemRequests.text = summary.totalRequests.toString()
        binding.usageItemSuccess.text =
            String.format(Locale.US, "%.1f%%", summary.successRate)
        binding.usageItemErrors.text = "⚠ ${summary.errorCount}"
        binding.usageItemThrottled.text = "429 ${summary.throttledRequests}"

        binding.usageMeta.text = context.getString(
            R.string.label_peak_rpm,
            summary.peakRpm,
        ) + "  ·  " + context.getString(R.string.label_latency, summary.avgLatencyMs.toInt())
    }

    /** The server sends 0% both for "no quota" and for "empty quota". */
    private fun UsageSummary.monthlyQuotaPresent(): Boolean =
        totalRequests > 0 || quotaUsedPercent > 0
}
