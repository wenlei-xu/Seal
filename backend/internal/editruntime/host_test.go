package editruntime

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	stdimage "image"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOwnedMediaStreamingAndDurableExportDownload(t *testing.T) {
	if _, _, err := command(); err != nil {
		t.Skip(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	root := t.TempDir()
	host := New(root)
	t.Cleanup(func() {
		shutdown, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if err := host.Close(shutdown); err != nil {
			t.Error(err)
		}
	})
	raw, status, err := host.Call(ctx, http.MethodPost, "/open", []byte(`{"projectId":"stream_test","parentOrigin":"http://127.0.0.1:5173"}`))
	if err != nil || status != 200 {
		t.Fatalf("open: %d %v", status, err)
	}
	var launched struct {
		Data struct {
			EditID string `json:"editId"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &launched); err != nil {
		t.Fatal(err)
	}
	editID := launched.Data.EditID
	if editID == "" {
		t.Fatal("no edit identity")
	}
	image, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=")
	metadata, _ := json.Marshal(map[string]any{"assetId": "saved-image", "resourceId": "saved-resource", "kind": "image", "mimeType": "image/png", "title": "saved", "size": len(image), "width": 1, "height": 1, "operationId": "stream_import", "expectedRevision": 0})
	route := "/edits/" + editID + "/assets/import?projectId=stream_test"
	for i := 0; i < 2; i++ {
		response, err := host.OpenStream(ctx, http.MethodPost, route, bytes.NewReader(image), metadata)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("stream import: %d %v %s", response.StatusCode, err, body)
		}
		var receipt struct {
			Data struct {
				Revision int
				Replayed bool
			}
		}
		if err := json.Unmarshal(body, &receipt); err != nil {
			t.Fatal(err)
		}
		if receipt.Data.Revision != 1 || receipt.Data.Replayed != (i == 1) {
			t.Fatalf("wrong import receipt: %+v", receipt.Data)
		}
	}
	response, err := host.OpenStream(ctx, http.MethodPost, "/edits/"+editID+"/assets/import?projectId=wrong", bytes.NewReader(image), metadata)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatalf("wrong project accepted: %d", response.StatusCode)
	}
	// Production inputs use the same private byte channel, but do not insert
	// a second timeline clip or advance the editing revision.
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, stdimage.NewRGBA(stdimage.Rect(0, 0, 16, 16))); err != nil {
		t.Fatal(err)
	}
	inputMetadata, _ := json.Marshal(map[string]any{"assetId": "production-image", "resourceId": "production-resource", "kind": "image", "mimeType": "image/png", "title": "reference", "size": encoded.Len(), "width": 16, "height": 16, "operationId": "production_input", "expectedRevision": 1})
	inputRoute := "/edits/" + editID + "/hypit/assets/import?projectId=stream_test"
	var inputID string
	for i := 0; i < 2; i++ {
		response, err := host.OpenStream(ctx, http.MethodPost, inputRoute, bytes.NewReader(encoded.Bytes()), inputMetadata)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("production stream: %d %v %s", response.StatusCode, err, body)
		}
		var record struct {
			Data struct {
				InputID  string `json:"inputId"`
				Replayed bool   `json:"replayed"`
			}
		}
		if err := json.Unmarshal(body, &record); err != nil {
			t.Fatal(err)
		}
		if record.Data.InputID == "" || record.Data.Replayed != (i == 1) || (i == 1 && record.Data.InputID != inputID) {
			t.Fatalf("production receipt: %s", body)
		}
		inputID = record.Data.InputID
	}
	frameRequest, _ := json.Marshal(map[string]any{"inputId": inputID})
	raw, status, err = host.Call(ctx, http.MethodPost, "/edits/"+editID+"/hypit/frames?projectId=stream_test", frameRequest)
	if err != nil || status != 200 || !bytes.Contains(raw, []byte("image/jpeg")) {
		t.Fatalf("production reference frame: %d %v %s", status, err, raw)
	}
	// Protocol fixture: completed output reads survive a runtime restart.
	directory := filepath.Join(root, "edits", "edits", editID, "exports", "export_fixture")
	if err := os.MkdirAll(directory, 0750); err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(map[string]any{"editId": editID, "exportId": "export_fixture", "revision": 1, "createdAt": "2026-10-06T00:00:00Z", "options": map[string]string{"format": "mp4"}})
	for name, body := range map[string][]byte{"input.json": input, "status.json": []byte(`{"exportId":"export_fixture","status":"complete","progress":1}`), "output.mp4": []byte("export-protocol-fixture")} {
		if err := os.WriteFile(filepath.Join(directory, name), body, 0640); err != nil {
			t.Fatal(err)
		}
	}
	if err := host.Close(ctx); err != nil {
		t.Fatal(err)
	}
	raw, status, err = host.Call(ctx, http.MethodGet, "/edits/"+editID+"/exports?projectId=stream_test", nil)
	if err != nil || status != 200 || !bytes.Contains(raw, []byte("export_fixture")) {
		t.Fatalf("durable exports: %d %v", status, err)
	}
	response, err = host.OpenStream(ctx, http.MethodGet, "/edits/"+editID+"/exports/export_fixture/file?projectId=stream_test", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || string(body) != "export-protocol-fixture" || response.Header.Get("Content-Type") != "video/mp4" {
		t.Fatalf("download: %d %v", response.StatusCode, err)
	}
}
