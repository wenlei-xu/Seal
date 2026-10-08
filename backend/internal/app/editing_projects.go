package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"strings"
	"time"
	"unicode/utf8"
)

func (s *Service) ListEditingProjects(userID string) ([]model.EditingProject, error) {
	return s.repo.ListEditingProjects(userID)
}
func (s *Service) UserEditingProject(userID, id string) (*model.EditingProject, error) {
	return s.repo.EditingProjectForUser(userID, id)
}

func editingTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > 150 {
		return "", kernel.BadAuthRequest("请输入 1 至 150 字的工程名称")
	}
	return title, nil
}

func (s *Service) CreateEditingProject(userID, title, operationID string) (*model.EditingProject, error) {
	title, err := editingTitle(title)
	if err != nil {
		return nil, err
	}
	if userID == "" || !editingOperationID.MatchString(operationID) {
		return nil, kernel.BadAuthRequest("新建工程的操作身份无效")
	}
	digest := sha256.Sum256([]byte(userID + "\x00" + operationID))
	now := time.Now().UTC()
	item, err := s.repo.CreateEditingProject(model.EditingProject{ID: "cut_" + hex.EncodeToString(digest[:16]), UserID: userID, Title: title, CreatedAt: now, UpdatedAt: now})
	if err == nil && item.Title != title {
		return nil, kernel.BadAuthRequest("此操作已用于另一个工程名称，请重新新建")
	}
	return item, err
}

func (s *Service) RenameEditingProject(userID, id, title string) (*model.EditingProject, error) {
	title, err := editingTitle(title)
	if err != nil {
		return nil, err
	}
	return s.repo.RenameEditingProject(userID, id, title)
}

// This is assistant scope metadata, not a persisted canvas or a video document.
// Native video source revisions and undo remain in the editing runtime.
func editingAssistantDocument(item *model.EditingProject) (json.RawMessage, error) {
	return json.Marshal(map[string]any{"id": item.ID, "title": item.Title, "workspaceKind": "editing", "revision": 0})
}

func (s *Service) UserAssistantProject(userID, id string) (json.RawMessage, error) {
	if strings.HasPrefix(id, "cut_") {
		item, err := s.UserEditingProject(userID, id)
		if err != nil {
			return nil, err
		}
		return editingAssistantDocument(item)
	}
	return s.UserCanvasProject(userID, id)
}
