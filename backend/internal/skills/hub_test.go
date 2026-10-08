package skills

import (
	"os"
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

func TestHubCreatorBuiltinsPreserveReferencesAndProtectNames(t *testing.T) {
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
	svc := New(repository.New(db), t.TempDir(), nil)
	roots := map[string]string{}
	for _, name := range []string{"video-use", "skill-creator"} {
		root, err := filepath.Abs("../../../agent-host/skills/" + name)
		if err != nil {
			t.Fatal(err)
		}
		roots[name] = root
	}
	snapshot, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(snapshot.Skills) != 2 {
		t.Fatalf("snapshot: %+v %v", snapshot, err)
	}
	for _, skill := range snapshot.Skills {
		file := "upstream/SKILL.md"
		original, err := os.ReadFile(filepath.Join(roots[skill.Name], filepath.FromSlash(file)))
		if err != nil {
			t.Fatal(err)
		}
		materialized, err := os.ReadFile(filepath.Join(skill.Root, filepath.FromSlash(file)))
		if err != nil || string(original) != string(materialized) {
			t.Fatalf("reference changed: %s %v", skill.Name, err)
		}
		if err := svc.HubSetEnabled("owner", skill.ID, false); err != nil {
			t.Fatal(err)
		}
		if !reservedRuntimeSkillName(skill.Name) {
			t.Fatal("builtin name not reserved")
		}
	}
	disabled, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(disabled.Skills) != 0 {
		t.Fatal("disabled builtins still loaded", err)
	}
}

func TestHubPinnedHyperframesSuite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+kernel.NewID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(&model.Skill{}, &model.SkillVersion{}, &model.SkillFile{}, &model.UserSkillState{}, &model.SkillRuntimeRevision{}); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir(), nil)
	root, err := filepath.Abs("../../../agent-host/skills/hyperframes")
	if err != nil {
		t.Fatal(err)
	}
	roots := map[string]string{"hyperframes": root}
	snapshot, err := svc.HubSnapshot("owner", roots)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Skills) != 1 || snapshot.Skills[0].Version != "0.8.130" {
		t.Fatalf("wrong snapshot: %+v", snapshot)
	}
	files, err := svc.HubFiles("owner", "runtime_hyperframes")
	if err != nil || len(files) < 930 {
		t.Fatalf("full suite: %d %v", len(files), err)
	}
	for _, file := range []string{"official/skills/hyperframes-animation/SKILL.md", "official/skills/hyperframes-core/references/sub-compositions.md", "official/skills/hyperframes-keyframes/SKILL.md", "official/skills/hyperframes-audio/SKILL.md", "official/LICENSE"} {
		original, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(file)))
		if err != nil {
			t.Fatal(err)
		}
		copy, err := os.ReadFile(filepath.Join(snapshot.Skills[0].Root, filepath.FromSlash(file)))
		if err != nil || string(copy) != string(original) {
			t.Fatalf("reference mismatch: %s %v", file, err)
		}
	}
	if err = svc.HubSetEnabled("owner", "runtime_hyperframes", false); err != nil {
		t.Fatal(err)
	}
	disabled, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(disabled.Skills) != 0 {
		t.Fatal("disabled suite still loaded", err)
	}
	if err = svc.HubSetEnabled("owner", "runtime_hyperframes", true); err != nil {
		t.Fatal(err)
	}
}

func TestHubTurnSnapshotSurvivesUpdateDisableAndUninstall(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+kernel.NewID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(&model.Skill{}, &model.SkillVersion{}, &model.SkillFile{}, &model.UserSkillState{}, &model.SkillRuntimeRevision{}); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir(), nil)
	roots := map[string]string{}
	install := func(body string, target string) string {
		t.Helper()
		data := []byte("---\nname: sample\ndescription: Local video workflow\n---\n" + body)
		preview, e := svc.HubInspect("owner", roots, "sample.md", data, "", "")
		if e != nil {
			t.Fatal(e)
		}
		id, e := svc.HubInstall("owner", roots, "sample.md", data, "", "", preview.ContentHash, target, true)
		if e != nil {
			t.Fatal(e)
		}
		return id
	}
	id := install("First version", "")
	first, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(first.Skills) != 1 {
		t.Fatalf("first snapshot: %+v %v", first, err)
	}
	if _, err = svc.HubFile("other", id, "SKILL.md"); err == nil {
		t.Fatal("another owner read private skill")
	}
	other, err := svc.HubSnapshot("other", roots)
	if err != nil || len(other.Skills) != 0 {
		t.Fatalf("other snapshot: %+v %v", other, err)
	}
	install("Second version", id)
	second, err := svc.HubSnapshot("owner", roots)
	if err != nil || first.Revision == second.Revision || first.Skills[0].Root == second.Skills[0].Root {
		t.Fatalf("updated snapshot: %+v %v", second, err)
	}
	if err = svc.HubSetEnabled("owner", id, false); err != nil {
		t.Fatal(err)
	}
	disabled, err := svc.HubSnapshot("owner", roots)
	if err != nil || len(disabled.Skills) != 0 {
		t.Fatalf("disabled snapshot: %+v %v", disabled, err)
	}
	if err = svc.HubDelete("owner", id); err != nil {
		t.Fatal(err)
	}
	for _, snapshot := range []*RuntimeSkillSnapshot{first, second} {
		if _, err = os.ReadFile(filepath.Join(snapshot.Skills[0].Root, "SKILL.md")); err != nil {
			t.Fatal("active turn lost immutable skill", err)
		}
	}
}

func TestHubImportMetadataAndPackageBoundaries(t *testing.T) {
	data := skillZip(t, map[string]string{"workflow/SKILL.md": "# Workflow\n\nUse for editing.", "workflow/references/notes.md": "Local reference"})
	archive, missing, err := hubArchive("workflow.zip", data, "sample-workflow", "Edit supplied footage")
	if err != nil || missing || archive.Metadata.Name != "sample-workflow" || len(archive.Files) != 2 {
		t.Fatalf("archive: %+v %v %v", archive, missing, err)
	}
	if _, missing, err = hubArchive("SKILL.md", archive.Files["SKILL.md"], "", ""); err != nil || missing {
		t.Fatal("canonical entry is not readable", missing, err)
	}
	for _, files := range []map[string]string{{"SKILL.md": "# Main", "nested/SKILL.md": "# Other"}, {"SKILL.md": "# Main", "references/a.md": "A", "references/A.md": "B"}, {"../SKILL.md": "# Bad"}, {"SKILL.md": "# Main", "references/a.md:stream": "Bad"}, {"SKILL.md": "# Main", "references/CON.md": "Bad"}} {
		if _, _, err = hubArchive("bad.zip", skillZip(t, files), "sample", "Purpose"); err == nil {
			t.Fatal("unsafe package accepted", files)
		}
	}
}
