package handler

import (
	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/app"
	"net/http"
)

func registerStandaloneEditingProjects(api gin.IRouter, svc *app.Service) {
	owner := func(c *gin.Context) (string, bool) {
		if !isLoopbackRequest(c.Request) {
			c.JSON(403, gin.H{"code": 403, "reason": "forbidden", "msg": "剪辑工程只接受本机请求"})
			return "", false
		}
		if !requireTrustedDesktopWritePrincipal(c, "剪辑工程需要受信任的本机界面") {
			return "", false
		}
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return "", false
		}
		return user.ID, true
	}
	api.GET("/editing-projects", func(c *gin.Context) {
		userID, allowed := owner(c)
		if !allowed {
			return
		}
		items, err := svc.ListEditingProjects(userID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"projects": items})
	})
	api.POST("/editing-projects", func(c *gin.Context) {
		userID, allowed := owner(c)
		if !allowed {
			return
		}
		var input struct {
			Title       string `json:"title"`
			OperationID string `json:"operationId"`
		}
		if c.ShouldBindJSON(&input) != nil {
			fail(c, http.StatusBadRequest, app.BadAuthRequest("工程名称与操作身份必填"))
			return
		}
		item, err := svc.CreateEditingProject(userID, input.Title, input.OperationID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, item)
	})
	api.GET("/editing-projects/:projectId", func(c *gin.Context) {
		userID, allowed := owner(c)
		if !allowed {
			return
		}
		item, err := svc.UserEditingProject(userID, c.Param("projectId"))
		if err != nil {
			fail(c, 404, app.BadAuthRequest("剪辑工程不存在"))
			return
		}
		ok(c, item)
	})
	api.PATCH("/editing-projects/:projectId", func(c *gin.Context) {
		userID, allowed := owner(c)
		if !allowed {
			return
		}
		var input struct {
			Title string `json:"title"`
		}
		if c.ShouldBindJSON(&input) != nil {
			fail(c, 400, app.BadAuthRequest("工程名称必填"))
			return
		}
		if _, err := svc.UserEditingProject(userID, c.Param("projectId")); err != nil {
			fail(c, 404, app.BadAuthRequest("剪辑工程不存在"))
			return
		}
		item, err := svc.RenameEditingProject(userID, c.Param("projectId"), input.Title)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, item)
	})
}
