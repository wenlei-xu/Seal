package transcription

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalJSONPreservesTokenPrecision(t *testing.T) {
	bytes := []byte(`{"result":{"language":"zh"},"transcription":[{"text":"你好","offsets":{"from":0,"to":1200},"tokens":[{"text":"[_BEG_]","offsets":{"from":0,"to":0}},{"text":"你","offsets":{"from":100,"to":400},"p":0.9},{"text":"好","offsets":{"from":400,"to":700},"p":0.8}]}]}`)
	segments, language, err := DecodeLocalJSON(bytes)
	if err != nil || language != "zh" || len(segments) != 1 || len(segments[0].Tokens) != 2 || segments[0].Tokens[1].StartMs != 400 {
		t.Fatalf("segments=%+v language=%s error=%v", segments, language, err)
	}
	if _, _, err := DecodeLocalJSON([]byte(`{"transcription":[{"text":"wrong","offsets":{"from":1000,"to":500}}]}`)); err == nil {
		t.Fatal("invalid local clock accepted")
	}
	t.Setenv("BEEFTV_FAKE_API_KEY", "private")
	for _, value := range localEnvironment() {
		if strings.HasPrefix(value, "BEEFTV_FAKE_API_KEY=") {
			t.Fatal("native tool inherits credentials")
		}
	}
}

func TestLocalWhisperBaseRecognizesActualSpeech(t *testing.T) {
	source := os.Getenv("BEEFTV_TEST_ASR_SAMPLE")
	if source == "" || !LocalAvailable() {
		t.Skip("actual pinned ASR runtime and speech sample required")
	}
	bytes, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	wav := filepath.Join(t.TempDir(), "speech.wav")
	if err := os.WriteFile(wav, bytes, 0600); err != nil {
		t.Fatal(err)
	}
	segments, language, err := NewClient("").Transcribe(context.Background(), wav, "en")
	if err != nil || language != "en" || len(segments) == 0 {
		t.Fatalf("actual recognition: %v %s %+v", err, language, segments)
	}
	if !strings.Contains(strings.ToLower(segments[0].Text), "country") || len(segments[0].Tokens) < 5 || segments[0].EndMs < 1000 {
		t.Fatalf("missing speech or timestamp evidence: %+v", segments)
	}
}
