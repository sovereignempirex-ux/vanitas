// Vanitas rate-limit microservice — the "servers / Go" domain of the
// platform's language map (services/ratelimit).
//
// Pure standard library: no third-party modules, so `go test ./...` works
// offline and the Docker image needs nothing but the Go toolchain.
package main

import (
	"sort"
	"sync"
)

// Decision is everything the TypeScript gateway needs to enforce one request.
type Decision struct {
	Allowed        bool  `json:"allowed"`
	Count          int   `json:"count"`
	Remaining      int   `json:"remaining"`
	RetryAfterSecs int   `json:"retryAfterSecs"`
	WindowMs       int64 `json:"windowMs"`
	Max            int   `json:"max"`
}

// LimiterStats is reported by /ready.
type LimiterStats struct {
	Engine      string `json:"engine"`
	Keys        int    `json:"keys"`
	MaxKeys     int    `json:"maxKeys"`
	WindowMs    int64  `json:"windowMs"`
	Allowed     int64  `json:"allowed"`
	Denied      int64  `json:"denied"`
	Sweeps      int64  `json:"sweeps"`
	PrunedTotal int64  `json:"prunedTotal"`
}

// Limiter is a bounded, goroutine-safe sliding-window counter — the same
// algorithm as src/server/security.ts (an array of hit timestamps per bucket,
// entries older than the window dropped on every read).
type Limiter struct {
	mu          sync.Mutex
	hits        map[string][]int64
	maxWindowMs int64
	maxKeys     int
	allowed     int64
	denied      int64
	sweeps      int64
	pruned      int64
}

// NewLimiter creates a limiter that holds at most maxKeys buckets (the
// TypeScript original relies on its sweep alone; the hard bound here only
// exists so an unusual path-spray can never exhaust the process).
func NewLimiter(maxKeys int) *Limiter {
	if maxKeys <= 0 {
		maxKeys = 100_000
	}
	return &Limiter{
		hits:        make(map[string][]int64),
		maxWindowMs: 60_000,
		maxKeys:     maxKeys,
	}
}

func filterRecent(arr []int64, windowMs, now int64) []int64 {
	if len(arr) == 0 {
		return nil
	}
	kept := make([]int64, 0, len(arr))
	for _, ts := range arr {
		if now-ts < windowMs {
			kept = append(kept, ts)
		}
	}
	return kept
}

// retryAfter mirrors `Math.ceil(windowMs / 1000)` — the gateway sends this
// value verbatim in the Retry-After header, so both sides must agree.
func retryAfter(windowMs int64) int {
	if windowMs <= 0 {
		return 0
	}
	return int((windowMs + 999) / 1000)
}

// Check records one hit against key and reports whether it is allowed.
// A denied hit is NOT recorded — matching the TypeScript limiter, which
// returns 429 before pushing the timestamp.
func (l *Limiter) Check(key string, windowMs int64, max int, now int64) Decision {
	l.mu.Lock()
	defer l.mu.Unlock()

	if windowMs > l.maxWindowMs {
		l.maxWindowMs = windowMs
	}
	retry := retryAfter(windowMs)

	kept := filterRecent(l.hits[key], windowMs, now)
	if len(kept) >= max {
		// Prune-in-place is safe: filtering again yields the same slice, so
		// writing it back changes nothing the next read would see.
		if len(kept) == 0 {
			delete(l.hits, key)
		} else {
			l.hits[key] = kept
		}
		l.denied++
		return Decision{
			Allowed:        false,
			Count:          len(kept),
			Remaining:      0,
			RetryAfterSecs: retry,
			WindowMs:       windowMs,
			Max:            max,
		}
	}

	kept = append(kept, now)
	l.hits[key] = kept
	l.allowed++
	remaining := max - len(kept)
	if remaining < 0 {
		remaining = 0
	}
	return Decision{
		Allowed:        true,
		Count:          len(kept),
		Remaining:      remaining,
		RetryAfterSecs: retry,
		WindowMs:       windowMs,
		Max:            max,
	}
}

// Sweep drops every bucket whose newest hit left the window, then enforces the
// hard key bound (evicting the least-recently-hit first). Returns how many
// buckets went away.
func (l *Limiter) Sweep(now int64) int {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.sweeps++
	window := l.maxWindowMs
	removed := int64(0)

	for key, arr := range l.hits {
		kept := filterRecent(arr, window, now)
		if len(kept) == 0 {
			delete(l.hits, key)
			removed++
			continue
		}
		l.hits[key] = kept
	}

	if len(l.hits) > l.maxKeys {
		type bucket struct {
			key  string
			last int64
		}
		all := make([]bucket, 0, len(l.hits))
		for key, arr := range l.hits {
			last := int64(0)
			if len(arr) > 0 {
				last = arr[len(arr)-1]
			}
			all = append(all, bucket{key: key, last: last})
		}
		sort.Slice(all, func(i, j int) bool { return all[i].last < all[j].last })
		excess := len(l.hits) - l.maxKeys
		for i := 0; i < excess && i < len(all); i++ {
			delete(l.hits, all[i].key)
			removed++
		}
	}

	l.pruned += removed
	return int(removed)
}

// Reset clears one bucket (used by the admin endpoint and tests).
func (l *Limiter) Reset(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, ok := l.hits[key]; !ok {
		return false
	}
	delete(l.hits, key)
	return true
}

// ResetAll clears every bucket and zeroes the cumulative counters, so an
// admin/test reset measures the next window from zero. A per-key Reset only
// drops that bucket — the global counters describe the whole process lifetime.
func (l *Limiter) ResetAll() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := len(l.hits)
	l.hits = make(map[string][]int64)
	l.allowed = 0
	l.denied = 0
	return n
}

// Stats reports the current state for /ready.
func (l *Limiter) Stats() LimiterStats {
	l.mu.Lock()
	defer l.mu.Unlock()
	return LimiterStats{
		Engine:      "sliding_window",
		Keys:        len(l.hits),
		MaxKeys:     l.maxKeys,
		WindowMs:    l.maxWindowMs,
		Allowed:     l.allowed,
		Denied:      l.denied,
		Sweeps:      l.sweeps,
		PrunedTotal: l.pruned,
	}
}
