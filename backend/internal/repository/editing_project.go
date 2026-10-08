package repository

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

func (r *Repository) EditingProjectForUser(userID, id string) (*model.EditingProject, error) {
	var item model.EditingProject
	err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&item).Error
	return &item, err
}

func (r *Repository) ListEditingProjects(userID string) ([]model.EditingProject, error) {
	items := []model.EditingProject{}
	err := r.db.Where("user_id = ?", userID).Order("updated_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) CreateEditingProject(item model.EditingProject) (*model.EditingProject, error) {
	if err := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&item).Error; err != nil {
		return nil, err
	}
	return r.EditingProjectForUser(item.UserID, item.ID)
}

func (r *Repository) RenameEditingProject(userID, id, title string) (*model.EditingProject, error) {
	result := r.db.Model(&model.EditingProject{}).Where("user_id = ? AND id = ?", userID, id).Update("title", title)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return r.EditingProjectForUser(userID, id)
}
