package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestAssistantSelectedSkillUsesOwnedSnapshotAndRejectsDisabled(t *testing.T) {
	hits := 0
	var forwarded struct {
		SelectedSkillID string `json:"selectedSkillId"`
		SkillSnapshot   struct {
			Skills []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
				Root string `json:"root"`
			} `json:"skills"`
		} `json:"skillSnapshot"`
	}
	env := newAssistantTestEnv(t, func(env *assistantTestEnv) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/chat" {
				hits++
				if err := json.NewDecoder(r.Body).Decode(&forwarded); err != nil {
					t.Error(err)
				}
				w.Header().Set("Content-Type", "application/x-ndjson")
				_, _ = w.Write([]byte("{\"type\":\"turn_end\",\"reply\":\"done\",\"toolCalls\":[],\"error\":null}\n"))
				return
			}
			_, _ = w.Write([]byte(`{"turns":[]}`))
		})
	})
	database, err := env.service.Database().DB()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := env.service.LocalWorkspaceOwner()
	if err != nil {
		t.Fatal(err)
	}
	roots := map[string]string{}
	content := []byte("---\nname: sample\ndescription: Local workflow\n---\nUse the current selection.")
	preview, err := env.service.SkillHubInspect(owner.ID, roots, "sample.md", content, "sample", "Local workflow")
	if err != nil {
		t.Fatal(err)
	}
	id, err := env.service.SkillHubInstall(owner.ID, roots, "sample.md", content, "sample", "Local workflow", preview.ContentHash, "", true)
	if err != nil {
		t.Fatal(err)
	}
	requestBody := func(skillID string) string {
		raw, _ := json.Marshal(map[string]any{"canvasId": env.canvasID, "message": "hello", "selectedSkillId": skillID, "skillSnapshot": map[string]any{"skills": []any{map[string]string{"id": skillID, "name": "forged", "root": "outside"}}}})
		return string(raw)
	}
	accepted := env.call(t, http.MethodPost, "/assistant/chat", requestBody(id))
	if accepted.Code != http.StatusOK || hits != 1 || forwarded.SelectedSkillID != id || len(forwarded.SkillSnapshot.Skills) != 1 || forwarded.SkillSnapshot.Skills[0].Name != "sample" || forwarded.SkillSnapshot.Skills[0].Root == "outside" {
		t.Fatalf("wrong trusted selection: status=%d hits=%d body=%s forwarded=%+v", accepted.Code, hits, accepted.Body.String(), forwarded)
	}
	if err := env.service.SkillHubSetEnabled(owner.ID, id, false); err != nil {
		t.Fatal(err)
	}
	for _, skillID := range []string{id, "other-user-skill"} {
		rejected := env.call(t, http.MethodPost, "/assistant/chat", requestBody(skillID))
		if rejected.Code != http.StatusBadRequest || !strings.Contains(rejected.Body.String(), "selected_skill_unavailable") || rejected.Header().Get("X-Beeftv-Turn-Admission") != "rejected" || hits != 1 {
			t.Fatalf("unavailable skill admitted: %d %s hits=%d", rejected.Code, rejected.Body.String(), hits)
		}
	}
}
