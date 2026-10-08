package repository

import (
	"context"
	"infinite-canvas/backend/internal/model"
)

func (r *Repository) CountPendingDesktopTasks(ctx context.Context, userID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Task{}).Where("user_id = ? AND status IN ?", userID,
		[]model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning, model.TaskStatusTextReplay}).Count(&count).Error
	return count, err
}
