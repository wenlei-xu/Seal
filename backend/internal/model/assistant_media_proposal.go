package model

import "time"

// Proposals contain no channel secrets; accepted work uses the existing task ledger.
type AssistantMediaProposal struct {
	ID             string    `json:"proposalId" gorm:"primaryKey;size:80"`
	UserID         string    `json:"-" gorm:"size:36;index"`
	ProjectID      string    `json:"projectId" gorm:"size:100;index"`
	Kind           string    `json:"kind"`
	Prompt         string    `json:"prompt"`
	Model          string    `json:"model"`
	ModelKey       string    `json:"modelKey"`
	ConfigRevision int64     `json:"configRevision"`
	TaskID         string    `json:"taskId,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}
