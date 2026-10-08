package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type editingMediaTestHost struct {
	status   int
	err      error
	calls    int
	metadata map[string]any
	bytes    []byte
	route    string
}

func (h *editingMediaTestHost) OpenStream(_ context.Context, method, route string, body io.Reader, metadata []byte) (*http.Response, error) {
	h.calls++
	h.route = route
	if method != http.MethodPost || !strings.Contains(route, "projectId=canvas-1") {
		return nil, errors.New("unexpected scope")
	}
	if err := json.Unmarshal(metadata, &h.metadata); err != nil {
		return nil, err
	}
	h.bytes, _ = io.ReadAll(body)
	if h.err != nil {
		return nil, h.err
	}
	return &http.Response{StatusCode: h.status, Body: io.NopCloser(bytes.NewBufferString(`{"code":0,"data":{"revision":1}}`))}, nil
}

func TestEditingAssetOwnershipAndDeletionProtection(t *testing.T) {
	svc, db, dataDir := newResourceDeletionTestService(t)
	resource := model.Resource{ID: "media-1", UserID: "user-1", Kind: "image", Provider: "local", Status: model.ResourceStatusReady, ObjectKey: "users/user-1/image/clip.png", MimeType: "image/png", Size: 5, Width: 320, Height: 480}
	item := model.Asset{ID: "asset-1", UserID: "user-1", Kind: "image", Title: "asset", Status: model.AssetVersionStatusConfirmed, PayloadJSON: `{"data":{"storageKey":"resource:media-1","dataUrl":"https://untrusted.invalid/image"}}`}
	canvas := model.CanvasProject{ID: "canvas-1", UserID: "user-1", Title: "canvas", PayloadJSON: `{"id":"canvas-1","nodes":[]}`}
	for _, value := range []any{&resource, &item, &canvas} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	file := filepath.Join(dataDir, "resources", filepath.FromSlash(resource.ObjectKey))
	if err := os.MkdirAll(filepath.Dir(file), 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("image"), 0640); err != nil {
		t.Fatal(err)
	}
	req := ImportEditingAssetRequest{AssetID: item.ID, OperationID: "import_one", ExpectedRevision: 0}
	host := &editingMediaTestHost{status: 409}
	if _, status, err := svc.ImportEditingAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err != nil || status != 409 {
		t.Fatalf("rejected import: %d %v", status, err)
	}
	var count int64
	check := func(want int64) {
		t.Helper()
		if err := db.Model(&model.EditingAssetReference{}).Count(&count).Error; err != nil || count != want {
			t.Fatalf("references: %d, want %d, err %v", count, want, err)
		}
	}
	check(0)
	host.status = 200
	if _, status, err := svc.ImportEditingAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err != nil || status != 200 {
		t.Fatalf("import: %d %v", status, err)
	}
	if string(host.bytes) != "image" || host.metadata["resourceId"] != "media-1" || host.metadata["width"] != float64(320) {
		t.Fatalf("did not use trusted saved resource: %+v", host)
	}
	if err := svc.DeleteUserAsset("user-1", item.ID); err == nil || !strings.Contains(err.Error(), "剪辑工程") {
		t.Fatalf("referenced asset deletion: %v", err)
	}
	if err := svc.assetLibrary().GuardReplacementCanvasReferences("user-1", nil); err == nil {
		t.Fatal("library replacement removed an editing asset")
	}
	changed := item
	changed.PayloadJSON = `{"data":{"storageKey":"resource:other"}}`
	if err := svc.assetLibrary().GuardCanvasReferences("user-1", changed); err == nil {
		t.Fatal("asset update removed editing resource")
	}
	if err := repository.New(db).DeleteAssetAndResources("user-1", item.ID, []string{resource.ID}, nil); !errors.Is(err, repository.ErrResourceCleanupStillReferenced) {
		t.Fatalf("transaction deletion guard: %v", err)
	}
	host.status = 409
	if _, _, err := svc.ImportEditingAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err != nil {
		t.Fatal(err)
	}
	check(1)
	calls := host.calls
	if _, _, err := svc.ImportEditingAsset(context.Background(), "user-2", canvas.ID, "edit_test", req, host); err == nil {
		t.Fatal("cross-owner project accepted")
	}
	foreign := model.Asset{ID: "foreign", UserID: "user-2", Kind: "image", PayloadJSON: item.PayloadJSON}
	if err := db.Create(&foreign).Error; err != nil {
		t.Fatal(err)
	}
	req.AssetID = foreign.ID
	if _, _, err := svc.ImportEditingAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err == nil {
		t.Fatal("cross-owner asset accepted")
	}
	if host.calls != calls {
		t.Fatal("unowned input reached runtime")
	}
	req.AssetID = item.ID
	req.OperationID = "lost_response"
	host.err = errors.New("disconnected")
	if _, _, err := svc.ImportEditingAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err == nil {
		t.Fatal("lost response reported success")
	}
	check(2)
	host.err = nil
	host.status = 200
	req.OperationID = "hypit_input"
	if _, status, err := svc.ImportHypitAsset(context.Background(), "user-1", canvas.ID, "edit_test", req, host); err != nil || status != 200 {
		t.Fatalf("Hypit input: %d %v", status, err)
	}
	if !strings.Contains(host.route, "/hypit/assets/import?") {
		t.Fatalf("wrong production route: %s", host.route)
	}
	check(3)
}
