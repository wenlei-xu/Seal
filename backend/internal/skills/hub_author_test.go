package skills

import (
	"context"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func authorTestService(t *testing.T) *Service {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+kernel.NewID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.Skill{}, &model.SkillVersion{}, &model.SkillFile{}, &model.UserSkillState{}, &model.SkillRuntimeRevision{}); err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir(), nil)
}

func TestHubAuthorCASPreservesPreviousTurnAndOwnership(t *testing.T) {
	svc := authorTestService(t)
	roots := map[string]string{}
	request := HubAuthorRequest{Files: map[string]string{"SKILL.md": "---\nname: my-talking-head\ndescription: My accepted talking-head style\nmetadata:\n  version: v1\n---\nUse the supplied narration and requested understated captions.", "references/example.md": "A verified previous production example"}, Enabled: true, Save: true}
	first, err := svc.HubAuthor("owner", roots, request)
	if err != nil || first.ID == "" || first.BehaviorVerified || !first.FormatValidated || first.Preview.Version != "v1" {
		t.Fatalf("creation: %+v %v", first, err)
	}
	again, err := svc.HubAuthor("owner", roots, request)
	if err != nil || again.ID != first.ID {
		t.Fatal("identical creation duplicated", err)
	}
	snapshot, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(snapshot.Skills) != 1 {
		t.Fatal("not available next turn", err)
	}
	oldRoot := snapshot.Skills[0].Root
	request.TargetID = first.ID
	request.ExpectedTargetHash = first.Preview.ContentHash
	request.Files["SKILL.md"] = strings.ReplaceAll(request.Files["SKILL.md"], "understated captions", "small captions")
	updated, err := svc.HubAuthor("owner", roots, request)
	if err != nil || updated.ID != first.ID {
		t.Fatal("update failed", err)
	}
	request.Files["SKILL.md"] = strings.ReplaceAll(request.Files["SKILL.md"], "small captions", "huge captions")
	if _, err := svc.HubAuthor("owner", roots, request); err == nil {
		t.Fatal("stale update overwrote accepted style")
	}
	if _, err := svc.HubAuthor("other", roots, request); err == nil {
		t.Fatal("another owner updated private Skill")
	}
	old, err := os.ReadFile(filepath.Join(oldRoot, "SKILL.md"))
	if err != nil || !strings.Contains(string(old), "understated captions") {
		t.Fatal("running turn lost immutable Skill", err)
	}
	unsafe := HubAuthorRequest{Files: map[string]string{"SKILL.md": request.Files["SKILL.md"], "../outside.md": "escape"}, Save: true}
	if _, err := svc.HubAuthor("owner", roots, unsafe); err == nil {
		t.Fatal("unsafe file path accepted")
	}
}

func TestHubDownloadsPinnedPublicSkill(t *testing.T) {
	if os.Getenv("BEEFTV_TEST_REMOTE_SKILL") != "1" {
		t.Skip("explicit public GitHub integration required")
	}
	svc := authorTestService(t)
	request := HubDownloadRequest{URL: "https://github.com/browser-use/video-use", Ref: "b877063835e6ea6e457124da7e28a0ae26691dc3", Subdir: "skills/manim-video", Enabled: false}
	result, err := svc.HubDownload(context.Background(), "owner", map[string]string{}, request)
	if err != nil || result.ID == "" {
		t.Fatalf("actual download: %+v %v", result, err)
	}
	items, err := svc.HubList("owner", map[string]string{})
	if err != nil || len(items) != 1 || items[0].Enabled || items[0].SourceCommit != request.Ref || items[0].SourceURL != request.URL {
		t.Fatalf("source record: %+v %v", items, err)
	}
	if _, err := svc.HubFile("other", result.ID, "SKILL.md"); err == nil {
		t.Fatal("private download exposed to another owner")
	}
	notice, err := svc.HubFile("owner", result.ID, "references/upstream-notices/LICENSE")
	if err != nil || !strings.Contains(notice.Content, "MIT License") {
		t.Fatal("repository license was lost during subdirectory download", err)
	}
}
