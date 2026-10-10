package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	limiter := NewLimiter(defaultMaxKeys)
	srv := httptest.NewServer(newMux(limiter, time.Now()))
	t.Cleanup(srv.Close)
	return srv
}

func postJSON(t *testing.T, url string, payload any, headers map[string]string) (*http.Response, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	var decoded map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &decoded)
	}
	return res, decoded
}

func TestHealthAndReadyAreOpen(t *testing.T) {
	srv := newTestServer(t)

	res, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", res.StatusCode)
	}
	var health map[string]string
	_ = json.NewDecoder(res.Body).Decode(&health)
	if health["status"] != "ok" || health["language"] != "go" || health["service"] != "vanitas-ratelimit" {
		t.Fatalf("unexpected health payload: %v", health)
	}

	res2, err := http.Get(srv.URL + "/ready")
	if err != nil {
		t.Fatalf("ready: %v", err)
	}
	defer res2.Body.Close()
	var ready map[string]any
	_ = json.NewDecoder(res2.Body).Decode(&ready)
	if ready["engine"] != "sliding_window" {
		t.Fatalf("engine = %v", ready["engine"])
	}
	if ready["auth"] != "open" {
		t.Fatalf("auth = %v, want open when no token is configured", ready["auth"])
	}
}

func TestCheckRoundTripMatchesTheTypeScriptContract(t *testing.T) {
	srv := newTestServer(t)

	for i := 1; i <= 2; i++ {
		res, body := postJSON(t, srv.URL+"/v1/rate/check", map[string]any{
			"key": "1.2.3.4:l1:/api", "windowMs": 60_000, "max": 2,
		}, nil)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("status = %d body=%v", res.StatusCode, body)
		}
		if allowed, _ := body["allowed"].(bool); !allowed {
			t.Fatalf("hit %d must be allowed: %v", i, body)
		}
		if body["retryAfterSecs"] != float64(60) {
			t.Fatalf("retryAfterSecs = %v, want 60 (matches Retry-After header)", body["retryAfterSecs"])
		}
	}

	res, body := postJSON(t, srv.URL+"/v1/rate/check", map[string]any{
		"key": "1.2.3.4:l1:/api", "windowMs": 60_000, "max": 2,
	}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("denied decision must still be a 200 with allowed=false, got %d", res.StatusCode)
	}
	if allowed, _ := body["allowed"].(bool); allowed {
		t.Fatalf("3rd hit must be denied: %v", body)
	}
	if body["remaining"] != float64(0) {
		t.Fatalf("remaining = %v, want 0", body["remaining"])
	}
}

func TestCheckValidatesInput(t *testing.T) {
	srv := newTestServer(t)

	cases := []struct {
		name    string
		payload map[string]any
		want    int
	}{
		{"missing key", map[string]any{"windowMs": 60_000, "max": 5}, http.StatusUnprocessableEntity},
		{"empty key", map[string]any{"key": "", "windowMs": 60_000, "max": 5}, http.StatusUnprocessableEntity},
		{"window too large", map[string]any{"key": "k", "windowMs": 86_400_001, "max": 5}, http.StatusUnprocessableEntity},
		{"window zero", map[string]any{"key": "k", "windowMs": 0, "max": 5}, http.StatusUnprocessableEntity},
		{"max zero", map[string]any{"key": "k", "windowMs": 60_000, "max": 0}, http.StatusUnprocessableEntity},
		{"max too large", map[string]any{"key": "k", "windowMs": 60_000, "max": 1_000_001}, http.StatusUnprocessableEntity},
		{"oversized key", map[string]any{"key": strings.Repeat("x", 600), "windowMs": 60_000, "max": 5}, http.StatusUnprocessableEntity},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, body := postJSON(t, srv.URL+"/v1/rate/check", tc.payload, nil)
			if res.StatusCode != tc.want {
				t.Fatalf("status = %d, want %d (%v)", res.StatusCode, tc.want, body)
			}
			if _, ok := body["error"].(string); !ok {
				t.Fatalf("expected an error message, got %v", body)
			}
		})
	}
}

func TestCheckRejectsMalformedBodies(t *testing.T) {
	srv := newTestServer(t)

	for name, raw := range map[string]string{
		"not json":      "{nope",
		"empty":         "",
		"wrong type":    `{"key": 5, "windowMs": 60000, "max": 5}`,
		"unknown field": `{"key":"k","windowMs":60000,"max":5,"surprise":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			res, err := http.Post(srv.URL+"/v1/rate/check", "application/json", strings.NewReader(raw))
			if err != nil {
				t.Fatalf("post: %v", err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", res.StatusCode)
			}
		})
	}
}

func TestOversizedBodyIsRejected(t *testing.T) {
	srv := newTestServer(t)
	raw := `{"key":"` + strings.Repeat("x", maxRequestBodyBytes+100) + `"}`
	res, err := http.Post(srv.URL+"/v1/rate/check", "application/json", strings.NewReader(raw))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", res.StatusCode)
	}
}

func TestTokenIsEnforcedWhenConfigured(t *testing.T) {
	srv := newTestServer(t)
	t.Setenv("RATELIMIT_SERVICE_TOKEN", "s3cret")

	payload := map[string]any{"key": "k", "windowMs": 60_000, "max": 5}

	res, body := postJSON(t, srv.URL+"/v1/rate/check", payload, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous status = %d, want 401 (%v)", res.StatusCode, body)
	}

	res, _ = postJSON(t, srv.URL+"/v1/rate/check", payload, map[string]string{"X-Internal-Token": "s3cret"})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("X-Internal-Token status = %d, want 200", res.StatusCode)
	}

	res, _ = postJSON(t, srv.URL+"/v1/rate/check", payload, map[string]string{"Authorization": "Bearer s3cret"})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("Bearer status = %d, want 200", res.StatusCode)
	}

	res, _ = postJSON(t, srv.URL+"/v1/rate/check", payload, map[string]string{"X-Internal-Token": "wrong"})
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong token status = %d, want 401", res.StatusCode)
	}

	// Health must stay open even with a token configured — probes need it.
	probe, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer probe.Body.Close()
	if probe.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want 200", probe.StatusCode)
	}
}

func TestResetEndpoint(t *testing.T) {
	srv := newTestServer(t)

	postJSON(t, srv.URL+"/v1/rate/check", map[string]any{"key": "k", "windowMs": 60_000, "max": 1}, nil)

	res, body := postJSON(t, srv.URL+"/v1/rate/reset", map[string]any{"key": "k"}, nil)
	if res.StatusCode != http.StatusOK || body["cleared"] != float64(1) {
		t.Fatalf("reset status=%d body=%v", res.StatusCode, body)
	}

	res, body = postJSON(t, srv.URL+"/v1/rate/reset", map[string]any{"key": "k"}, nil)
	if body["cleared"] != float64(0) {
		t.Fatalf("resetting an unknown key cleared %v, want 0", body["cleared"])
	}

	res, _ = postJSON(t, srv.URL+"/v1/rate/reset", map[string]any{}, nil)
	if res.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("empty reset status = %d, want 422", res.StatusCode)
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	srv := newTestServer(t)
	res, err := http.Get(srv.URL + "/v1/nope")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
}
