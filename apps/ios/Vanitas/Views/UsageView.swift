import SwiftUI

struct UsageView: View {
    @EnvironmentObject var env: AppEnvironment

    var body: some View {
        NavigationStack {
            List {
                if let error = env.lastError {
                    Section {
                        ErrorBanner(text: error)
                    }
                }

                if let usage = env.usage {
                    Section {
                        HStack(spacing: 12) {
                            LabeledStat(title: L10n.t("Requests", "الطلبات"),
                                        value: usage.totalVolume.formatted())
                            LabeledStat(title: L10n.t("Success", "النجاح"),
                                        value: "\(usage.overallSuccessRate)%")
                            LabeledStat(title: L10n.t("Throttled", "مقيّدة"),
                                        value: usage.overallThrottledCount.formatted())
                        }
                        HStack(spacing: 12) {
                            LabeledStat(title: L10n.t("Errors", "أخطاء"),
                                        value: usage.overallErrorCount.formatted())
                            LabeledStat(title: L10n.t("Avg latency", "متوسط الزمن"),
                                        value: "\(Int(usage.overallAvgLatencyMs)) ms")
                            LabeledStat(title: L10n.t("Period", "الفترة"),
                                        value: usage.period)
                        }
                    } header: {
                        Text(L10n.t("Overall", "الإجمالي"))
                    }

                    Section {
                        if usage.summaries.isEmpty {
                            Text(L10n.t("No traffic in this period.",
                                        "لا توجد حركة في هذه الفترة."))
                                .foregroundStyle(.secondary)
                        }
                        ForEach(usage.summaries, id: \.keyId) { summary in
                            SummaryRow(summary: summary)
                        }
                    } header: {
                        Text(L10n.t("By key", "حسب المفتاح"))
                    }

                    if let upstream = usage.upstream {
                        Section {
                            Text(upstream)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        } header: {
                            Text(L10n.t("Data source", "مصدر البيانات"))
                        }
                    }
                } else if env.isBusy {
                    Section {
                        ProgressView(L10n.loading)
                    }
                } else {
                    Section {
                        Text(L10n.t("Pull down to load usage.",
                                    "اسحب للأسفل لتحميل الاستخدام."))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(L10n.t("Usage", "الاستخدام"))
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Picker(L10n.t("Period", "الفترة"), selection: $env.period) {
                        Text(L10n.t("24h", "٢٤ ساعة")).tag("24h")
                        Text(L10n.t("7d", "٧ أيام")).tag("7d")
                        Text(L10n.t("30d", "٣٠ يوم")).tag("30d")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: env.period) { _ in
                        Task { await env.refreshUsage() }
                    }
                }
            }
            .refreshable { await env.refreshUsage() }
            .task {
                if env.usage == nil {
                    await env.refreshUsage()
                }
            }
        }
    }
}

/// One key's numbers for the selected window: quota first (it is the thing
/// that runs out), then the rates a human can act on.
struct SummaryRow: View {
    let summary: UsageSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(summary.keyName.isEmpty ? summary.keyPrefix : summary.keyName)
                    .font(.headline)
                Spacer()
                Text(summary.environment)
                    .font(.caption2.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.15), in: Capsule())
            }

            if summary.quotaUsedPercent > 0 {
                QuotaBar(percent: summary.quotaUsedPercent)
                Text(L10n.t(
                    "\(Int(summary.quotaUsedPercent))% of the monthly quota",
                    "\(Int(summary.quotaUsedPercent))% من الحد الشهري"
                ))
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                LabeledStat(title: L10n.t("Requests", "الطلبات"),
                            value: summary.totalRequests.formatted())
                LabeledStat(title: L10n.t("Success", "النجاح"),
                            value: "\(summary.successRate)%")
                LabeledStat(title: L10n.t("Throttled", "مقيّدة"),
                            value: summary.throttledRequests.formatted())
            }

            HStack(spacing: 12) {
                LabeledStat(title: L10n.t("Errors", "أخطاء"),
                            value: summary.errorCount.formatted())
                LabeledStat(title: L10n.t("Peak rpm", "أعلى rpm"),
                            value: summary.peakRpm.formatted())
                LabeledStat(title: L10n.t("Avg", "المتوسط"),
                            value: "\(Int(summary.avgLatencyMs)) ms")
            }

            if !summary.topEndpoints.isEmpty {
                Text(topEndpointsLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var topEndpointsLine: String {
        summary.topEndpoints
            .map { "\($0.endpoint) · \($0.count)" }
            .joined(separator: "    ")
    }
}
