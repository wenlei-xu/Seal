package skills

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/goccy/go-yaml"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

type HubItem struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	DisplayName  string    `json:"displayName"`
	Description  string    `json:"description"`
	Builtin      bool      `json:"builtin"`
	Enabled      bool      `json:"enabled"`
	Version      string    `json:"version"`
	ContentHash  string    `json:"contentHash"`
	FileCount    int       `json:"fileCount"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Problem      string    `json:"problem,omitempty"`
	SourceType   string    `json:"sourceType"`
	SourceURL    string    `json:"sourceUrl,omitempty"`
	SourceCommit string    `json:"sourceCommit,omitempty"`
}

func reservedRuntimeSkillName(name string) bool {
	switch name {
	case "hypit", "beeftv-editing", "hyperframes", "video-use", "skill-creator":
		return true
	}
	return false
}

type HubPreview struct {
	Name            string `json:"name"`
	Description     string `json:"description"`
	Version         string `json:"version"`
	ContentHash     string `json:"contentHash"`
	FileCount       int    `json:"fileCount"`
	Entry           string `json:"entry"`
	NeedsMetadata   bool   `json:"needsMetadata"`
	ExistingID      string `json:"existingId,omitempty"`
	BuiltinConflict bool   `json:"builtinConflict,omitempty"`
}
type RuntimeSkill struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
	Description string `json:"description"`
	Version     string `json:"version"`
	ContentHash string `json:"contentHash"`
	Root        string `json:"root"`
}
type RuntimeSkillSnapshot struct {
	UserScope string         `json:"userScope"`
	Revision  string         `json:"revision"`
	Skills    []RuntimeSkill `json:"skills"`
}

var runtimeSkillName = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var skillWindowsDevice = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)`)

func hubArchive(filename string, data []byte, name, description string) (skillPackageArchive, bool, error) {
	var archive skillPackageArchive
	var err error
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".zip":
		archive, err = archiveFromZip(data, "", skillPackageMetadata{Name: "pending", Description: "待填写"})
	case ".md", ".markdown":
		if len(data) == 0 || len(data) > maxSkillFileBytes || !utf8.Valid(data) {
			return archive, false, kernel.BadAuthRequest("Markdown 文件为空、过大或不是 UTF-8")
		}
		archive.Files = map[string][]byte{"SKILL.md": data}
	default:
		return archive, false, kernel.BadAuthRequest("请选择 Markdown 或 ZIP 文件")
	}
	if err != nil {
		return archive, false, err
	}
	entries := 0
	paths := map[string]bool{}
	for file := range archive.Files {
		for _, part := range strings.Split(file, "/") {
			if strings.ContainsAny(part, `<>:"|?*`) || strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") || skillWindowsDevice.MatchString(part) || part == ".content-hash" {
				return archive, false, kernel.BadAuthRequest("技能包包含不能安全保存的文件名")
			}
		}
		if strings.EqualFold(filepath.Base(file), "SKILL.md") {
			entries++
		}
		lower := strings.ToLower(file)
		if paths[lower] {
			return archive, false, kernel.BadAuthRequest("技能包包含大小写冲突的文件路径")
		}
		paths[lower] = true
	}
	if entries != 1 {
		return archive, false, kernel.BadAuthRequest("请导入只有一个 SKILL.md 的技能目录")
	}
	if !utf8.Valid(archive.Files["SKILL.md"]) {
		return archive, false, kernel.BadAuthRequest("SKILL.md 必须是 UTF-8 文本")
	}
	if len(archive.Files["SKILL.md"]) > maxSkillPreviewBytes {
		return archive, false, kernel.BadAuthRequest("SKILL.md 不能超过 512KB，请将长篇内容放入引用文件")
	}
	source := strings.TrimPrefix(string(archive.Files["SKILL.md"]), "\ufeff")
	archive.Files["SKILL.md"] = []byte(source)
	values := map[string]any{}
	body := source
	if strings.HasPrefix(source, "---\n") || strings.HasPrefix(source, "---\r\n") {
		normalized := strings.ReplaceAll(source, "\r\n", "\n")
		end := strings.Index(normalized[4:], "\n---")
		if end < 0 {
			return archive, false, kernel.BadAuthRequest("SKILL.md 的元数据区没有正确结束")
		}
		end += 4
		if err = yaml.Unmarshal([]byte(normalized[4:end]), &values); err != nil {
			return archive, false, kernel.BadAuthRequest("SKILL.md 元数据无法解析")
		}
		body = strings.TrimPrefix(normalized[end+4:], "\n")
	}
	field := func(key string) string { v, _ := values[key].(string); return strings.TrimSpace(v) }
	if field("name") == "" && name != "" {
		values["name"] = strings.TrimSpace(name)
	}
	if field("description") == "" && description != "" {
		values["description"] = strings.TrimSpace(description)
	}
	n, d := field("name"), field("description")
	if n == "" || d == "" {
		return archive, true, nil
	}
	if len(n) > 64 || !runtimeSkillName.MatchString(n) {
		return archive, false, kernel.BadAuthRequest("Skill 标识须为小写英文、数字和短横线，最长 64 字符")
	}
	if len([]rune(d)) > 1024 {
		return archive, false, kernel.BadAuthRequest("Skill 用途最长 1024 字符")
	}
	// Normalize only imports whose required frontmatter was supplied by the user.
	if !strings.HasPrefix(source, "---") || parseFrontmatterMissing(source) {
		header, e := yaml.Marshal(values)
		if e != nil {
			return archive, false, e
		}
		archive.Files["SKILL.md"] = []byte("---\n" + string(header) + "---\n\n" + body)
	}
	version := field("version")
	if metadata, ok := values["metadata"].(map[string]any); ok && version == "" {
		version, _ = metadata["version"].(string)
	}
	archive, err = finalizeSkillArchive(archive.Files, skillPackageMetadata{Name: n, Description: kernel.TruncateRunes(d, 500), Version: version})
	return archive, false, err
}

func parseFrontmatterMissing(source string) bool {
	normalized := strings.ReplaceAll(source, "\r\n", "\n")
	if !strings.HasPrefix(normalized, "---\n") {
		return true
	}
	end := strings.Index(normalized[4:], "\n---")
	if end < 0 {
		return true
	}
	var values map[string]any
	if yaml.Unmarshal([]byte(normalized[4:4+end]), &values) != nil {
		return true
	}
	n, _ := values["name"].(string)
	d, _ := values["description"].(string)
	return strings.TrimSpace(n) == "" || strings.TrimSpace(d) == ""
}

func (s *Service) ensureHubBuiltins(roots map[string]string) error {
	for name, root := range roots {
		if root == "" {
			continue
		}
		files := map[string][]byte{}
		var total int64
		err := filepath.WalkDir(root, func(file string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return kernel.BadAuthRequest("内置 Skill 包不能包含链接")
			}
			info, e := entry.Info()
			if e != nil {
				return e
			}
			if !info.Mode().IsRegular() || info.Size() > maxSkillFileBytes {
				return kernel.BadAuthRequest("内置 Skill 文件格式无效")
			}
			total += info.Size()
			// The pinned official HyperFrames suite includes examples and references.
			// User-uploaded archives retain the separate 512-file limit.
			fileLimit := maxSkillPackageFiles
			if name == "hyperframes" {
				fileLimit = 1024
			}
			if total > maxSkillPackageBytes || len(files) >= fileLimit {
				return kernel.BadAuthRequest("内置 Skill 包过大")
			}
			rel, e := filepath.Rel(root, file)
			if e != nil {
				return e
			}
			data, e := os.ReadFile(file)
			if e != nil {
				return e
			}
			files[filepath.ToSlash(rel)] = data
			return nil
		})
		if err != nil {
			return err
		}
		archive, err := finalizeSkillArchive(files, parseSkillPackageMetadata(files["SKILL.md"]))
		if err != nil {
			return err
		}
		id := "runtime_" + name
		existing, err := s.repo.Skill(id)
		if err == nil {
			if existing.ContentHash != archive.ContentHash {
				existing.Description = archive.Metadata.Description
				existing.Instruction = string(files["SKILL.md"])
				if err = s.addSkillArchiveVersion(existing, archive, "runtime-builtin", "", "", "", "", false); err != nil {
					return err
				}
			}
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		versionID := kernel.NewID()
		_, version, records, err := s.persistSkillArchive(id, versionID, archive, "")
		if err != nil {
			return err
		}
		version.VersionLabel = archive.Metadata.Version
		if version.VersionLabel == "" {
			version.VersionLabel = "内置"
		}
		row := &model.Skill{ID: id, Name: name, Description: archive.Metadata.Description, Instruction: string(files["SKILL.md"]), CurrentVersionID: versionID, VersionLabel: version.VersionLabel, ContentHash: archive.ContentHash, FileCount: len(files), TotalBytes: archive.TotalBytes, SourceType: "runtime-builtin", Source: 3, Status: 1}
		if err = s.repo.CreateSkillWithPackage(row, version, records, nil); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) hubRows(userID string, roots map[string]string) ([]HubItem, error) {
	if userID == "" {
		return nil, kernel.BadAuthRequest("缺少当前工作区身份")
	}
	if err := s.ensureHubBuiltins(roots); err != nil {
		return nil, err
	}
	rows, err := s.repo.SkillHubRows(userID)
	if err != nil {
		return nil, err
	}
	items := make([]HubItem, 0, len(rows))
	for _, row := range rows {
		builtin := row.SourceType == "runtime-builtin"
		state, err := s.repo.UserSkillState(userID, row.ID)
		if err != nil {
			return nil, err
		}
		enabled := builtin
		if state != nil && state.RuntimeEnabled != nil {
			enabled = *state.RuntimeEnabled
		}
		display := row.Name
		if builtin && row.Name == "beeftv-editing" {
			display = "Seal 剪辑"
		}
		if builtin && row.Name == "hypit" {
			display = "Hypit 视频制作"
		}
		if builtin && row.Name == "hyperframes" {
			display = "HyperFrames 视频创作"
		}
		if builtin && row.Name == "video-use" {
			display = "Video Use 视频理解与剪辑"
		}
		if builtin && row.Name == "skill-creator" {
			display = "Skill Creator 技能沉淀"
		}
		item := HubItem{ID: row.ID, Name: row.Name, DisplayName: display, Description: row.Description, Builtin: builtin, Enabled: enabled, Version: row.VersionLabel, ContentHash: row.ContentHash, FileCount: row.FileCount, UpdatedAt: row.UpdatedAt, SourceType: row.SourceType, SourceURL: row.SourceURL, SourceCommit: row.SourceCommit}
		if builtin && row.Name == "beeftv-editing" {
			item.Description = "通过对话调整剪辑轨道、片段时间、文字样式与基础音量。"
		}
		if builtin && row.Name == "hypit" {
			item.Description = "分析参考视频，制定复刻方案，制作素材与可编辑场景。"
		}
		if builtin && row.Name == "hyperframes" {
			item.Description = "官方工程、动画、关键帧、音频与工作流知识；候选场景检查后加入轨道。"
		}
		if builtin && row.Name == "video-use" {
			item.Description = "结合口播时间戳和真实画面理解素材、规划剪辑，并复查成片。"
		}
		if builtin && row.Name == "skill-creator" {
			item.Description = "创建和更新用户 Skill，沉淀可复用制作方法与明确的个人风格。"
		}
		if builtin && roots[row.Name] == "" {
			item.Problem = "内置 Skill 分发未安装"
			item.Enabled = false
		}
		if !builtin {
			if err := s.validateHubEntry(userID, &row); err != nil {
				item.Problem = err.Error()
				item.Enabled = false
			}
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Builtin && !items[j].Builtin })
	return items, nil
}
func (s *Service) HubList(userID string, roots map[string]string) ([]HubItem, error) {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	return s.hubRows(userID, roots)
}

func (s *Service) hubOwned(userID, id string) (*model.Skill, error) {
	row, err := s.repo.Skill(id)
	if err != nil {
		return nil, err
	}
	if row.SourceType == "runtime-builtin" {
		return row, nil
	}
	if row.OwnerID != userID || (row.SourceType != "markdown" && row.SourceType != "zip" && row.SourceType != "authored" && row.SourceType != "github") {
		return nil, kernel.BadAuthRequest("Skill 不属于当前本地工作区")
	}
	return row, nil
}

func (s *Service) HubInspect(userID string, roots map[string]string, filename string, data []byte, name, description string) (*HubPreview, error) {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	archive, missing, err := hubArchive(filename, data, name, description)
	if err != nil {
		return nil, err
	}
	result := &HubPreview{Name: archive.Metadata.Name, Description: archive.Metadata.Description, Version: archive.Metadata.Version, FileCount: len(archive.Files), Entry: string(archive.Files["SKILL.md"]), NeedsMetadata: missing}
	if missing {
		result.Name = name
		result.Description = description
		return result, nil
	}
	result.ContentHash = archive.ContentHash
	if reservedRuntimeSkillName(result.Name) {
		result.BuiltinConflict = true
	}
	rows, err := s.hubRows(userID, roots)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.Name == result.Name {
			result.ExistingID = row.ID
			result.BuiltinConflict = result.BuiltinConflict || row.Builtin
			break
		}
	}
	return result, nil
}

func (s *Service) HubInstall(userID string, roots map[string]string, filename string, data []byte, name, description, expectedHash, targetID string, enabled bool) (string, error) {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	archive, missing, err := hubArchive(filename, data, name, description)
	if err != nil {
		return "", err
	}
	if missing {
		return "", kernel.BadAuthRequest("请补全 Skill 标识和用途后读取预览")
	}
	if expectedHash == "" || expectedHash != archive.ContentHash {
		return "", kernel.BadAuthRequest("文件与预览不一致，请重新读取预览")
	}
	sourceType := "markdown"
	if strings.EqualFold(filepath.Ext(filename), ".zip") {
		sourceType = "zip"
	}
	return s.installHubArchive(userID, roots, archive, targetID, enabled, nil, hubOrigin{Type: sourceType})
}

type hubOrigin struct{ Type, URL, Ref, Subdir, Commit string }

// All imports share builtin protection, capacity, ownership and immutable versions.
// The caller holds hubMu; optional expectedTargetHash adds CAS to Agent updates.
func (s *Service) installHubArchive(userID string, roots map[string]string, archive skillPackageArchive, targetID string, enabled bool, expectedTargetHash *string, origin hubOrigin) (string, error) {
	if reservedRuntimeSkillName(archive.Metadata.Name) {
		return "", kernel.BadAuthRequest("不能覆盖内置 Skill 的标识")
	}
	rows, err := s.hubRows(userID, roots)
	if err != nil {
		return "", err
	}
	for _, row := range rows {
		if row.Name != archive.Metadata.Name {
			continue
		}
		if row.Builtin {
			return "", kernel.BadAuthRequest("不能覆盖内置 Skill 的标识")
		}
		if row.ID != targetID {
			if row.ContentHash == archive.ContentHash {
				return row.ID, s.applyHubReplayState(userID, row.ID, origin.Type, enabled)
			}
			return "", kernel.BadAuthRequest("同名 Skill 已安装，请选择更新现有 Skill")
		}
	}
	if targetID != "" {
		row, err := s.hubOwned(userID, targetID)
		if err != nil {
			return "", err
		}
		if row.SourceType == "runtime-builtin" {
			return "", kernel.BadAuthRequest("不能更新内置 Skill")
		}
		if row.Name != archive.Metadata.Name {
			return "", kernel.BadAuthRequest("更新文件的 name 必须与原 Skill 一致")
		}
		if row.ContentHash == archive.ContentHash {
			return row.ID, s.applyHubReplayState(userID, row.ID, origin.Type, enabled)
		}
		if expectedTargetHash != nil && row.ContentHash != *expectedTargetHash {
			return "", kernel.BadAuthRequest("Skill 已更新，请读取当前内容后再保存")
		}
		if (origin.Type == "authored" || origin.Type == "github") && enabled {
			if err := s.checkHubEnabledCapacity(userID, targetID); err != nil {
				return "", err
			}
		}
		row.Description = archive.Metadata.Description
		row.Instruction = string(archive.Files["SKILL.md"])
		if err = s.addSkillArchiveVersion(row, archive, origin.Type, origin.URL, origin.Ref, origin.Subdir, origin.Commit, false); err != nil {
			return "", err
		}
		if origin.Type == "authored" || origin.Type == "github" {
			err = s.repo.SetSkillRuntimeEnabled(userID, row.ID, enabled)
		} else {
			err = s.repo.BumpSkillRevision(userID)
		}
		if err != nil {
			return "", err
		}
		return row.ID, nil
	}
	if enabled {
		if err := s.checkHubEnabledCapacity(userID, ""); err != nil {
			return "", err
		}
	}
	created, err := s.createSkillFromArchive(userID, archive, SkillInstallRequest{Name: archive.Metadata.Name, Description: archive.Metadata.Description, IsPrivate: true, Tag: "others"}, origin.Type, origin.URL, origin.Ref, origin.Subdir, origin.Commit, false, enabled)
	if err != nil {
		return "", err
	}
	return created.SkillID, nil
}

func (s *Service) HubSetEnabled(userID, id string, enabled bool) error {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	row, err := s.hubOwned(userID, id)
	if err != nil {
		return err
	}
	if enabled {
		if err = s.validateHubEntry(userID, row); err != nil {
			return err
		}
		if err = s.checkHubEnabledCapacity(userID, id); err != nil {
			return err
		}
	}
	return s.repo.SetSkillRuntimeEnabled(userID, id, enabled)
}
func (s *Service) applyHubReplayState(userID, id, sourceType string, enabled bool) error {
	if sourceType != "authored" && sourceType != "github" {
		return nil
	}
	state, err := s.repo.UserSkillState(userID, id)
	if err != nil {
		return err
	}
	current := state != nil && state.RuntimeEnabled != nil && *state.RuntimeEnabled
	if current == enabled {
		return nil
	}
	if enabled {
		if err := s.checkHubEnabledCapacity(userID, id); err != nil {
			return err
		}
	}
	return s.repo.SetSkillRuntimeEnabled(userID, id, enabled)
}

func (s *Service) checkHubEnabledCapacity(userID, excludeID string) error {
	rows, err := s.repo.SkillHubRows(userID)
	if err != nil {
		return err
	}
	count := 0
	for _, row := range rows {
		if row.ID == excludeID {
			continue
		}
		state, err := s.repo.UserSkillState(userID, row.ID)
		if err != nil {
			return err
		}
		enabled := row.SourceType == "runtime-builtin"
		if state != nil && state.RuntimeEnabled != nil {
			enabled = *state.RuntimeEnabled
		}
		if enabled {
			count++
		}
	}
	if count >= 64 {
		return kernel.BadAuthRequest("最多同时启用 64 个 Skill，请先停用部分技能")
	}
	return nil
}
func (s *Service) validateHubEntry(userID string, row *model.Skill) error {
	file, err := s.SkillPackageFile(userID, row.ID, "SKILL.md")
	if err != nil {
		return err
	}
	archive, missing, err := hubArchive("SKILL.md", []byte(file.Content), "", "")
	if err != nil {
		return err
	}
	if missing || archive.Metadata.Name != row.Name {
		return kernel.BadAuthRequest("Skill 入口缺少有效的 name 或 description，请从本地更新")
	}
	return nil
}
func (s *Service) HubDelete(userID, id string) error {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	row, err := s.hubOwned(userID, id)
	if err != nil {
		return err
	}
	if row.SourceType == "runtime-builtin" {
		return kernel.BadAuthRequest("内置 Skill 只能停用，不能卸载")
	}
	if err = s.DeleteSkill(userID, id); err != nil {
		return err
	}
	return s.repo.BumpSkillRevision(userID)
}
func (s *Service) HubFile(userID, id, file string) (*SkillPackageFileContent, error) {
	if _, err := s.hubOwned(userID, id); err != nil {
		return nil, err
	}
	return s.SkillPackageFile(userID, id, file)
}
func (s *Service) HubFiles(userID, id string) ([]SkillPackageFileItem, error) {
	if _, err := s.hubOwned(userID, id); err != nil {
		return nil, err
	}
	return s.SkillPackageFiles(userID, id)
}

func (s *Service) HubSnapshot(userID string, roots map[string]string) (*RuntimeSkillSnapshot, error) {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	rows, err := s.hubRows(userID, roots)
	if err != nil {
		return nil, err
	}
	userDigest := sha256.Sum256([]byte(userID))
	scope := hex.EncodeToString(userDigest[:])
	snapshot := &RuntimeSkillSnapshot{UserScope: scope, Skills: []RuntimeSkill{}}
	for _, row := range rows {
		if !row.Enabled || row.Problem != "" {
			continue
		}
		root := filepath.Join(s.dataDir, "skill-runtime", scope, row.ID, row.ContentHash)
		if err = s.materializeSkill(root, userID, row.ID, row.ContentHash); err != nil {
			return nil, err
		}
		snapshot.Skills = append(snapshot.Skills, RuntimeSkill{ID: row.ID, Name: row.Name, DisplayName: row.DisplayName, Description: row.Description, Version: row.Version, ContentHash: row.ContentHash, Root: root})
	}
	if len(snapshot.Skills) > 64 {
		return nil, kernel.BadAuthRequest("最多同时启用 64 个 Skill，请停用部分技能")
	}
	revision, err := s.repo.SkillRuntimeRevision(userID)
	if err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(snapshot.Skills)
	digest := sha256.Sum256(encoded)
	snapshot.Revision = hex.EncodeToString(digest[:]) + "-" + strconv.FormatUint(revision, 10)
	return snapshot, nil
}

func (s *Service) materializeSkill(root, userID, id, hash string) error {
	if data, err := os.ReadFile(filepath.Join(root, ".content-hash")); err == nil && string(data) == hash {
		return nil
	}
	files, err := s.SkillPackageFiles(userID, id)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(root), 0o700); err != nil {
		return err
	}
	temporary, err := os.MkdirTemp(filepath.Dir(root), ".incoming-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temporary)
	for _, file := range files {
		name, err := normalizeSkillPath(file.Path)
		if err != nil {
			return err
		}
		_, _, _, data, err := s.readSkillPackageFile(userID, id, name)
		if err != nil {
			return err
		}
		target := filepath.Join(temporary, filepath.FromSlash(name))
		if err = os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		if err = os.WriteFile(target, data, 0o600); err != nil {
			return err
		}
	}
	if err = os.WriteFile(filepath.Join(temporary, ".content-hash"), []byte(hash), 0o600); err != nil {
		return err
	}
	if err = os.Rename(temporary, root); err != nil {
		return err
	}
	return nil
}

func HubUploadBytes(reader io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, maxSkillPackageBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxSkillPackageBytes {
		return nil, kernel.BadAuthRequest("Skill 包不能超过 20MB")
	}
	return data, nil
}
