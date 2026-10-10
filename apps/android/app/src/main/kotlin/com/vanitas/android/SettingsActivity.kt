package com.vanitas.android

import android.Manifest
import android.os.Bundle
import android.widget.SeekBar
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.vanitas.android.databinding.ActivitySettingsBinding

/**
 * Local preferences: gateway URL, the usage-alert toggle (which owns the
 * notification permission prompt) and the quota threshold fed to
 * `AlertThresholds`. Nothing here talks to the network.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private val container by lazy { (application as VanitasApp).container }

    /** Registered before onCreate, as the API requires. */
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                binding.switchNotifications.isChecked = false
                Toast.makeText(this, R.string.notif_permission_rationale, Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val session = container.session
        binding.inputServer.setText(session.serverUrl)
        binding.switchNotifications.isChecked = session.notificationsEnabled
        // SeekBar offset: progress 0..50 maps to a threshold of 50..100.
        binding.seekThreshold.progress = (session.quotaThresholdPercent - THRESHOLD_MIN).coerceIn(0, 50)
        updateThresholdLabel()

        binding.seekThreshold.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) =
                updateThresholdLabel()

            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })

        binding.switchNotifications.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked && !Notifier.canNotify(this)) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        binding.btnSave.setOnClickListener { save() }
        binding.buildLabel.text =
            getString(R.string.label_build, BuildConfig.BUILD_TYPE)
        binding.versionLabel.text =
            getString(R.string.label_version, BuildConfig.VERSION_NAME)
    }

    private fun updateThresholdLabel() {
        binding.thresholdLabel.text = getString(R.string.hint_threshold, currentThreshold())
    }

    private fun currentThreshold(): Int = THRESHOLD_MIN + binding.seekThreshold.progress

    private fun save() {
        val session = container.session
        val url = binding.inputServer.text?.toString().orEmpty().trim().trimEnd('/')
        if (url.isEmpty()) {
            binding.settingsError.text = getString(R.string.empty_fields_fill)
            binding.settingsError.visibility = android.view.View.VISIBLE
            return
        }
        binding.settingsError.visibility = android.view.View.GONE

        val notifications = binding.switchNotifications.isChecked
        val threshold = currentThreshold()

        // Assignments are independent: a bad URL must not silently disable alerts.
        session.serverUrl = url
        session.notificationsEnabled = notifications
        session.quotaThresholdPercent = threshold
        // A changed threshold invalidates announcements made under the old one.
        session.clearSeen()

        val signedIn = !session.token.isNullOrBlank()
        if (notifications && signedIn) {
            UsageCheckWorker.schedule(this)
        } else {
            UsageCheckWorker.cancel(this)
        }

        Toast.makeText(this, R.string.msg_saved, Toast.LENGTH_SHORT).show()
        finish()
    }

    private companion object {
        /** progress 0..50 → threshold 50..100 (default 80 sits at progress 30). */
        const val THRESHOLD_MIN = 50
    }
}
