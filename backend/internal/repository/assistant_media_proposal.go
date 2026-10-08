package repository

import (
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

func (r *Repository) CreateAssistantMediaProposal(item *model.AssistantMediaProposal) error {
	return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(item).Error
}
func (r *Repository) AssistantMediaProposal(userID, projectID, id string) (*model.AssistantMediaProposal, error) {
	var item model.AssistantMediaProposal
	err := r.db.Where("id = ? AND user_id = ? AND project_id = ?", id, userID, projectID).First(&item).Error
	return &item, err
}
func (r *Repository) AssistantMediaProposals(userID, projectID string) ([]model.AssistantMediaProposal, error) {
	items := []model.AssistantMediaProposal{}
	err := r.db.Where("user_id = ? AND project_id = ?", userID, projectID).Order("created_at DESC").Limit(100).Find(&items).Error
	return items, err
}
func (r *Repository) BindAssistantMediaTask(userID, projectID, id, taskID string) error {
	return r.db.Model(&model.AssistantMediaProposal{}).Where("id = ? AND user_id = ? AND project_id = ? AND (task_id = '' OR task_id = ?)", id, userID, projectID, taskID).Update("task_id", taskID).Error
}
