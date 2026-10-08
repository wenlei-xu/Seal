package app

import (
	"context"
	"fmt"
)

func (s *Service) CheckDesktopUpdateReady(ctx context.Context) error {
	owner, err := s.LocalWorkspaceOwner()
	if err != nil {
		return err
	}
	count, err := s.repo.CountPendingDesktopTasks(ctx, owner.ID)
	if err != nil {
		return fmt.Errorf("无法确认任务状态，更新未开始：%w", err)
	}
	if count > 0 {
		return fmt.Errorf("还有 %d 个创作任务未完成，请等待任务完成或取消后再更新", count)
	}
	return nil
}
