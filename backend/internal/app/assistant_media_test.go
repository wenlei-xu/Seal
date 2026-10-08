package app

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"infinite-canvas/backend/internal/model"
	localtask "infinite-canvas/backend/internal/task"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestAssistantMediaConfiguredChannelReopensWithoutResubmission(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, kind := range []string{"image", "audio"} {
		t.Run(kind, func(t *testing.T) {
			var submissions atomic.Int64
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				submissions.Add(1)
				if kind == "image" {
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII="}]}`))
				} else {
					w.Header().Set("Content-Type", "audio/wav")
					wav := new(bytes.Buffer)
					wav.WriteString("RIFF")
					_ = binary.Write(wav, binary.LittleEndian, uint32(36+3200))
					wav.WriteString("WAVEfmt ")
					for _, value := range []any{uint32(16), uint16(1), uint16(1), uint32(16000), uint32(32000), uint16(2), uint16(16)} {
						_ = binary.Write(wav, binary.LittleEndian, value)
					}
					wav.WriteString("data")
					_ = binary.Write(wav, binary.LittleEndian, uint32(3200))
					wav.Write(make([]byte, 3200))
					_, _ = w.Write(wav.Bytes())
				}
			}))
			defer upstream.Close()
			dir := t.TempDir()
			svc, db := openDBRuntimeMatrix(t, dir)
			defer func() { closeDBRuntimeMatrix(t, svc, db) }()
			if err := db.Create(&model.EditingProject{ID: "cut_media", UserID: "local", Title: "Independent edit"}).Error; err != nil {
				t.Fatal(err)
			}
			protocol := map[string]string{"image": "openai-image", "audio": "openai-audio"}[kind]
			config := map[string]any{kind + "Model": "fixture::fixture-model", "channels": []any{map[string]any{"id": "fixture", "enabled": true, "baseUrl": upstream.URL + "/v1", "apiKey": "synthetic-only", "models": []string{"fixture-model"}, "modelProfiles": []any{map[string]any{"model": "fixture-model", "capability": kind, "protocol": protocol}}}}}
			body, _ := json.Marshal(map[string]any{"schemaVersion": 1, "revision": 1, "config": config})
			if err := svc.SaveLocalModelConfig(body); err != nil {
				t.Fatal(err)
			}
			proposal, err := svc.AssistantMediaPropose("local", "cut_media", strings.Repeat("a", 64), kind, "an accepted brief", "")
			if err != nil {
				t.Fatal(err)
			}
			if submissions.Load() != 0 {
				t.Fatal("proposal submitted paid work")
			}
			request := localtask.CreateRequest{Type: "canvas_" + kind, Prompt: proposal.Prompt, Model: proposal.ModelKey, Input: map[string]any{"mode": kind, "prompt": proposal.Prompt, "config": map[string]any{"baseUrl": upstream.URL + "/v1", "apiKey": "synthetic-only", "model": "fixture-model", "interfaceType": protocol, "audioFormat": "wav"}}}
			task, err := svc.AcceptAssistantMedia("local", "cut_media", proposal.ID, request)
			if err != nil {
				t.Fatal(err)
			}
			if err := svc.taskWorker().processNextTask(); err != nil {
				t.Fatal(err)
			}
			// Simulate a lost bind response after task admission; recovery uses its receipt.
			if err := db.Model(&model.AssistantMediaProposal{}).Where("id = ?", proposal.ID).Update("task_id", "").Error; err != nil {
				t.Fatal(err)
			}
			closeDBRuntimeMatrix(t, svc, db)
			svc, db = openDBRuntimeMatrix(t, dir)
			reused, err := svc.AcceptAssistantMedia("local", "cut_media", proposal.ID, request)
			if err != nil || reused.ID != task.ID || reused.Status != model.TaskStatusSucceeded {
				t.Fatalf("recovery=%+v err=%v", reused, err)
			}
			if submissions.Load() != 1 {
				t.Fatalf("submissions=%d", submissions.Load())
			}
			if _, err := svc.AssistantMediaTask("foreign", "cut_media", task.ID); err == nil {
				t.Fatal("foreign workspace read output")
			}
			items, err := svc.AssistantMediaProposals("local", "cut_media")
			if err != nil || len(items) != 1 || items[0].TaskID != task.ID {
				t.Fatal("lost task binding", err)
			}
		})
	}
}
