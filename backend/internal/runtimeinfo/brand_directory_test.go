package runtimeinfo

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultDataDirSealAndExistingWorkspace(t *testing.T) {
	root := t.TempDir()
	t.Setenv("APPDATA", root)
	t.Setenv("XDG_CONFIG_HOME", root)
	t.Setenv("BEEFTV_DATA_DIR", "")
	t.Setenv("CANVAS_DESKTOP_DATA_DIR", "")
	// Use the platform's actual config root (macOS ignores APPDATA/XDG).
	configRoot, err := os.UserConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	if configRoot != root {
		t.Skip("this test requires an isolated user config root")
	}
	dir, err := DefaultDataDir()
	if err != nil || dir != filepath.Join(root, "Seal") {
		t.Fatalf("new workspace: %s, %v", dir, err)
	}
	legacy := filepath.Join(root, "BeefTV")
	if err := os.Mkdir(legacy, 0o700); err != nil {
		t.Fatal(err)
	}
	dir, err = DefaultDataDir()
	if err != nil || dir != legacy {
		t.Fatalf("existing workspace: %s, %v", dir, err)
	}
	t.Setenv("BEEFTV_DATA_DIR", filepath.Join(root, "explicit"))
	dir, err = DefaultDataDir()
	if err != nil || dir != filepath.Join(root, "explicit") {
		t.Fatal("explicit workspace was ignored")
	}
}
