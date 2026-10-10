package com.vanitas.android

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vanitas.android.core.ApiKey
import com.vanitas.android.core.CreateKeyRequest
import com.vanitas.android.core.ScopeInfo
import com.vanitas.android.core.VanitasException
import com.vanitas.android.databinding.ActivityKeysBinding
import com.vanitas.android.databinding.ItemKeyBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * `GET /api/v1/api-keys` — list, create (with the one-time secret shown once)
 * and revoke (behind a confirmation). Reloads on every resume, so returning
 * from a rotation/creation elsewhere reflects the server, not a stale copy.
 */
class KeysActivity : AppCompatActivity() {

    private lateinit var binding: ActivityKeysBinding
    private val container by lazy { (application as VanitasApp).container }
    private lateinit var adapter: KeysAdapter
    private var scopes: List<ScopeInfo> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityKeysBinding.inflate(layoutInflater)
        setContentView(binding.root)

        adapter = KeysAdapter(onRevoke = ::confirmRevoke)
        binding.keysList.layoutManager = LinearLayoutManager(this)
        binding.keysList.adapter = adapter

        binding.btnAddKey.setOnClickListener { promptNewKey() }
        binding.keysError.setOnClickListener { load() }

        load()
    }

    override fun onResume() {
        super.onResume()
        // Cheap, and it keeps the list honest after a create/revoke elsewhere.
        if (adapter.itemCount > 0 || binding.keysError.visibility != View.VISIBLE) load()
    }

    private fun load() {
        binding.keysProgress.visibility = View.VISIBLE
        binding.keysError.visibility = View.GONE
        lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { container.client().listKeys() }
                scopes = result.allScopes
                adapter.submit(result.keys)
                binding.keysEmpty.visibility =
                    if (result.keys.isEmpty()) View.VISIBLE else View.GONE
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                showError(error)
            } catch (unexpected: Exception) {
                binding.keysError.text =
                    getString(R.string.error_generic, unexpected.message ?: "unexpected")
                binding.keysError.visibility = View.VISIBLE
            } finally {
                binding.keysProgress.visibility = View.GONE
            }
        }
    }

    private fun showError(error: VanitasException) {
        if (error.isAuthFailure) {
            container.signOut()
            finish()
            return
        }
        binding.keysError.text = when (error) {
            is VanitasException.Network -> getString(R.string.error_network)
            else -> error.message ?: getString(R.string.error_generic, "")
        }
        binding.keysError.visibility = View.VISIBLE
    }

    /** Name field + scope checklist in one dialog. */
    private fun promptNewKey() {
        val selectable = scopes.filter { !it.adminOnly }.ifEmpty { scopes }
        if (selectable.isEmpty()) {
            Toast.makeText(this, R.string.error_generic, Toast.LENGTH_SHORT).show()
            return
        }

        val nameInput = EditText(this).apply {
            hint = getString(R.string.dialog_key_name)
            setSingleLine()
        }
        val wrapper = FrameLayout(this)
        val pad = (16 * resources.displayMetrics.density).toInt()
        wrapper.setPadding(pad * 3, pad, pad * 3, 0)
        wrapper.addView(
            nameInput,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )

        val labels = selectable.map { "${it.label} (${it.scope})" }.toTypedArray()
        val checked = BooleanArray(selectable.size) { it < 3 }
        var chosen = selectable.filterIndexed { index, _ -> checked[index] }.map { it.scope }

        AlertDialog.Builder(this)
            .setTitle(R.string.action_add_key)
            .setView(wrapper)
            .setMultiChoiceItems(labels, checked) { _, which, isChecked ->
                checked[which] = isChecked
                chosen = selectable.filterIndexed { index, _ -> checked[index] }.map { it.scope }
            }
            .setPositiveButton(R.string.action_create) { _, _ ->
                val name = nameInput.text.toString().trim()
                if (name.isEmpty() || chosen.isEmpty()) {
                    Toast.makeText(this, R.string.empty_fields_fill, Toast.LENGTH_SHORT).show()
                } else {
                    createKey(name, chosen)
                }
            }
            .setNegativeButton(R.string.action_cancel, null)
            .show()
    }

    private fun createKey(name: String, keyScopes: List<String>) {
        binding.keysProgress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val created = withContext(Dispatchers.IO) {
                    container.client().createKey(
                        CreateKeyRequest(
                            name = name,
                            scopes = keyScopes,
                            environment = if (keyScopes.any { it.contains("admin") }) "live" else "test",
                        ),
                    )
                }
                AlertDialog.Builder(this@KeysActivity)
                    .setTitle(R.string.msg_key_created)
                    .setMessage("${created.key.keyPrefix}…\n\n${created.rawSecret}\n\n${created.revealNote}")
                    .setPositiveButton(android.R.string.ok, null)
                    .show()
                load()
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                binding.keysProgress.visibility = View.GONE
                showError(error)
            }
        }
    }

    private fun confirmRevoke(key: ApiKey) {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.dialog_revoke_title, key.name))
            .setMessage(R.string.dialog_revoke_body)
            .setPositiveButton(R.string.action_revoke) { _, _ -> revoke(key) }
            .setNegativeButton(R.string.action_cancel, null)
            .show()
    }

    private fun revoke(key: ApiKey) {
        binding.keysProgress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { container.client().revokeKey(key.id) }
                Toast.makeText(this@KeysActivity, R.string.msg_key_revoked, Toast.LENGTH_SHORT).show()
                load()
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: VanitasException) {
                binding.keysProgress.visibility = View.GONE
                showError(error)
            }
        }
    }
}

private class KeysAdapter(
    private val onRevoke: (ApiKey) -> Unit,
) : RecyclerView.Adapter<KeysAdapter.Holder>() {

    private val items = mutableListOf<ApiKey>()

    fun submit(keys: List<ApiKey>) {
        items.clear()
        items.addAll(keys)
        notifyDataSetChanged()
    }

    inner class Holder(val binding: ItemKeyBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
        Holder(ItemKeyBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val key = items[position]
        val context = holder.itemView.context
        val binding = holder.binding

        binding.keyName.text = key.name
        binding.keyPrefix.text = key.maskedSecret.ifBlank { key.keyPrefix }
        binding.keyScopes.text =
            context.getString(R.string.label_scopes, key.scopes.joinToString().ifBlank { "—" })
        binding.keyRate.text = context.getString(R.string.label_rate_limit, key.rateLimitPerMin)
        binding.keyUsage.text = context.getString(R.string.label_usage_count, key.usageCount)
        binding.keyStatus.text = key.status

        val active = key.status == "active"
        binding.btnRevoke.isEnabled = active
        binding.btnRevoke.setOnClickListener { if (active) onRevoke(key) }
    }
}
