// Vanitas rate-limit microservice (services/ratelimit).
//
// The gateway delegates its per-IP / per-path ceilings here so that every
// instance behind a load balancer shares ONE bucket (the TypeScript original
// keeps its counters in process memory, so N instances meant N× the budget).
// When this service is unreachable the gateway falls back to that local
// limiter — no request is ever rejected because the service is down.
//
// Endpoints:
//
//	GET  /health            liveness
//	GET  /ready             bucket statistics
//	POST /v1/rate/check     {key, windowMs, max} → decision
//	POST /v1/rate/reset     {key} | {all:true} → cleared buckets
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultPort         = 8300
	defaultSweepMs      = 5_000
	defaultMaxKeys      = 100_000
	minWindowMs         = 1
	maxWindowMs         = 86_400_000 // 24h — no configured limiter comes close
	minMax              = 1
	maxMax              = 1_000_000
	maxKeyBytes         = 512
	maxRequestBodyBytes = 64 << 10 // 64 KiB is far more than any check needs
)

type checkRequest struct {
	Key      string `json:"key"`
	WindowMs int64  `json:"windowMs"`
	Max      int    `json:"max"`
}

type resetRequest struct {
	Key string `json:"key"`
	All bool   `json:"all"`
}

type errorBody struct {
	Error string `json:"error"`
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

// serviceToken is read per request so tests can toggle it with t.Setenv.
func serviceToken() string {
	return strings.TrimSpace(os.Getenv("RATELIMIT_SERVICE_TOKEN"))
}

// requireToken rejects unauthenticated callers when RATELIMIT_SERVICE_TOKEN is
// configured. /health and /ready stay open — orchestrators probe them.
func requireToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := serviceToken()
		if expected == "" {
			next.ServeHTTP(w, r)
			return
		}
		supplied := strings.TrimSpace(r.Header.Get("X-Internal-Token"))
		if supplied == "" {
			if auth := r.Header.Get("Authorization"); auth != "" {
				scheme, value, _ := strings.Cut(auth, " ")
				if strings.EqualFold(scheme, "bearer") {
					supplied = strings.TrimSpace(value)
				} else {
					supplied = strings.TrimSpace(auth)
				}
			}
		}
		if supplied != expected {
			writeJSON(w, http.StatusUnauthorized, errorBody{Error: "invalid rate-limit service token"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, errorBody{Error: "request body too large"})
			return false
		}
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "invalid JSON body: " + err.Error()})
		return false
	}
	return true
}

func newMux(limiter *Limiter, started time.Time) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":   "ok",
			"service":  "vanitas-ratelimit",
			"language": "go",
		})
	})

	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		stats := limiter.Stats()
		payload := map[string]any{
			"engine":    stats.Engine,
			"keys":      stats.Keys,
			"maxKeys":   stats.MaxKeys,
			"windowMs":  stats.WindowMs,
			"allowed":   stats.Allowed,
			"denied":    stats.Denied,
			"sweeps":    stats.Sweeps,
			"uptimeSec": int(time.Since(started).Seconds()),
		}
		if serviceToken() != "" {
			payload["auth"] = "token"
		} else {
			payload["auth"] = "open"
		}
		writeJSON(w, http.StatusOK, payload)
	})

	mux.Handle("POST /v1/rate/check", requireToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body checkRequest
		if !decodeBody(w, r, &body) {
			return
		}
		if body.Key == "" || len(body.Key) > maxKeyBytes {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{
				Error: "key is required and must be at most 512 bytes",
			})
			return
		}
		if body.WindowMs < minWindowMs || body.WindowMs > maxWindowMs {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{
				Error: "windowMs must be between 1 and 86400000",
			})
			return
		}
		if body.Max < minMax || body.Max > maxMax {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{
				Error: "max must be between 1 and 1000000",
			})
			return
		}

		decision := limiter.Check(body.Key, body.WindowMs, body.Max, time.Now().UnixMilli())
		writeJSON(w, http.StatusOK, decision)
	})))

	mux.Handle("POST /v1/rate/reset", requireToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body resetRequest
		if !decodeBody(w, r, &body) {
			return
		}
		if body.All {
			writeJSON(w, http.StatusOK, map[string]any{"cleared": limiter.ResetAll()})
			return
		}
		if body.Key == "" {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: "key or all is required"})
			return
		}
		cleared := 0
		if limiter.Reset(body.Key) {
			cleared = 1
		}
		writeJSON(w, http.StatusOK, map[string]any{"cleared": cleared})
	})))

	return mux
}

func main() {
	host := envOr("RATELIMIT_HOST", "0.0.0.0")
	port := envInt("RATELIMIT_PORT", defaultPort)
	sweepMs := envInt("RATELIMIT_SWEEP_MS", defaultSweepMs)
	maxKeys := envInt("RATELIMIT_MAX_KEYS", defaultMaxKeys)

	limiter := NewLimiter(maxKeys)
	started := time.Now()

	// Periodic sweep: unique-path spraying would otherwise grow the bucket map
	// forever (src/server/security.ts does the same every 1000 requests).
	stopSweep := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Duration(sweepMs) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stopSweep:
				return
			case now := <-ticker.C:
				limiter.Sweep(now.UnixMilli())
			}
		}
	}()

	server := &http.Server{
		Addr:              host + ":" + strconv.Itoa(port),
		Handler:           newMux(limiter, started),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		close(stopSweep)
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()

	log.Printf("vanitas-ratelimit listening on http://%s (port %d, sweep %dms, maxKeys %d)",
		server.Addr, port, sweepMs, maxKeys)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}
