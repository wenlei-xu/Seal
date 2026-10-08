package handler

import (
	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/app"
	localtask "infinite-canvas/backend/internal/task"
	"net/http"
	"time"
)

func RegisterAssistantMediaRoutes(api *gin.RouterGroup, svc *app.Service) {
	group := api.Group("/assistant/projects/:projectId/media")
	group.POST("/propose", func(c *gin.Context) {
		userID, _, valid := creatorScope(c, svc)
		if !valid {
			return
		}
		var request struct {
			OperationID string `json:"operationId"`
			Kind        string `json:"kind"`
			Prompt      string `json:"prompt"`
			Model       string `json:"model"`
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
		if c.ShouldBindJSON(&request) != nil {
			fail(c, 400, app.BadAuthRequest("生成方案无效"))
			return
		}
		proposal, err := svc.AssistantMediaPropose(userID, c.Param("projectId"), request.OperationID, request.Kind, request.Prompt, request.Model)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, proposal)
	})
	group.POST("/proposals", func(c *gin.Context) {
		userID, _, valid := creatorScope(c, svc)
		if !valid {
			return
		}
		items, err := svc.AssistantMediaProposals(userID, c.Param("projectId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"items": items})
	})
	group.POST("/task", func(c *gin.Context) {
		userID, _, valid := creatorScope(c, svc)
		if !valid {
			return
		}
		var request struct {
			TaskID string `json:"taskId"`
		}
		if c.ShouldBindJSON(&request) != nil {
			fail(c, 400, app.BadAuthRequest("生成任务无效"))
			return
		}
		item, err := svc.AssistantMediaTask(userID, c.Param("projectId"), request.TaskID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, item)
	})
	group.POST("/accept/:proposalId", func(c *gin.Context) {
		// Host tools cannot admit billable generation using their launch token.
		if c.GetHeader(assistantHostTokenHeader) != "" || !requireTrustedDesktopWritePrincipal(c, "请在界面确认后开始生成") {
			if !c.Writer.Written() {
				fail(c, 403, app.BadAuthRequest("助手只能提出生成方案，不能代替界面确认"))
			}
			return
		}
		userID, _, valid := creatorScope(c, svc)
		if !valid {
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "tasks:"+userID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<20)
		var request localtask.CreateRequest
		if c.ShouldBindJSON(&request) != nil {
			fail(c, 400, app.BadAuthRequest("生成参数无效"))
			return
		}
		request.TraceID, request.RequestID = TraceID(c), RequestID(c)
		item, err := svc.AcceptAssistantMedia(userID, c.Param("projectId"), c.Param("proposalId"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, item)
	})
}
