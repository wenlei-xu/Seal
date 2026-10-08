package app

import (
	"context"
	"infinite-canvas/backend/internal/skills"
)

type SkillHubPreview = skills.HubPreview
type SkillHubItem = skills.HubItem
type SkillRuntimeSnapshot = skills.RuntimeSkillSnapshot

func (s *Service) SkillHubList(userID string, roots map[string]string) ([]SkillHubItem, error) {
	return s.skillDomain().HubList(userID, roots)
}
func (s *Service) SkillHubInspect(userID string, roots map[string]string, filename string, data []byte, name, description string) (*SkillHubPreview, error) {
	return s.skillDomain().HubInspect(userID, roots, filename, data, name, description)
}
func (s *Service) SkillHubInstall(userID string, roots map[string]string, filename string, data []byte, name, description, hash, targetID string, enabled bool) (string, error) {
	return s.skillDomain().HubInstall(userID, roots, filename, data, name, description, hash, targetID, enabled)
}
func (s *Service) SkillHubSetEnabled(userID, id string, enabled bool) error {
	return s.skillDomain().HubSetEnabled(userID, id, enabled)
}
func (s *Service) SkillHubDelete(userID, id string) error {
	return s.skillDomain().HubDelete(userID, id)
}
func (s *Service) SkillHubFiles(userID, id string) ([]SkillPackageFileItem, error) {
	return s.skillDomain().HubFiles(userID, id)
}
func (s *Service) SkillHubFile(userID, id, file string) (*SkillPackageFileContent, error) {
	return s.skillDomain().HubFile(userID, id, file)
}
func (s *Service) SkillHubSnapshot(userID string, roots map[string]string) (*SkillRuntimeSnapshot, error) {
	return s.skillDomain().HubSnapshot(userID, roots)
}

func (s *Service) SkillHubAuthor(userID string, roots map[string]string, request skills.HubAuthorRequest) (*skills.HubAuthorResult, error) {
	return s.skillDomain().HubAuthor(userID, roots, request)
}
func (s *Service) SkillHubDownload(ctx context.Context, userID string, roots map[string]string, request skills.HubDownloadRequest) (*skills.HubAuthorResult, error) {
	return s.skillDomain().HubDownload(ctx, userID, roots, request)
}
func (s *Service) SkillHubSearch(ctx context.Context, query string) ([]skills.HubSearchItem, error) {
	return s.skillDomain().HubSearch(ctx, query)
}
