package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"infinite-canvas/backend/internal/assets"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

type EditingMediaHost interface {
	OpenStream(context.Context, string, string, io.Reader, []byte) (*http.Response, error)
}

type ImportEditingAssetRequest struct {
	AssetID          string `json:"assetId"`
	OperationID      string `json:"operationId"`
	ExpectedRevision int64  `json:"expectedRevision"`
}

var editingOperationID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

func (s *Service) ImportEditingAsset(ctx context.Context, userID, canvasID, editID string, req ImportEditingAssetRequest, host EditingMediaHost) (json.RawMessage, int, error) {
	return s.importEditingAsset(ctx, userID, canvasID, editID, req, host, "/assets/import")
}

func (s *Service) ImportHypitAsset(ctx context.Context, userID, canvasID, editID string, req ImportEditingAssetRequest, host EditingMediaHost) (json.RawMessage, int, error) {
	return s.importEditingAsset(ctx, userID, canvasID, editID, req, host, "/hypit/assets/import")
}

func (s *Service) importEditingAsset(ctx context.Context, userID, canvasID, editID string, req ImportEditingAssetRequest, host EditingMediaHost, action string) (json.RawMessage, int, error) {
	if !editingOperationID.MatchString(req.OperationID) || !editingOperationID.MatchString(editID) || req.ExpectedRevision < 0 {
		return nil, 400, kernel.BadAuthRequest("剪辑提交身份无效")
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if _, err := s.UserAssistantProject(userID, canvasID); err != nil {
		return nil, 404, err
	}
	item, err := s.repo.AssetForUser(userID, req.AssetID)
	if err != nil {
		return nil, 404, err
	}
	if item.Status == model.AssetVersionStatusArchived {
		return nil, 409, kernel.BadAuthRequest("请先恢复归档素材")
	}
	if item.Kind != "image" && item.Kind != "video" && item.Kind != "audio" {
		return nil, 400, kernel.BadAuthRequest("请选择图片、视频或音频素材")
	}
	var payload struct {
		Data struct {
			StorageKey string `json:"storageKey"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
		return nil, 400, err
	}
	resourceID := assets.ResourceID(payload.Data.StorageKey)
	if resourceID == "" {
		return nil, 409, kernel.BadAuthRequest("素材还没有保存到本地资产库")
	}
	resource, body, err := s.OpenResource(userID, resourceID)
	if err != nil {
		return nil, 409, err
	}
	defer body.Close()
	if resource.Kind != item.Kind {
		return nil, 409, kernel.BadAuthRequest("素材与资源类型不一致")
	}
	metadata, err := json.Marshal(map[string]any{"assetId": item.ID, "resourceId": resource.ID, "title": item.Title,
		"kind": resource.Kind, "mimeType": resource.MimeType, "size": resource.Size,
		"width": resource.Width, "height": resource.Height, "durationMs": resource.DurationMs,
		"operationId": req.OperationID, "expectedRevision": req.ExpectedRevision})
	if err != nil {
		return nil, 500, err
	}
	digest := sha256.Sum256([]byte(userID + "\x00" + editID + "\x00" + action + "\x00" + req.OperationID))
	refID := hex.EncodeToString(digest[:])
	// Pin before the runtime commits. A lost response retains the pin so a retry
	// can reconcile the same operation without deletion invalidating undo.
	created, err := s.repo.PinEditingAsset(model.EditingAssetReference{ID: refID, UserID: userID, CanvasID: canvasID,
		EditID: editID, AssetID: item.ID, ResourceID: resource.ID, CreatedAt: time.Now()})
	if err != nil {
		return nil, 409, err
	}
	route := "/edits/" + url.PathEscape(editID) + action + "?projectId=" + url.QueryEscape(canvasID)
	response, err := host.OpenStream(ctx, http.MethodPost, route, body, metadata)
	if err != nil {
		return nil, 503, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil || !json.Valid(raw) {
		return nil, 502, kernel.BadAuthRequest("素材导入响应不完整，请重试同一操作")
	}
	if created && response.StatusCode >= 400 && response.StatusCode < 500 {
		if err := s.repo.UnpinEditingAsset(userID, refID); err != nil {
			return nil, 500, err
		}
	}
	return raw, response.StatusCode, nil
}
