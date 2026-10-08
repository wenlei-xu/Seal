package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"infinite-canvas/backend/internal/assets"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	localtask "infinite-canvas/backend/internal/task"
	"infinite-canvas/backend/internal/transcription"
	"strings"
)

func (s *Service) AssistantTranscribeAsset(userID, projectID, assetID, language, route string) (*model.Task, error) {
	if _, err := s.UserAssistantProject(userID, projectID); err != nil {
		return nil, err
	}
	asset, err := s.repo.AssetForUser(userID, assetID)
	if err != nil {
		return nil, err
	}
	if asset.Status == model.AssetVersionStatusArchived || asset.Kind != "video" && asset.Kind != "audio" {
		return nil, kernel.BadAuthRequest("请选择未归档的音视频素材")
	}
	var payload struct {
		Data struct {
			StorageKey string `json:"storageKey"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(asset.PayloadJSON), &payload); err != nil {
		return nil, err
	}
	resourceID := assets.ResourceID(payload.Data.StorageKey)
	if resourceID == "" {
		return nil, kernel.BadAuthRequest("素材还没有保存到本地资产库")
	}
	language = strings.TrimSpace(language)
	if language == "auto" {
		language = ""
	}
	route, runtimeKey, settings, err := transcription.ResolveConfiguredRoute(s.dataDir, route)
	if err != nil {
		return nil, kernel.BadAuthRequest(err.Error())
	}
	if language == "" {
		language = settings.Language
	}
	key := sha256.Sum256([]byte(userID + "\x00" + projectID + "\x00" + resourceID + "\x00" + language + "\x00" + runtimeKey))
	return s.CreateTimelineTranscriptionTask(userID, localtask.TimelineTranscriptionCreateRequest{ResourceID: resourceID, ProjectID: projectID, Language: language, Route: route, RuntimeKey: runtimeKey, ClientOperationID: "asr_" + hex.EncodeToString(key[:])})
}
