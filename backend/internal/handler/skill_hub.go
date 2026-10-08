package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/app"
	"infinite-canvas/backend/internal/assistantruntime"
	"infinite-canvas/backend/internal/skills"
)

func skillHubBuiltinRoots(host *assistantruntime.Host) map[string]string {
	roots := map[string]string{}
	if host == nil {
		return roots
	}
	config, _ := host.EffectiveConfig()
	agentRoot := ""
	for _, arg := range config.HostArgs {
		if strings.HasSuffix(arg, "server.mjs") {
			agentRoot = filepath.Dir(arg)
			break
		}
	}
	exists := func(root string) bool {
		info, err := os.Stat(filepath.Join(root, "SKILL.md"))
		return err == nil && info.Mode().IsRegular()
	}
	editing := filepath.Join(agentRoot, "skills", "beeftv-editing")
	if agentRoot != "" && exists(editing) {
		roots["beeftv-editing"] = editing
	}
	hyperframes := filepath.Join(agentRoot, "skills", "hyperframes")
	if agentRoot != "" && exists(hyperframes) {
		roots["hyperframes"] = hyperframes
	}
	for _, name := range []string{"video-use", "skill-creator"} {
		root := filepath.Join(agentRoot, "skills", name)
		if agentRoot != "" && exists(root) {
			roots[name] = root
		}
	}
	candidates := []string{os.Getenv("BEEFTV_HYPIT_ROOT")}
	if agentRoot != "" {
		candidates = append(candidates, filepath.Join(agentRoot, "hypit"), filepath.Join(agentRoot, "..", "edit-host", "hypit"), filepath.Join(agentRoot, "..", "edit-host", "node_modules", "@hypit", "hypit"), filepath.Join(agentRoot, "..", "..", "hypit"))
	}
	for _, root := range candidates {
		if root == "" {
			continue
		}
		skill := filepath.Join(root, "skills", "hypit")
		if exists(skill) {
			roots["hypit"] = skill
			break
		}
	}
	return roots
}

func RegisterSkillHubRoutes(api *gin.RouterGroup, svc *app.Service, host *assistantruntime.Host) {
	api.GET("/skill-hub", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		items, err := svc.SkillHubList(user.ID, skillHubBuiltinRoots(host))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"skills": items})
	})
	upload := func(c *gin.Context, install bool) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, app.SkillPackageUploadMaxBytes)
		header, err := c.FormFile("file")
		if err != nil {
			failService(c, app.BadAuthRequest("请选择 Skill 文件"))
			return
		}
		file, err := header.Open()
		if err != nil {
			failService(c, err)
			return
		}
		defer file.Close()
		data, err := skills.HubUploadBytes(file)
		if err != nil {
			failService(c, err)
			return
		}
		roots := skillHubBuiltinRoots(host)
		if !install {
			preview, err := svc.SkillHubInspect(user.ID, roots, header.Filename, data, c.PostForm("name"), c.PostForm("description"))
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, preview)
			return
		}
		enabled, err := parseOptionalBool(c.PostForm("enabled"))
		if err != nil {
			failService(c, app.BadAuthRequest("启用状态无效"))
			return
		}
		id, err := svc.SkillHubInstall(user.ID, roots, header.Filename, data, c.PostForm("name"), c.PostForm("description"), c.PostForm("contentHash"), c.PostForm("targetId"), enabled)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"id": id})
	}
	api.POST("/skill-hub/inspect", func(c *gin.Context) { upload(c, false) })
	api.POST("/skill-hub/install", func(c *gin.Context) { upload(c, true) })
	api.PATCH("/skill-hub/:id/enabled", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input struct {
			Enabled *bool `json:"enabled"`
		}
		if c.ShouldBindJSON(&input) != nil || input.Enabled == nil {
			failService(c, app.BadAuthRequest("缺少启用状态"))
			return
		}
		if err := svc.SkillHubSetEnabled(user.ID, c.Param("id"), *input.Enabled); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"enabled": *input.Enabled})
	})
	api.DELETE("/skill-hub/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err = svc.SkillHubDelete(user.ID, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})
	api.GET("/skill-hub/:id/files", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		files, err := svc.SkillHubFiles(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"files": files})
	})
	api.GET("/skill-hub/:id/file", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		file, err := svc.SkillHubFile(user.ID, c.Param("id"), c.Query("path"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, file)
	})
}
