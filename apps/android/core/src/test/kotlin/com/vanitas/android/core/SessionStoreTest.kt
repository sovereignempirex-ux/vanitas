package com.vanitas.android.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionStoreTest {

    @Test
    fun `defaults are usable straight out of the box`() {
        val store = InMemorySessionStore()

        // 10.0.2.2 is the emulator's alias for the host machine.
        assertEquals("http://10.0.2.2:3000", store.serverUrl)
        assertNull(store.token)
        assertTrue(store.notificationsEnabled)
        assertEquals(80, store.quotaThresholdPercent)
    }

    @Test
    fun `session survives a round trip and is dropped on sign-out`() {
        val store = InMemorySessionStore()

        store.token = "sess-1"
        store.markSeen("QUOTA:k1:1")
        store.clearSession()

        assertNull(store.token)
        assertFalse(store.hasSeen("QUOTA:k1:1"))
    }

    @Test
    fun `preferences are independent of the session`() {
        val store = InMemorySessionStore()

        store.serverUrl = "https://vanitas-bot.vercel.app"
        store.notificationsEnabled = false
        store.quotaThresholdPercent = 50
        store.token = "sess-2"

        assertEquals("https://vanitas-bot.vercel.app", store.serverUrl)
        assertFalse(store.notificationsEnabled)
        assertEquals(50, store.quotaThresholdPercent)
        assertEquals("sess-2", store.token)
    }

    @Test
    fun `trailing slash is the caller's business — the store keeps it verbatim`() {
        val store = InMemorySessionStore()
        store.serverUrl = "https://example.test/"
        assertEquals("https://example.test/", store.serverUrl)
    }

    @Test
    fun `the seen-set is bounded so it cannot grow forever`() {
        val store = InMemorySessionStore()

        repeat(600) { store.markSeen("ALERT:key$it:1") }

        // The oldest entries were evicted, the newest are still deduped.
        assertFalse(store.hasSeen("ALERT:key0:1"))
        assertFalse(store.hasSeen("ALERT:key99:1"))
        assertTrue(store.hasSeen("ALERT:key599:1"))
    }

    @Test
    fun `clearSeen does not touch the token`() {
        val store = InMemorySessionStore()
        store.token = "sess-3"
        store.markSeen("ALERT:k:1")

        store.clearSeen()

        assertFalse(store.hasSeen("ALERT:k:1"))
        assertEquals("sess-3", store.token)
    }
}
