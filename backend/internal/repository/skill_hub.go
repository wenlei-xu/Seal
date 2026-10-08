package repository

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

func (r *Repository) SkillHubRows(userID string) ([]model.Skill, error) {
	var rows []model.Skill
	err := r.db.Where("source_type = ? OR (owner_id = ? AND source_type IN ?)", "runtime-builtin", userID, []string{"markdown", "zip", "authored", "github"}).Order("created_at asc").Find(&rows).Error
	return rows, err
}

func (r *Repository) SetSkillRuntimeEnabled(userID, skillID string, enabled bool) error {
	state := model.UserSkillState{ID: kernel.NewID(), UserID: userID, SkillID: skillID, RuntimeEnabled: &enabled}
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}, {Name: "skill_id"}}, DoUpdates: clause.AssignmentColumns([]string{"runtime_enabled", "updated_at"})}).Create(&state).Error; err != nil {
			return err
		}
		return bumpSkillRevision(tx, userID)
	})
}

func bumpSkillRevision(tx *gorm.DB, userID string) error {
	return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, DoUpdates: clause.Assignments(map[string]any{"revision": gorm.Expr("revision + 1")})}).Create(&model.SkillRuntimeRevision{UserID: userID, Revision: 1}).Error
}

func (r *Repository) BumpSkillRevision(userID string) error { return bumpSkillRevision(r.db, userID) }
func (r *Repository) SkillRuntimeRevision(userID string) (uint64, error) {
	var row model.SkillRuntimeRevision
	err := r.db.Where("user_id = ?", userID).Limit(1).Find(&row).Error
	return row.Revision, err
}
