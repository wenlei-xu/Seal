package transcription

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestASRSettingsEncryptionRevisionAndRouteIdentity(t *testing.T) {
	t.Setenv(BaseURLEnv, "")
	dir := t.TempDir()
	input := Settings{DefaultRoute: "service", ServiceEnabled: true, ServiceType: "whisper", BaseURL: "http://127.0.0.1:8080", APIKey: "test-secret", Language: "zh"}
	saved, err := SaveSettings(dir, input)
	if err != nil {
		t.Fatal(err)
	}
	if saved.APIKey != "" || !saved.HasAPIKey {
		t.Fatal("key not redacted")
	}
	raw, err := os.ReadFile(filepath.Join(dir, "asr-settings.json"))
	if err != nil || strings.Contains(string(raw), "test-secret") {
		t.Fatal("plaintext key persisted", err)
	}
	route, first, settings, err := ResolveConfiguredRoute(dir, "")
	if err != nil || route != "service" || settings.Language != "zh" {
		t.Fatal(route, err)
	}
	if _, err := SaveSettings(dir, input); err == nil {
		t.Fatal("stale revision accepted")
	}
	saved.Language = "en"
	saved, err = SaveSettings(dir, saved)
	if err != nil {
		t.Fatal(err)
	}
	settings, err = ReadSettings(dir)
	if err != nil || settings.APIKey != "test-secret" {
		t.Fatal("blank key did not preserve existing secret", err)
	}
	saved.APIKey = "changed-secret"
	if _, err := SaveSettings(dir, saved); err != nil {
		t.Fatal(err)
	}
	_, second, _, err := ResolveConfiguredRoute(dir, "service")
	if err != nil || first == second {
		t.Fatal("key change reused old task identity", err)
	}
	saved.BaseURL = "http://192.168.1.20:8080"
	saved.Revision++
	if _, err := SaveSettings(dir, saved); err == nil {
		t.Fatal("private network service accepted")
	}
}

func TestASROpenAIUsesTimestampedMultipartContract(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/transcriptions" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("wrong endpoint/auth")
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Error(err)
		}
		if r.FormValue("model") != "whisper-1" || r.FormValue("response_format") != "verbose_json" || r.FormValue("language") != "zh" {
			t.Error("wrong transcription fields")
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Error(err)
		} else {
			file.Close()
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"language":"zh","segments":[{"start":0.25,"end":1.5,"text":"你好"}]}`))
	}))
	defer server.Close()
	wav := filepath.Join(t.TempDir(), "speech.wav")
	if err := os.WriteFile(wav, []byte("test-audio"), 0600); err != nil {
		t.Fatal(err)
	}
	client := ConfiguredClient("service", Settings{ServiceType: "openai", BaseURL: server.URL + "/v1", APIKey: "test-key", Model: "whisper-1"})
	segments, language, err := client.Transcribe(context.Background(), wav, "zh")
	if err != nil || language != "zh" || len(segments) != 1 || segments[0].StartMs != 250 || segments[0].EndMs != 1500 {
		t.Fatal("timestamps not retained", err)
	}
}
