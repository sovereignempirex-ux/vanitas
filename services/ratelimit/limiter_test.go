package main

import (
	"sync"
	"testing"
)

func TestCheckAllowsUpToMaxThenDenies(t *testing.T) {
	l := NewLimiter(10)
	now := int64(1_000_000)

	for i := 1; i <= 3; i++ {
		d := l.Check("ip:a", 60_000, 3, now)
		if !d.Allowed {
			t.Fatalf("hit %d should be allowed, got %+v", i, d)
		}
		if d.Count != i {
			t.Fatalf("count = %d, want %d", d.Count, i)
		}
		if d.Remaining != 3-i {
			t.Fatalf("remaining = %d, want %d", d.Remaining, 3-i)
		}
	}

	denied := l.Check("ip:a", 60_000, 3, now)
	if denied.Allowed {
		t.Fatalf("4th hit must be denied, got %+v", denied)
	}
	if denied.Remaining != 0 {
		t.Fatalf("remaining on deny = %d, want 0", denied.Remaining)
	}
	if denied.RetryAfterSecs != 60 {
		t.Fatalf("retryAfterSecs = %d, want 60", denied.RetryAfterSecs)
	}

	// A denied hit is NOT recorded (the TS limiter returns before pushing).
	again := l.Check("ip:a", 60_000, 3, now)
	if again.Count != 3 {
		t.Fatalf("denied hit must not consume budget: count = %d, want 3", again.Count)
	}
}

func TestWindowSlidesForward(t *testing.T) {
	l := NewLimiter(10)

	if d := l.Check("k", 1_000, 1, 0); !d.Allowed {
		t.Fatalf("first hit must be allowed: %+v", d)
	}
	if d := l.Check("k", 1_000, 1, 500); d.Allowed {
		t.Fatalf("still inside the window, must deny: %+v", d)
	}
	// now - firstHit == 1000, which is NOT < 1000 → the entry expired.
	if d := l.Check("k", 1_000, 1, 1_000); !d.Allowed {
		t.Fatalf("window elapsed, must allow: %+v", d)
	}
}

func TestIndependentBucketsDoNotShareBudget(t *testing.T) {
	l := NewLimiter(10)
	now := int64(5_000)

	if d := l.Check("one", 60_000, 1, now); !d.Allowed {
		t.Fatalf("bucket one: %+v", d)
	}
	if d := l.Check("one", 60_000, 1, now); d.Allowed {
		t.Fatalf("bucket one must be exhausted: %+v", d)
	}
	if d := l.Check("two", 60_000, 1, now); !d.Allowed {
		t.Fatalf("bucket two must be untouched by bucket one: %+v", d)
	}
}

func TestRetryAfterRoundsUpLikeMathCeil(t *testing.T) {
	cases := map[int64]int{1: 1, 999: 1, 1_000: 1, 1_500: 2, 60_000: 60, 90_000: 90}
	for window, want := range cases {
		if got := retryAfter(window); got != want {
			t.Fatalf("retryAfter(%d) = %d, want %d", window, got, want)
		}
	}
}

func TestSweepPrunesStaleBuckets(t *testing.T) {
	l := NewLimiter(10)
	l.Check("a", 60_000, 5, 0)
	l.Check("b", 60_000, 5, 0)

	if removed := l.Sweep(120_000); removed != 2 {
		t.Fatalf("sweep removed %d buckets, want 2", removed)
	}
	if stats := l.Stats(); stats.Keys != 0 {
		t.Fatalf("keys after sweep = %d, want 0", stats.Keys)
	}
	if stats := l.Stats(); stats.PrunedTotal != 2 {
		t.Fatalf("prunedTotal = %d, want 2", stats.PrunedTotal)
	}
}

func TestSweepKeepsActiveBuckets(t *testing.T) {
	l := NewLimiter(10)
	l.Check("active", 60_000, 5, 0)

	l.Sweep(30_000) // 30s later — still inside the 60s window
	if stats := l.Stats(); stats.Keys != 1 {
		t.Fatalf("keys = %d, want 1", stats.Keys)
	}
	if !l.Reset("active") {
		t.Fatal("active bucket should still exist")
	}
}

func TestSweepEvictsLeastRecentlyHitWhenOverCap(t *testing.T) {
	l := NewLimiter(2)
	l.Check("oldest", 3_600_000, 5, 1_000)
	l.Check("middle", 3_600_000, 5, 2_000)
	l.Check("newest", 3_600_000, 5, 3_000)

	l.Sweep(4_000)
	if stats := l.Stats(); stats.Keys != 2 {
		t.Fatalf("keys = %d, want 2 (hard cap)", stats.Keys)
	}
	if l.Reset("oldest") {
		t.Fatal("the least-recently-hit bucket should have been evicted")
	}
	if !l.Reset("newest") {
		t.Fatal("the newest bucket must survive the eviction")
	}
}

func TestMaxWindowGrowsToTheLargestSeen(t *testing.T) {
	l := NewLimiter(10)
	l.Check("a", 60_000, 5, 0)
	if stats := l.Stats(); stats.WindowMs != 60_000 {
		t.Fatalf("default window = %d, want 60000", stats.WindowMs)
	}
	l.Check("b", 300_000, 5, 0)
	if stats := l.Stats(); stats.WindowMs != 300_000 {
		t.Fatalf("window = %d, want 300000", stats.WindowMs)
	}
}

func TestStatsCountersTrackAllowedAndDenied(t *testing.T) {
	l := NewLimiter(10)
	now := int64(42)
	l.Check("k", 60_000, 2, now)
	l.Check("k", 60_000, 2, now)
	l.Check("k", 60_000, 2, now)

	stats := l.Stats()
	if stats.Allowed != 2 || stats.Denied != 1 {
		t.Fatalf("allowed=%d denied=%d, want 2/1", stats.Allowed, stats.Denied)
	}
	if stats.Engine != "sliding_window" {
		t.Fatalf("engine = %q", stats.Engine)
	}
}

func TestResetAndResetAll(t *testing.T) {
	l := NewLimiter(10)
	l.Check("a", 60_000, 5, 0)
	l.Check("b", 60_000, 5, 0)

	if l.Reset("missing") {
		t.Fatal("resetting an unknown key must report false")
	}
	if !l.Reset("a") {
		t.Fatal("existing key must be removed")
	}
	if stats := l.Stats(); stats.Keys != 1 {
		t.Fatalf("keys = %d, want 1", stats.Keys)
	}
	if cleared := l.ResetAll(); cleared != 1 {
		t.Fatalf("resetAll cleared %d, want 1", cleared)
	}
	if stats := l.Stats(); stats.Keys != 0 {
		t.Fatalf("keys = %d, want 0", stats.Keys)
	}
	if stats := l.Stats(); stats.Allowed != 0 || stats.Denied != 0 {
		t.Fatalf("resetAll must zero the counters, got allowed=%d denied=%d", stats.Allowed, stats.Denied)
	}
}

// Concurrent checks must never corrupt the bucket map or double-count.
func TestConcurrentChecksAreExact(t *testing.T) {
	l := NewLimiter(100)
	var wg sync.WaitGroup
	const goroutines = 50
	const perGoroutine = 20 // 1000 hits into a 1000-hit budget

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < perGoroutine; j++ {
				l.Check("shared", 60_000, goroutines*perGoroutine, 1_000)
			}
		}()
	}
	wg.Wait()

	stats := l.Stats()
	if stats.Allowed != goroutines*perGoroutine {
		t.Fatalf("allowed = %d, want %d (exactly one per hit)", stats.Allowed, goroutines*perGoroutine)
	}
	if stats.Denied != 0 {
		t.Fatalf("denied = %d, want 0", stats.Denied)
	}
	if stats.Keys != 1 {
		t.Fatalf("keys = %d, want 1", stats.Keys)
	}
}
