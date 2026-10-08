package model

import "time"

// EditingProject owns a standalone editing workspace, independently of CanvasProject.
type EditingProject struct {
	ID        string    `json:"id" gorm:"primaryKey;size:80"`
	UserID    string    `json:"-" gorm:"index;size:64;not null"`
	Title     string    `json:"title" gorm:"size:150;not null"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
