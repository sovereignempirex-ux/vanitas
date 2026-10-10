package com.vanitas.android

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.vanitas.android.core.VanitasException
import com.vanitas.android.databinding.ActivityLoginBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Sign-in screen: `POST /api/v1/auth/login`.
 *
 * Two flows share the button — a plain password login, and the 2FA round trip
 * where the first attempt answers `twoFactorRequired` and the form reveals the
 * TOTP field for a second attempt. Every failure lands in [showError] as a
 * human sentence; no stack traces reach the UI.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val container by lazy { (application as VanitasApp).container }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Already signed in? Skip straight to the dashboard.
        if (!container.session.token.isNullOrBlank()) {
            openDashboard()
            return
        }

        binding.inputServer.setText(container.session.serverUrl)
        binding.btnLogin.setOnClickListener { submit() }
    }

    private fun submit() {
        val email = binding.inputEmail.text?.toString().orEmpty().trim()
        val password = binding.inputPassword.text?.toString().orEmpty()
        val code = binding.inputCode.text?.toString().orEmpty().trim()

        if (email.isEmpty() || password.isEmpty()) {
            showError(getString(R.string.error_required))
            return
        }

        val server = binding.inputServer.text?.toString().orEmpty().trim()
        if (server.isNotEmpty()) container.session.serverUrl = server.trimEnd('/')

        setLoading(true)
        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    container.client().login(email, password, code.ifEmpty { null })
                }
                container.session.token = response.token
                // Alerts start only once a session exists (the worker needs one).
                if (container.session.notificationsEnabled) {
                    UsageCheckWorker.schedule(this@LoginActivity)
                }
                openDashboard()
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                setLoading(false)
                if (error is VanitasException.Http && error.twoFactorRequired && !code.isEmpty()) {
                    // A typed code was rejected: ask for a fresh one.
                    showError(error.message ?: getString(R.string.error_generic, ""))
                } else {
                    showError(localized(error))
                }
                if (error is VanitasException.Http && error.twoFactorRequired) revealTwoFactor()
            } catch (unexpected: Exception) {
                setLoading(false)
                showError(getString(R.string.error_generic, unexpected.message ?: "unexpected"))
            }
        }
    }

    /** Turns a typed failure into a sentence, preferring the gateway's own text. */
    private fun localized(error: VanitasException): String = when (error) {
        is VanitasException.Network -> getString(R.string.error_network)
        is VanitasException.Http ->
            if (error.isAuthFailure && !error.twoFactorRequired) {
                error.message ?: getString(R.string.error_auth)
            } else {
                error.message ?: getString(R.string.error_generic, "HTTP ${error.status}")
            }
        is VanitasException.Decoding -> getString(R.string.error_generic, error.message ?: "decode")
    }

    private fun revealTwoFactor() {
        binding.twoFaHint.visibility = View.VISIBLE
        binding.codeLayout.visibility = View.VISIBLE
        binding.inputCode.requestFocus()
    }

    private fun setLoading(loading: Boolean) {
        binding.loginProgress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnLogin.isEnabled = !loading
        binding.btnLogin.setText(if (loading) R.string.action_signing_in else R.string.action_sign_in)
        if (loading) binding.loginError.visibility = View.GONE
    }

    private fun showError(message: String) {
        binding.loginError.text = message
        binding.loginError.visibility = View.VISIBLE
    }

    private fun openDashboard() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
