package com.vanitas.android

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.vanitas.android.core.VanitasException
import com.vanitas.android.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Landing screen after sign-in. Shows who we are (`GET /api/v1/auth/me`) and
 * routes to the three feature screens. An expired token here means the session
 * is dead, so we clear it and return to the login screen.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val container by lazy { (application as VanitasApp).container }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (container.session.token.isNullOrBlank()) {
            goToLogin()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnKeys.setOnClickListener { startActivity(Intent(this, KeysActivity::class.java)) }
        binding.btnUsage.setOnClickListener { startActivity(Intent(this, UsageActivity::class.java)) }
        binding.btnSettings.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        binding.btnLogout.setOnClickListener { signOut() }
        binding.dashboardError.setOnClickListener { loadMe() }

        loadMe()
    }

    private fun loadMe() {
        binding.dashboardError.visibility = View.GONE
        lifecycleScope.launch {
            try {
                val me = withContext(Dispatchers.IO) { container.client().me() }
                binding.userName.text = me.user.name.ifBlank { me.user.username }
                binding.signedInAs.text = getString(R.string.label_signed_in_as, me.user.email)
                binding.userMeta.text = buildString {
                    append(me.user.username.ifBlank { me.user.role.lowercase() })
                    if (me.user.twoFactorEnabled) append(" · 2FA")
                    if (me.permissions.isNotEmpty()) {
                        append(" · ")
                        append(me.permissions.size)
                        append(" perms")
                    }
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                if (error.isAuthFailure) {
                    signOut()
                } else {
                    binding.dashboardError.text =
                        if (error is VanitasException.Network) getString(R.string.error_network)
                        else error.message ?: getString(R.string.error_generic, "")
                    binding.dashboardError.visibility = View.VISIBLE
                }
            } catch (unexpected: Exception) {
                binding.dashboardError.text =
                    getString(R.string.error_generic, unexpected.message ?: "unexpected")
                binding.dashboardError.visibility = View.VISIBLE
            }
        }
    }

    private fun signOut() {
        // Best-effort server-side invalidation; the local session dies either way.
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                runCatching { container.client().logout() }
            }
            container.signOut()
            goToLogin()
        }
    }

    private fun goToLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
