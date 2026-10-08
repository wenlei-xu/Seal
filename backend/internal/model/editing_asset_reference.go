package model

import "time"

// References include undoable imports. Removing a clip must not invalidate undo.
type EditingAssetReference struct {
	ID         string `gorm:"primaryKey;size:64"`
	UserID     string `gorm:"index;size:36"`
	CanvasID   string `gorm:"index;size:80"`
	EditID     string `gorm:"index;size:128"`
	AssetID    string `gorm:"index;size:80"`
	ResourceID string `gorm:"index;size:36"`
	CreatedAt  time.Time
}
