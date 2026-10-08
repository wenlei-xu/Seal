package skills

import (
	"archive/zip"
	"bytes"
	"context"
	"infinite-canvas/backend/internal/kernel"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type HubAuthorRequest struct {
	Files              map[string]string `json:"files"`
	TargetID           string            `json:"targetId"`
	ExpectedTargetHash string            `json:"expectedTargetHash"`
	Enabled            bool              `json:"enabled"`
	Save               bool              `json:"save"`
}
type HubAuthorResult struct {
	Preview          HubPreview `json:"preview"`
	ID               string     `json:"id,omitempty"`
	FormatValidated  bool       `json:"formatValidated"`
	BehaviorVerified bool       `json:"behaviorVerified"`
}

func authorZip(files map[string]string) ([]byte, error) {
	if len(files) == 0 || len(files) > maxSkillPackageFiles {
		return nil, kernel.BadAuthRequest("技能文件数量无效")
	}
	names := []string{}
	total := 0
	for name, value := range files {
		total += len(value)
		if len(value) > maxSkillFileBytes || total > maxSkillPackageBytes {
			return nil, kernel.BadAuthRequest("技能文件过大")
		}
		names = append(names, name)
	}
	sort.Strings(names)
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, name := range names {
		file, err := writer.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err = file.Write([]byte(files[name])); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (s *Service) HubAuthor(userID string, roots map[string]string, request HubAuthorRequest) (*HubAuthorResult, error) {
	if request.TargetID != "" && request.ExpectedTargetHash == "" {
		return nil, kernel.BadAuthRequest("更新 Skill 前必须读取当前内容摘要")
	}
	data, err := authorZip(request.Files)
	if err != nil {
		return nil, err
	}
	archive, missing, err := hubArchive("authored.zip", data, "", "")
	if err != nil {
		return nil, err
	}
	if missing {
		return nil, kernel.BadAuthRequest("SKILL.md 缺少 name 或 description")
	}
	result := &HubAuthorResult{Preview: HubPreview{Name: archive.Metadata.Name, Description: archive.Metadata.Description, Version: archive.Metadata.Version, ContentHash: archive.ContentHash, FileCount: len(archive.Files), Entry: string(archive.Files["SKILL.md"]), BuiltinConflict: reservedRuntimeSkillName(archive.Metadata.Name)}, FormatValidated: true, BehaviorVerified: false}
	if !request.Save {
		return result, nil
	}
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	result.ID, err = s.installHubArchive(userID, roots, archive, request.TargetID, request.Enabled, &request.ExpectedTargetHash, hubOrigin{Type: "authored"})
	return result, err
}

type HubDownloadRequest struct {
	URL                string `json:"url"`
	Ref                string `json:"ref"`
	Subdir             string `json:"subdir"`
	TargetID           string `json:"targetId"`
	ExpectedTargetHash string `json:"expectedTargetHash"`
	Enabled            bool   `json:"enabled"`
}
type HubSearchItem struct {
	URL         string `json:"url"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Verified    bool   `json:"verified"`
}

func (s *Service) HubSearch(ctx context.Context, query string) ([]HubSearchItem, error) {
	query = strings.TrimSpace(query)
	if query == "" || len(query) > 200 {
		return nil, kernel.BadAuthRequest("请提供简短的技能搜索词")
	}
	var result struct {
		Items []struct {
			FullName    string `json:"full_name"`
			HTMLURL     string `json:"html_url"`
			Description string `json:"description"`
		} `json:"items"`
	}
	err := githubJSON(ctx, &http.Client{Timeout: 30 * time.Second}, "https://api.github.com/search/repositories?per_page=10&q="+url.QueryEscape(query+" skill"), &result)
	if err != nil {
		return nil, kernel.WrapAppError(http.StatusBadGateway, "技能搜索失败", err)
	}
	items := []HubSearchItem{}
	for _, item := range result.Items {
		items = append(items, HubSearchItem{URL: item.HTMLURL, Name: item.FullName, Description: item.Description, Verified: false})
	}
	return items, nil
}

func (s *Service) HubDownload(ctx context.Context, userID string, roots map[string]string, request HubDownloadRequest) (*HubAuthorResult, error) {
	if request.TargetID != "" && request.ExpectedTargetHash == "" {
		return nil, kernel.BadAuthRequest("更新 Skill 前必须读取当前内容摘要")
	}
	spec, err := parseGitHubSkillURL(request.URL, request.Ref, request.Subdir)
	if err != nil {
		return nil, err
	}
	archive, commit, canonical, ref, err := fetchGitHubSkillArchive(ctx, spec)
	if err != nil {
		return nil, kernel.WrapAppError(http.StatusBadGateway, "技能下载失败", err)
	}
	// Re-validate the actual archive with the same portable Hub import rules.
	// Keep binary assets byte-for-byte in the zip instead of treating them as text.
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	names := []string{}
	for name := range archive.Files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		file, e := writer.Create(name)
		if e != nil {
			return nil, e
		}
		if _, e = file.Write(archive.Files[name]); e != nil {
			return nil, e
		}
	}
	if err = writer.Close(); err != nil {
		return nil, err
	}
	archive, missing, err := hubArchive("download.zip", buffer.Bytes(), "", "")
	if err != nil {
		return nil, err
	}
	if missing {
		return nil, kernel.BadAuthRequest("下载的技能缺少入口元数据，请指定包含一个 SKILL.md 的子目录")
	}
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	id, err := s.installHubArchive(userID, roots, archive, request.TargetID, request.Enabled, &request.ExpectedTargetHash, hubOrigin{Type: "github", URL: canonical, Ref: ref, Subdir: spec.Subdir, Commit: commit})
	if err != nil {
		return nil, err
	}
	return &HubAuthorResult{ID: id, Preview: HubPreview{Name: archive.Metadata.Name, Description: archive.Metadata.Description, ContentHash: archive.ContentHash, Version: shortCommit(commit), FileCount: len(archive.Files)}, FormatValidated: true, BehaviorVerified: false}, nil
}
